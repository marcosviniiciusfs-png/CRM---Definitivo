
# Plano: Sistema de Pontuação e Ranking de Tarefas

## Resumo Executivo

Este plano adiciona ao Ranking existente a capacidade de:
1. Filtrar por "Esta Semana" além dos períodos atuais
2. Adicionar ranking baseado em tarefas (Kanban) com sistema de pontuação
3. Criar lógica de pontuação configurável por tipo de conclusão

---

## Sistema de Pontuação Proposto

| Situação | Pontos | Descrição |
|----------|--------|-----------|
| Tarefa concluída (base) | **2 pontos** | Sempre que uma tarefa entra na etapa de conclusão |
| Concluiu dentro do prazo (due_date) | **+1 ponto** | Tarefa com data limite foi concluída antes do due_date |
| Concluiu dentro do cronômetro (timer) | **+3 pontos** | Tarefa com estimated_time foi concluída antes do tempo esgotar |

**Combinações possíveis:**
- Tarefa sem prazo/timer: 2 pontos (base)
- Tarefa com prazo, concluída no prazo: 3 pontos (2 + 1)
- Tarefa com prazo, concluída atrasada: 2 pontos (base)
- Tarefa com timer, concluída no tempo: 5 pontos (2 + 3)
- Tarefa com timer, concluída atrasada: 2 pontos (base)

---

## Arquitetura da Solução

### Parte 1: Nova Tabela para Registro de Pontuação

Para calcular pontuação de forma precisa, precisamos criar uma tabela que registre quando uma tarefa foi concluída e os critérios de pontuação:

```sql
CREATE TABLE task_completion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  card_id UUID NOT NULL REFERENCES kanban_cards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Critérios de pontuação
  had_due_date BOOLEAN DEFAULT false,
  was_on_time_due_date BOOLEAN DEFAULT false,  -- Concluiu antes do due_date?
  had_timer BOOLEAN DEFAULT false,
  was_on_time_timer BOOLEAN DEFAULT false,     -- Concluiu antes do estimated_time?
  
  -- Pontos calculados
  base_points INTEGER NOT NULL DEFAULT 2,
  bonus_due_date INTEGER DEFAULT 0,  -- +1 se was_on_time_due_date
  bonus_timer INTEGER DEFAULT 0,     -- +3 se was_on_time_timer
  total_points INTEGER GENERATED ALWAYS AS (base_points + bonus_due_date + bonus_timer) STORED,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas eficientes
CREATE INDEX idx_task_completion_logs_org ON task_completion_logs(organization_id);
CREATE INDEX idx_task_completion_logs_user ON task_completion_logs(user_id);
CREATE INDEX idx_task_completion_logs_completed_at ON task_completion_logs(completed_at);
CREATE UNIQUE INDEX idx_task_completion_unique ON task_completion_logs(card_id, user_id);
```

### Parte 2: Registrar Pontuação ao Concluir Tarefas

**Arquivo:** `src/components/KanbanBoard.tsx` (handleDragEnd)

Quando uma tarefa é movida para a etapa de conclusão (`is_completion_stage`), registrar a pontuação:

