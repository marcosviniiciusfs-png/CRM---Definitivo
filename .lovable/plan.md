
# Plano: Ajustes no Ranking - Ordenação e Largura dos Cards

## Problemas Identificados

### 1. Ordenação Incompleta
Atualmente, quando o usuário seleciona "Tarefas", o seletor de ordenação mostra apenas "Ord. Pontos". O esperado é que todas as opções de ordenação estejam disponíveis para ambos os tipos de ranking.

### 2. Cards Muito Largos
Os cards de ranking ocupam 100% da largura (`w-full`), deixando muito espaço vazio e poucas informações visíveis. A solução é exibir os cards em grid de 2 colunas e reduzir a largura individual.

---

## Solução Proposta

### Parte 1: Corrigir Ordenação no Ranking.tsx

**Arquivo:** `src/pages/Ranking.tsx`

Modificar o Select de ordenação (linhas 278-293) para mostrar todas as opções disponíveis, independente do tipo de ranking:

```tsx
<Select value={sortBy} onValueChange={(v) => setSortBy(v as SortType)}>
  <SelectTrigger className="w-[160px]">
    <SelectValue placeholder="Ordenar por" />
  </SelectTrigger>
  <SelectContent>
    {/* Opções de Tarefas */}
    {rankingType === "tasks" && (
      <SelectItem value="task_points">Ord. Pontos</SelectItem>
    )}
    {/* Opções de Vendas - sempre visíveis em ambos os tipos */}
    <SelectItem value="revenue">Ord. Faturamento</SelectItem>
    <SelectItem value="won_leads">Ord. Vendas</SelectItem>
    <SelectItem value="percentage">Ord. Porcentagem</SelectItem>
  </SelectContent>
</Select>
```

### Parte 2: Reduzir Largura dos Cards no TaskLeaderboard.tsx

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

1. **Mudar layout da lista para grid de 2 colunas** (linha 423):
   - De: `<div className="space-y-2 max-h-[500px]...">`
   - Para: `<div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[500px]...">`

2. **Ajustar largura máxima do RankingCard** (linha 248-249):
   - De: `className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all w-full"`
   - Para: `className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all"`
   - Remover o `w-full` para que o card seja dimensionado pelo grid

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Ranking.tsx` | Mostrar todas as opções de ordenação para ambos os tipos |
| `src/components/dashboard/TaskLeaderboard.tsx` | Grid de 2 colunas para a lista de ranking |

---

## Resultado Visual Esperado

```
┌─────────────────────────────────────────────────────────────────────┐
│ Filtros: [Tarefas ▼] [Ord. Pontos ▼] [Esta Semana ▼]               │
│                       ├─ Ord. Pontos ✓                              │
│                       ├─ Ord. Faturamento                           │
│                       ├─ Ord. Vendas                                │
│                       └─ Ord. Porcentagem                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Pódio Top 3                     │  Lista em 2 colunas:             │
│                                 │  ┌──────────────┬──────────────┐ │
│   🥈      🥇      🥉            │  │ 1. Mateus    │ 2. Marcos    │ │
│  Marcos  Mateus  Kerlys         │  │ 5 pts        │ 4 pts        │ │
│                                 │  ├──────────────┼──────────────┤ │
│                                 │  │ 3. Kerlys    │ 4. User      │ │
│                                 │  │ 3 pts        │ 2 pts        │ │
│                                 │  └──────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Checklist de Validação

1. **Ordenação:**
   - [ ] Tipo "Tarefas" mostra opções: Pontos, Faturamento, Vendas, Porcentagem
   - [ ] Tipo "Vendas" mostra opções: Faturamento, Vendas, Porcentagem
   - [ ] Ordenação default é correta para cada tipo

2. **Layout dos Cards:**
   - [ ] Cards aparecem em 2 colunas no desktop
   - [ ] Cards aparecem em 1 coluna no mobile
   - [ ] Largura reduzida em ~50% comparado ao atual
