
# Plano: Otimizações das Tarefas Colaborativas no Kanban

## Resumo dos Problemas Identificados

### 1. Movimentação Automática de Tarefas Colaborativas
**Problema:** Quando um colaborador marca sua parte como concluída, nada acontece automaticamente. A tarefa permanece na mesma etapa, mesmo quando TODOS os colaboradores confirmam.

**Comportamento Esperado:**
- Quando **o primeiro colaborador** confirma → tarefa avança para **próxima etapa**
- Quando **todos os colaboradores** confirmam → tarefa move para a **etapa de conclusão** (`is_completion_stage = true`)

### 2. Cronômetro Não Ativa na Etapa Selecionada
**Problema:** O timer não está iniciando quando a tarefa entra na coluna configurada porque:
- Tarefas antigas não possuem `timer_start_column_id` definido
- A lógica de ativação do timer existe apenas no `handleDragEnd`, mas não verifica corretamente todos os casos

### 3. Edição do Timer em Tarefas Existentes
**Problema:** No formulário de edição (`KanbanCard.tsx`), não existe a opção de selecionar/alterar a etapa onde o cronômetro deve iniciar. Esta funcionalidade existe apenas na criação de novas tarefas.

---

## Solução Proposta

### Parte 1: Movimentação Automática de Tarefas Colaborativas

**Arquivo:** `src/components/CollaborativeTaskApproval.tsx`

Adicionar lógica na `confirmMutation` para mover a tarefa automaticamente:

```typescript
// Após confirmar conclusão do usuário atual:
const totalAssignees = assignees.length;
const newCompletedCount = completedCount + 1;

// Buscar posição atual e próxima coluna
const { data: card } = await supabase
  .from("kanban_cards")
  .select("column_id")
  .eq("id", cardId)
  .single();

const { data: columns } = await supabase
  .from("kanban_columns")
  .select("id, title, position, is_completion_stage")
  .eq("board_id", boardId)
  .order("position");

const currentColumnIndex = columns.findIndex(c => c.id === card.column_id);

if (newCompletedCount === totalAssignees) {
  // TODOS confirmaram → mover para etapa de conclusão
  const completionColumn = columns.find(c => c.is_completion_stage);
  if (completionColumn) {
    await supabase
      .from("kanban_cards")
      .update({ column_id: completionColumn.id })
      .eq("id", cardId);
  }
} else if (newCompletedCount === 1) {
  // PRIMEIRO a confirmar → mover para próxima etapa
  const nextColumn = columns[currentColumnIndex + 1];
  if (nextColumn && !nextColumn.is_completion_stage) {
    await supabase
      .from("kanban_cards")
      .update({ column_id: nextColumn.id })
      .eq("id", cardId);
  }
}
```

### Parte 2: Seletor de Etapa do Timer na Edição

**Arquivo:** `src/components/KanbanCard.tsx`

Adicionar no formulário de edição:
1. Estado para armazenar `editTimerStartColumnId`
2. Carregar colunas do Kanban disponíveis
3. Componente `Select` para escolher a etapa do timer
4. Incluir no objeto `updates` ao salvar