```typescript
// Ao mover para coluna de conclusão
if (targetColumn.is_completion_stage && !sourceColumn.is_completion_stage) {
  // Calcular pontuação
  const now = new Date();
  
  const hadDueDate = !!card.due_date;
  const wasOnTimeDueDate = hadDueDate && new Date(card.due_date) >= now;
  
  const hadTimer = !!(card.estimated_time && card.timer_started_at && !card.due_date);
  let wasOnTimeTimer = false;
  
  if (hadTimer && card.timer_started_at && card.estimated_time) {
    const timerStart = new Date(card.timer_started_at);
    const elapsedMinutes = Math.floor((now.getTime() - timerStart.getTime()) / 60000);
    wasOnTimeTimer = elapsedMinutes <= card.estimated_time;
  }
  
  // Buscar assignees para dar pontos a cada um
  const { data: assignees } = await supabase
    .from("kanban_card_assignees")
    .select("user_id")
    .eq("card_id", card.id);
    
  for (const assignee of assignees || [{ user_id: card.created_by }]) {
    await supabase.from("task_completion_logs").upsert({
      organization_id: organizationId,
      card_id: card.id,
      user_id: assignee.user_id,
      had_due_date: hadDueDate,
      was_on_time_due_date: wasOnTimeDueDate,
      had_timer: hadTimer,
      was_on_time_timer: wasOnTimeTimer,
      base_points: 2,
      bonus_due_date: wasOnTimeDueDate ? 1 : 0,
      bonus_timer: wasOnTimeTimer ? 3 : 0,
    }, { onConflict: 'card_id,user_id' });
  }
}
```

**Arquivo:** `src/components/CollaborativeTaskApproval.tsx`

Quando uma tarefa colaborativa é finalizada (todos confirmaram), registrar pontuação para cada membro:

```typescript
// Dentro da confirmMutation, após mover para conclusão
if (newCompletedCount === totalAssignees && completionColumn) {
  // Buscar dados do card para calcular pontuação
  const { data: cardDetails } = await supabase
    .from("kanban_cards")
    .select("due_date, estimated_time, timer_started_at")
    .eq("id", cardId)
    .single();
    
  // ... calcular pontuação e inserir para cada assignee
}
```

### Parte 3: Atualizar o Ranking.tsx

**Modificações necessárias:**

1. **Adicionar tipo de ranking:** `"tasks"` para pontuação de tarefas
2. **Adicionar período "week":** Para filtrar por semana
3. **Buscar dados de tarefas:** Query na tabela `task_completion_logs`

```typescript
type PeriodType = "week" | "month" | "quarter" | "year";
type SortType = "revenue" | "won_leads" | "percentage" | "task_points";
type RankingType = "sales" | "tasks";

// Nova função de intervalo
const getDateRange = (periodType: PeriodType) => {
  const now = new Date();
  switch (periodType) {
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    // ... outros casos
  }
};

// Nova função para buscar dados de tarefas
const loadTasksData = async () => {
  const { start, end } = getDateRange(period);
  
  const { data: taskLogs } = await supabase
    .from('task_completion_logs')
    .select('user_id, total_points, completed_at')
    .eq('organization_id', organizationId)
    .gte('completed_at', start.toISOString())
    .lte('completed_at', end.toISOString());
    
  // Agrupar por user_id e somar pontos
  // ...
};
```

### Parte 4: Atualizar Interface SalesLeaderboard

**Arquivo:** `src/components/dashboard/SalesLeaderboard.tsx`

Expandir o componente para suportar múltiplos tipos de ranking:

```typescript
export interface LeaderboardData {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  // Métricas de vendas
  won_leads?: number;
  total_leads?: number;
  total_revenue?: number;
  target?: number;
  // Métricas de tarefas (novo)
  task_points?: number;
  tasks_completed?: number;
  tasks_on_time?: number;
}

interface LeaderboardProps {
  data: LeaderboardData[];
  isLoading?: boolean;
  sortBy?: "revenue" | "won_leads" | "percentage" | "task_points";
  type?: "sales" | "tasks";
}
```

---

## Fluxo de Usuário Atualizado

