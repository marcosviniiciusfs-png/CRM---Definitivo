
# Plano: Painel Lateral Direito com Estatísticas + Conquistas Dinâmicas

## Visão Geral

Criar um painel lateral que ocupa o espaço vazio à direita do ranking, exibindo:
1. **Estatísticas Rápidas (KPIs)** - Métricas consolidadas do período
2. **Conquistas/Badges** - Destaques e recordes baseados no tipo de ordenação

O conteúdo se adapta dinamicamente ao filtro selecionado (`task_points`, `revenue`, `won_leads`, `percentage`).

---

## Layout Proposto

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                        │
│  ┌─────────────┐  ┌──────────────────────┐  ┌─────────────────────────────────────────┐│
│  │   PÓDIO     │  │  LISTA DE RANKING    │  │       PAINEL LATERAL                   ││
│  │   TOP 3     │  │                      │  │                                         ││
│  │             │  │  [1] Mateus  [Eq] 0pt│  │  ┌─────────────────────────────────────┐││
│  │  🥈  🥇  🥉 │  │  [2] Marcos  [Eq] 0pt│  │  │ 📊 RESUMO DO PERÍODO                │││
│  │             │  │  [3] Kerlys  [Eq] 0pt│  │  │                                     │││
│  │             │  │                      │  │  │  Total Pontos: 156                  │││
│  │             │  │                      │  │  │  Tarefas Concluídas: 42             │││
│  │             │  │                      │  │  │  Taxa de Pontualidade: 85%          │││
│  │             │  │                      │  │  │  Média por Membro: 52 pts           │││
│  │             │  │                      │  │  └─────────────────────────────────────┘││
│  │             │  │                      │  │                                         ││
│  │             │  │                      │  │  ┌─────────────────────────────────────┐││
│  │             │  │                      │  │  │ 🏆 DESTAQUES                        │││
│  │             │  │                      │  │  │                                     │││
│  │             │  │                      │  │  │  ⚡ Mais Produtivo                  │││
│  │             │  │                      │  │  │     Mateus - 156 pts                │││
│  │             │  │                      │  │  │                                     │││
│  │             │  │                      │  │  │  ⏱️ Mais Pontual                    │││
│  │             │  │                      │  │  │     Marcos - 95% no prazo           │││
│  │             │  │                      │  │  │                                     │││
│  │             │  │                      │  │  │  🔥 Maior Volume                    │││
│  │             │  │                      │  │  │     Kerlys - 18 tarefas             │││
│  │             │  │                      │  │  └─────────────────────────────────────┘││
│  └─────────────┘  └──────────────────────┘  └─────────────────────────────────────────┘│
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Métricas por Tipo de Ordenação

### 1. `task_points` (Pontos de Tarefas)
**Estatísticas:**
- Total de Pontos no Período
- Total de Tarefas Concluídas
- Taxa de Pontualidade (%)
- Média de Pontos por Membro

**Destaques:**
- ⚡ Mais Produtivo (maior pontuação)
- ⏱️ Mais Pontual (maior % entregas no prazo)
- 🔥 Maior Volume (mais tarefas concluídas)

---

### 2. `revenue` (Faturamento)
**Estatísticas:**
- Faturamento Total no Período
- Ticket Médio
- Total de Vendas (leads won)
- Média por Vendedor

**Destaques:**
- 💰 Maior Faturamento (valor total)
- 🎯 Melhor Ticket (maior ticket médio)
- 📈 Mais Consistente (mais vendas)

---

### 3. `won_leads` (Vendas)
**Estatísticas:**
- Total de Vendas Fechadas
- Leads em Negociação
- Taxa de Conversão (%)
- Média de Vendas por Membro

**Destaques:**
- 🏆 Campeão de Vendas (mais leads won)
- 🎯 Melhor Conversão (maior taxa)
- 📊 Maior Volume (mais leads trabalhados)

---

### 4. `percentage` (Porcentagem da Meta)
**Estatísticas:**
- Média de Atingimento (%)
- Membros Acima da Meta
- Membros Abaixo da Meta
- Meta Total vs Realizado

**Destaques:**
- 🎯 Superou a Meta (maior % acima de 100%)
- 📈 Mais Próximo (maior % abaixo de 100%)
- 🔥 Consistente (menores variações)

---

## Mudanças Técnicas

### Parte 1: Criar Componente RankingSidePanel

**Novo Arquivo:** `src/components/dashboard/RankingSidePanel.tsx`

```typescript
interface RankingSidePanelProps {
  data: LeaderboardData[];
  sortBy: "revenue" | "won_leads" | "percentage" | "task_points";
  type: "sales" | "tasks";
  period: string;
}

export function RankingSidePanel({ data, sortBy, type, period }: RankingSidePanelProps) {
  // Calcula estatísticas e destaques baseado no sortBy
  const stats = useMemo(() => calculateStats(data, sortBy), [data, sortBy]);
  const highlights = useMemo(() => calculateHighlights(data, sortBy), [data, sortBy]);
  
  return (
    <div className="space-y-4">
      {/* Seção de Estatísticas */}
      <Card className="p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4" />
          Resumo do Período
        </h4>
        {/* KPIs dinâmicos */}
      </Card>
      
      {/* Seção de Destaques */}
      <Card className="p-4">
        <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-yellow-500" />
          Destaques
        </h4>
        {/* Badges de conquistas */}
      </Card>
    </div>
  );
}
```