```tsx
// Novo estado
const [editTimerStartColumnId, setEditTimerStartColumnId] = useState<string | null>(null);
const [kanbanColumns, setKanbanColumns] = useState<{id: string, title: string}[]>([]);

// Carregar ao entrar em modo de edição
useEffect(() => {
  if (isEditing) {
    // ... código existente
    loadKanbanColumns();
    setEditTimerStartColumnId(card.timer_start_column_id || null);
  }
}, [isEditing]);

// No formulário de edição (quando há tempo estimado)
{editEstimatedTime && !editDueDate && (
  <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
    <label className="text-xs font-medium flex items-center gap-1">
      <Timer className="h-3 w-3" />
      Iniciar cronômetro quando entrar em:
    </label>
    <Select 
      value={editTimerStartColumnId || "immediate"} 
      onValueChange={(val) => setEditTimerStartColumnId(val === "immediate" ? null : val)}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="immediate">Imediatamente</SelectItem>
        {kanbanColumns.map(col => (
          <SelectItem key={col.id} value={col.id}>
            Quando entrar em "{col.title}"
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

### Parte 3: Corrigir Lógica de Ativação do Timer

**Arquivo:** `src/components/KanbanBoard.tsx`

Atualizar a função `updateCard` para incluir `timer_start_column_id`:

```typescript
const updateCard = async (...) => {
  const dbUpdates: any = {
    // ... campos existentes
    timer_start_column_id: cardUpdates.timer_start_column_id !== undefined 
      ? cardUpdates.timer_start_column_id 
      : undefined,
  };

  // Se timer_start_column_id foi definido para a coluna atual, iniciar timer
  if (cardUpdates.timer_start_column_id && cardUpdates.estimated_time && !cardUpdates.due_date) {
    const column = columns.find(col => col.cards.some(c => c.id === cardId));
    if (column?.id === cardUpdates.timer_start_column_id) {
      dbUpdates.timer_started_at = new Date().toISOString();
    }
  }
};
```

---

## Fluxo Esperado Após Correções

### Cenário 1: Tarefa Colaborativa com 3 Membros

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tarefa "Relatórios" - Etapa: "A Fazer" - Colaboradores: 0/3        │
└─────────────────────────────────────────────────────────────────────┘
                            │
      Marcos clica "Confirmar Conclusão" ───────────────────────────────►
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Tarefa "Relatórios" - Etapa: "Fazendo" ← MOVEU AUTOMATICAMENTE     │
│ Colaboradores: 1/3 (Marcos ✓, Mateus ⏳, Kerlys ⏳)                 │
└─────────────────────────────────────────────────────────────────────┘
                            │
      Mateus confirma... Kerlys confirma... ────────────────────────────►
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Tarefa "Relatórios" - Etapa: "Concluído" ← TODOS CONFIRMARAM       │
│ Colaboradores: 3/3 ✓ - TAREFA FINALIZADA                           │
└─────────────────────────────────────────────────────────────────────┘
```

### Cenário 2: Timer na Etapa Específica

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tarefa "Nortecon" - Etapa: "A Fazer"                                │
│ Tempo: 3h 40m | Timer: Aguardando entrar em "Fazendo"              │
└─────────────────────────────────────────────────────────────────────┘
                            │
      Usuário arrasta para "Fazendo" ───────────────────────────────────►
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Tarefa "Nortecon" - Etapa: "Fazendo"                                │
│ Timer: ⏱️ 3h 39m restante ← TIMER INICIOU AUTOMATICAMENTE           │
│ Toast: "Cronômetro Iniciado"                                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/CollaborativeTaskApproval.tsx` | Adicionar lógica de movimentação automática após confirmação |
| `src/components/KanbanCard.tsx` | Adicionar seletor de etapa do timer no formulário de edição |
| `src/components/KanbanBoard.tsx` | Atualizar `updateCard` para suportar `timer_start_column_id` |

---

## Detalhes Técnicos

### Regras de Negócio para Movimentação Colaborativa

1. **Primeira confirmação** (1/N):
   - Mover tarefa para a **próxima coluna** (posição + 1)
   - Não mover se a próxima for `is_completion_stage`

2. **Confirmação final** (N/N):
   - Mover tarefa para a coluna com `is_completion_stage = true`
   - Se não existir coluna de conclusão, manter na atual

3. **Confirmações intermediárias** (2/N até N-1/N):
   - Apenas atualiza o progresso visual
   - Não move a tarefa

### Lógica do Timer

1. Timer só ativa se:
   - `estimated_time` está definido
   - `due_date` NÃO está definido (timer substitui prazo)
   - A tarefa está na coluna definida em `timer_start_column_id`

2. Se `timer_start_column_id` for `NULL`:
   - Timer inicia imediatamente ao criar a tarefa

---

## Checklist de Validação

Após implementação:

1. **Tarefas Colaborativas:**
   - [ ] Primeiro a confirmar → tarefa move para próxima etapa
   - [ ] Todos confirmarem → tarefa move para "Concluído"
   - [ ] Toast de feedback aparece após movimentação
   - [ ] Interface atualiza em tempo real

2. **Cronômetro:**
   - [ ] Editar tarefa antiga mostra seletor de etapa
   - [ ] Timer inicia ao entrar na etapa configurada
   - [ ] Toast "Cronômetro Iniciado" aparece
   - [ ] Contagem regressiva funciona corretamente

3. **Edição Geral:**
   - [ ] Todos os campos salvam corretamente
   - [ ] Tarefas antigas podem ter timer configurado