```
┌─────────────────────────────────────────────────────────────────────┐
│ Página de Ranking                                                    │
├─────────────────────────────────────────────────────────────────────┤
│ Filtros:                                                             │
│                                                                      │
│ [📊 Tipo] → Vendas | Tarefas ← NOVO                                  │
│                                                                      │
│ [Ordenar] → Ord. Faturamento | Ord. Vendas | Ord. Porcentagem       │
│           → Ord. Pontos ← NOVO (quando tipo = Tarefas)               │
│                                                                      │
│ [Período] → Esta Semana ← NOVO                                       │
│           → Este Mês | Este Trimestre | Este Ano                     │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Exibição (quando tipo = Tarefas):                                   │
│                                                                      │
│ Top 3 no pódio:                                                      │
│   🥇 Mateus - 47 pts (15 tarefas)                                   │
│   🥈 Marcos - 38 pts (12 tarefas)                                   │
│   🥉 Kerlys - 29 pts (10 tarefas)                                   │
│                                                                      │
│ Lista completa com breakdown:                                       │
│   [Avatar] Mateus - 47 pts | 15 tarefas | 12 no prazo               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar/Criar

| Arquivo | Alteração |
|---------|-----------|
| **Migration SQL** | Criar tabela `task_completion_logs` |
| `src/pages/Ranking.tsx` | Adicionar filtros de tipo, semana e lógica de busca de tarefas |
| `src/components/dashboard/SalesLeaderboard.tsx` | Expandir para suportar ranking de tarefas |
| `src/components/KanbanBoard.tsx` | Registrar pontuação ao mover para conclusão |
| `src/components/CollaborativeTaskApproval.tsx` | Registrar pontuação ao completar tarefa colaborativa |

---

## Detalhes Técnicos de Implementação

### Lógica de Cálculo de Pontos

Para determinar se uma tarefa foi concluída "no prazo", usamos:

**Com due_date (prazo fixo):**
```typescript
const wasOnTime = new Date(card.due_date) >= new Date(); // Ainda não venceu
```

**Com timer (cronômetro):**
```typescript
const timerStart = new Date(card.timer_started_at);
const elapsedMinutes = Math.floor((Date.now() - timerStart.getTime()) / 60000);
const wasOnTime = elapsedMinutes <= card.estimated_time;
```

### Query para Ranking de Tarefas

```sql
SELECT 
  user_id,
  COUNT(*) as tasks_completed,
  SUM(total_points) as total_points,
  COUNT(*) FILTER (WHERE was_on_time_due_date OR was_on_time_timer) as tasks_on_time
FROM task_completion_logs
WHERE organization_id = $1
  AND completed_at >= $2
  AND completed_at <= $3
GROUP BY user_id
ORDER BY total_points DESC;
```

---

## Considerações de UX

1. **Alternância clara:** Usuário escolhe entre "Ranking de Vendas" e "Ranking de Tarefas"
2. **Feedback visual:** Badge de pontos mostrado de forma destacada no pódio e lista
3. **Tooltip explicativo:** Ao passar mouse sobre pontos, mostrar breakdown (2 base + 3 timer = 5)
4. **Empty state:** Mensagem quando não há tarefas concluídas no período

---

## Checklist de Validação

Após implementação:

1. **Filtro de Período:**
   - [ ] "Esta Semana" filtra corretamente (segunda a domingo)
   - [ ] Todos os outros períodos continuam funcionando

2. **Sistema de Pontuação:**
   - [ ] Tarefa sem prazo/timer = 2 pontos
   - [ ] Tarefa com due_date concluída no prazo = 3 pontos
   - [ ] Tarefa com timer concluída no tempo = 5 pontos
   - [ ] Tarefa atrasada = apenas 2 pontos base

3. **Registro de Pontuação:**
   - [ ] Ao arrastar tarefa para conclusão, pontos são registrados
   - [ ] Ao confirmar tarefa colaborativa, pontos são registrados para todos
   - [ ] Pontos não são duplicados (upsert com onConflict)

4. **Interface do Ranking:**
   - [ ] Alternar entre Vendas e Tarefas funciona
   - [ ] Ordenação por pontos funciona
   - [ ] Período de semana funciona
   - [ ] Top 3 exibe corretamente para tarefas

5. **Integridade:**
   - [ ] Tarefas antigas sem timer_started_at não quebram o cálculo
   - [ ] RLS policies permitem leitura/escrita apropriada