---

### Parte 2: Atualizar Layout do TaskLeaderboard

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

Alterar o grid principal (linha 430) para incluir 3 colunas:

De:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
```

Para:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[auto_auto_1fr] gap-6 items-start">
  {/* Pódio */}
  {/* Lista de Ranking */}
  {/* Painel Lateral (novo) */}
</div>
```

---

### Parte 3: Passar Props Adicionais

**Arquivo:** `src/pages/Ranking.tsx`

Passar `period` para o componente TaskLeaderboard:

```tsx
<TaskLeaderboard 
  data={data} 
  isLoading={isLoading} 
  sortBy={sortBy}
  type={rankingType}
  period={period} // NOVO
/>
```

---

### Parte 4: Lógica de Cálculo de Estatísticas

```typescript
function calculateStats(data: LeaderboardData[], sortBy: SortType) {
  switch (sortBy) {
    case "task_points":
      const totalPoints = data.reduce((sum, d) => sum + (d.task_points || 0), 0);
      const totalTasks = data.reduce((sum, d) => sum + (d.tasks_completed || 0), 0);
      const totalOnTime = data.reduce((sum, d) => sum + (d.tasks_on_time || 0), 0);
      return {
        totalPoints,
        totalTasks,
        onTimeRate: totalTasks > 0 ? Math.round((totalOnTime / totalTasks) * 100) : 0,
        avgPerMember: data.length > 0 ? Math.round(totalPoints / data.length) : 0,
      };
    
    case "revenue":
      const totalRevenue = data.reduce((sum, d) => sum + (d.total_revenue || 0), 0);
      const totalSales = data.reduce((sum, d) => sum + (d.won_leads || 0), 0);
      return {
        totalRevenue,
        avgTicket: totalSales > 0 ? totalRevenue / totalSales : 0,
        totalSales,
        avgPerSeller: data.length > 0 ? totalRevenue / data.length : 0,
      };
    
    // ... outros casos
  }
}
```

---

### Parte 5: Lógica de Cálculo de Destaques

```typescript
function calculateHighlights(data: LeaderboardData[], sortBy: SortType) {
  if (data.length === 0) return [];
  
  switch (sortBy) {
    case "task_points":
      const topProducer = [...data].sort((a, b) => (b.task_points || 0) - (a.task_points || 0))[0];
      const mostPunctual = [...data].sort((a, b) => {
        const rateA = (a.tasks_completed || 0) > 0 ? (a.tasks_on_time || 0) / a.tasks_completed : 0;
        const rateB = (b.tasks_completed || 0) > 0 ? (b.tasks_on_time || 0) / b.tasks_completed : 0;
        return rateB - rateA;
      })[0];
      const highestVolume = [...data].sort((a, b) => (b.tasks_completed || 0) - (a.tasks_completed || 0))[0];
      
      return [
        { icon: Zap, label: "Mais Produtivo", user: topProducer, value: `${topProducer.task_points || 0} pts` },
        { icon: Clock, label: "Mais Pontual", user: mostPunctual, value: `${calcRate(mostPunctual)}%` },
        { icon: Flame, label: "Maior Volume", user: highestVolume, value: `${highestVolume.tasks_completed || 0} tarefas` },
      ];
    
    // ... outros casos
  }
}
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/dashboard/RankingSidePanel.tsx` | CRIAR | Novo componente do painel lateral |
| `src/components/dashboard/TaskLeaderboard.tsx` | MODIFICAR | Adicionar terceira coluna e integrar painel |
| `src/pages/Ranking.tsx` | MODIFICAR | Passar `period` como prop |

---

## Componentes Visuais do Painel

### Card de Estatística

```tsx
<div className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
  <span className="text-xs text-muted-foreground">{label}</span>
  <span className="text-sm font-bold">{value}</span>
</div>
```

### Card de Destaque

```tsx
<div className="flex items-center gap-3 p-2 rounded-lg bg-muted/50">
  <div className="p-1.5 rounded-md bg-yellow-500/20">
    <Icon className="h-4 w-4 text-yellow-500" />
  </div>
  <div className="flex-1 min-w-0">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium truncate">{userName}</p>
  </div>
  <span className="text-xs font-bold text-primary">{value}</span>
</div>
```

---

## Responsividade

- **Desktop (lg+):** 3 colunas - Pódio | Lista | Painel
- **Tablet (md):** 2 colunas - Pódio acima, Lista e Painel lado a lado
- **Mobile (sm):** 1 coluna - Pódio > Lista > Painel empilhados

---

## Checklist de Validação

1. **Estatísticas Dinâmicas:**
   - [ ] Muda quando alterna entre Pontos/Faturamento/Vendas/Porcentagem
   - [ ] Valores calculados corretamente com base nos dados filtrados
   - [ ] Formatação apropriada (moeda para R$, % para taxas)

2. **Destaques Dinâmicos:**
   - [ ] Identifica corretamente o líder de cada categoria
   - [ ] Mostra avatar e nome do colaborador
   - [ ] Ícones apropriados para cada tipo de conquista

3. **Layout:**
   - [ ] Painel ocupa o espaço vazio à direita
   - [ ] Não compete visualmente com o pódio/lista
   - [ ] Responsivo em todas as telas

4. **Performance:**
   - [ ] Cálculos memoizados para evitar recálculos desnecessários
   - [ ] Sem flash/flicker ao trocar filtros
