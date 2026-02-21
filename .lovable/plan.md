

# Redesign do Dashboard - Metricas Automaticas com Previsao de Vendas

## O que muda

Reescrever o Dashboard (`/dashboard`) para ser um painel de metricas 100% automaticas, sem metas manuais, sem Facebook, sem WhatsApp. Adicionar previsao de vendas e faturamento baseada nos dados historicos do banco.

## O que sera REMOVIDO do Dashboard atual

- Card de "Metas" (definicao manual pelo usuario)
- Dialog de editar meta
- Todo o codigo de `loadGoal`, `loadSalesTotal`, `handleEditGoal`, `handleSaveGoal`
- Estados: `goalId`, `totalValue`, `currentValue`, `deadline`, `editTotalValue`, `editDeadline`, `salesBeforeDeadline`, `salesAfterDeadline`, `goalDurationDays`, `goalCreatedAt`
- Card de "Ultima Contribuicao" (sera simplificado e integrado ao layout)

## O que sera MANTIDO

- MetricCards de Novos Leads, Novos Clientes, Receita do Mes, Ticket Medio, Taxa de Perda (com useQuery ja implementado)
- Card de Taxa de Conversao (com grafico de barras dos ultimos 6 meses)
- Card de Top 5 Vendedores
- Real-time subscriptions via queryClient.invalidateQueries

## O que sera ADICIONADO

### 1. Card "Previsao de Faturamento"

Calculo automatico baseado no pipeline ativo:
- Buscar todos os leads ativos (nao-won/nao-lost) com `valor > 0`
- Para cada etapa do funil, calcular uma taxa historica de conversao (leads que sairam daquela etapa e chegaram a won / total que passaram por ela)
- `forecast = SUM(lead.valor * taxa_conversao_da_etapa)`
- Exibir como MetricCard com icone de TrendingUp

Query:
```
1. Buscar funnel_stages (custom) com seus IDs
2. Buscar leads ativos agrupados por funnel_stage_id, somando valor
3. Buscar taxa historica: dos ultimos 90 dias, quantos leads que estavam em cada stage acabaram em won
4. Multiplicar valor_por_stage * taxa_historica
```

### 2. Card "Receita Prevista (Proximo Mes)"

Baseado na media dos ultimos 3 meses de receita (leads won):
- Buscar leads won dos ultimos 3 meses, agrupar por mes
- Calcular media mensal
- Aplicar tendencia (se crescendo, projetar para cima)

### 3. Card "Ciclo Medio de Vendas"

- Buscar leads won do mes atual
- Calcular `updated_at - created_at` medio em dias
- Exibir como "X dias" com comparacao vs mes anterior

### 4. Grafico "Receita por Dia" (AreaChart)

- Buscar leads won do mes agrupados por dia (`updated_at`)
- AreaChart com gradiente verde
- Eixo X: dias do mes, Eixo Y: receita acumulada

### 5. Card "Gargalo do Funil"

- Query: agrupar leads ativos por `funnel_stage_id`, excluindo won/lost
- Etapa com mais leads parados = gargalo
- Exibir nome da etapa + quantidade de leads

## Estrutura Visual Final

```text
+--------------------------------------------------+
| [Novos Leads] [Clientes] [Receita] [Ticket] [Perda] |
| [Ciclo Vendas] [Previsao Fat.] [Receita Prev.]      |
+--------------------------------------------------+
| [Taxa Conversao]  | [Top 5 Vendedores]            |
|                   |                                |
+--------------------------------------------------+
| [Receita por Dia - AreaChart]                      |
+--------------------------------------------------+
| [Gargalo do Funil]                                 |
+--------------------------------------------------+
```

- Primeira linha: 5 MetricCards (existentes)
- Segunda linha: 3 MetricCards novos (Ciclo, Previsao, Receita Prevista)
- Terceira linha: 2 cards grandes (Conversao + Top Sellers - existentes)
- Quarta linha: Grafico de receita por dia (novo)
- Quinta linha: Card de gargalo do funil (novo)

## Implementacao Tecnica

Todas as novas metricas serao implementadas como `useQuery` com `staleTime: 5min`, seguindo o padrao ja existente no Dashboard.

### Novas queries:

**1. Previsao de Faturamento (pipeline forecast)**
```typescript
const { data: forecastData } = useQuery({
  queryKey: ['dashboard-forecast', organizationId],
  queryFn: async () => {
    // Buscar stages custom + won
    // Buscar leads ativos com valor
    // Calcular taxa historica por stage
    // Retornar soma ponderada
  },
  enabled: !!organizationId,
  staleTime: 1000 * 60 * 5,
});
```

**2. Receita Prevista (media 3 meses)**
```typescript
const { data: projectedRevenue } = useQuery({
  queryKey: ['dashboard-projected', organizationId],
  queryFn: async () => {
    // Buscar won leads dos ultimos 3 meses
    // Agrupar por mes
    // Calcular media + tendencia
  },
  enabled: !!organizationId,
  staleTime: 1000 * 60 * 5,
});
```

**3. Ciclo medio + Receita diaria + Gargalo**
```typescript
const { data: advancedMetrics } = useQuery({
  queryKey: ['dashboard-advanced', organizationId],
  queryFn: async () => {
    // Ciclo medio: leads won do mes, media de (updated_at - created_at)
    // Receita diaria: leads won agrupados por dia
    // Gargalo: leads ativos agrupados por stage
  },
  enabled: !!organizationId,
  staleTime: 1000 * 60 * 5,
});
```

## Arquivos

| Arquivo | Acao |
|---------|------|
| `src/pages/Dashboard.tsx` | Reescrever - remover metas manuais, adicionar novas metricas automaticas |

Nenhum arquivo novo sera criado. Tudo sera implementado diretamente no Dashboard.tsx existente, reutilizando componentes existentes (MetricCard, Card, AreaChart do recharts).

## Dados do banco utilizados

- `leads`: id, valor, created_at, updated_at, funnel_stage_id, responsavel_user_id, organization_id, source
- `funnel_stages`: id, name, stage_type (won/lost/custom), position, funnel_id
- `profiles`: user_id, full_name, avatar_url
- `organization_members`: user_id, organization_id

Nenhuma tabela nova sera criada. Todos os calculos sao derivados dos dados existentes.

