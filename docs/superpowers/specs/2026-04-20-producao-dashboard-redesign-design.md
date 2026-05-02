# Produção Dashboard Redesign

**Date:** 2026-04-20
**Status:** Approved

## Problem

The Produção section currently shows production "blocks" as a card grid. Users must click a block to see metrics and data in a modal. This adds unnecessary friction — users want to see production data immediately when they navigate to the section.

## Goal

Replace the block grid with a direct dashboard view that shows production metrics, sales data, and financial summary immediately on the page. Add a month/year date selector in the header so users can switch between production periods without leaving the page.

## Design Decisions

- **Approach chosen:** Dashboard Direto (all content visible on one page with scroll)
- **Tab structure:** Keep existing 3 tabs (Produção, Produtos da Empresa, Financeiro) — only the first tab changes
- **Date selection:** Month/year dropdown (simple, matches production block granularity)
- **Metric card style:** Colored gradient backgrounds matching the reference dashboard image

## Architecture

### Component Changes

**Modified files:**
- `src/pages/Producao.tsx` — No structural change, continues to render 3 tabs
- `src/components/ProductionDashboard.tsx` — Major rewrite: replaces block grid with dashboard view

**New components:**
- `ProductionMetricCards.tsx` — 4 colored metric cards in a responsive grid
- `ProductionSalesTable.tsx` — Sales table for the selected period with search
- `ProductionFinancialSummary.tsx` — Financial breakdown below the sales table

**Reused components:**
- Date selector: shadcn Select or Popover with month/year picker
- "Nova Produção" dialog: existing creation flow from ProductionDashboard

### Data Flow

1. On mount, fetch the current month's `production_block` from Supabase
2. Display metrics from the block's fields (`total_sales`, `total_revenue`, `total_profit`, calculated `ticket_medio`)
3. Fetch won leads for the block's date range → populate sales table
4. Fetch expenses and commissions for the block → populate financial summary
5. On date change, refetch all data for the selected month/year
6. Variation percentages come from `profit_change_percentage` field and equivalent calculations

### State Management

- Use React Query (existing pattern) for data fetching
- Selected month/year stored in local component state
- Auto-defaults to current month on first load

## UI Specification

### Header Section

```
┌─────────────────────────────────────────────────────────┐
│ Produção                           [+ Nova Produção] [Abr/2026 ▾] │
│ Acompanhe suas métricas de produção                     │
└─────────────────────────────────────────────────────────┘
```

- Left: Title "Produção" (bold, 18-20px) + subtitle in gray
- Right: "Nova Produção" button (purple #6c5ce7 background, white text) + month/year dropdown
- When no block exists for selected month: show empty state with CTA to create one

### Metric Cards

4 cards in a responsive grid (4 cols desktop, 2 tablet, 1 mobile):

| Card | Background Gradient | Icon (Lucide) | Primary Data | Secondary Data |
|------|-------------------|---------------|--------------|----------------|
| Vendas Fechadas | #6c5ce7 → #a29bfe | ShoppingCart | Won lead count | % change vs previous month |
| Faturamento | #00b894 → #55efc4 | DollarSign | Total revenue (R$) | % change vs previous month |
| Lucro Líquido | #0984e3 → #74b9ff | TrendingUp | Revenue - Costs - Expenses | % change vs previous month |
| Ticket Médio | #e17055 → #fab1a0 | Receipt | Revenue / Sales count | % change vs previous month |

**Card style:**
- Background: linear-gradient(135deg, primary-color, lighter-color)
- Text: white, labels uppercase (10px), value bold (24px)
- Border radius: 10-12px
- Padding: 16px
- Variation indicator: ↑ green, ↓ red, → neutral

### Sales Table

```
┌─────────────────────────────────────────────────────────┐
│ Vendas do Período                                       │
│ [Buscar (nome, CPF, contrato)...                     ] │
│ ┌──────────┬───────────┬──────────┬─────────┬────────┐ │
│ │ Cliente  │ Vendedor  │ Valor    │ Equipe  │ Data   │ │
│ ├──────────┼───────────┼──────────┼─────────┼────────┤ │
│ │ João S.  │ Marcos    │ R$ 5.200 │ Gaviões │ 15/04  │ │
│ │ Maria S. │ Ana       │ R$ 3.800 │ Alpha   │ 12/04  │ │
│ └──────────┴───────────┴──────────┴─────────┴────────┘ │
└─────────────────────────────────────────────────────────┘
```

- Search bar with text filter (nome, CPF, contrato)
- Columns: Cliente, Vendedor, Valor (R$), Equipe, Data Conclusão
- Data from `leads` table where `status = 'won'` and completion date within block period
- Ordered by most recent first
- Empty state: "Nenhuma venda registrada neste período"

### Financial Summary

```
┌─────────────────────────────────────────────────────────┐
│ Resumo Financeiro                                       │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│ │ Receita    │ │ Custo Prod.│ │ Despesas   │           │
│ │ R$ 187.450 │ │ R$ 45.000  │ │ R$ 18.220  │           │
│ └────────────┘ └────────────┘ └────────────┘           │
│ ┌────────────┐ ┌────────────────────────────┐           │
│ │ Comissões  │ │ Lucro Líquido              │           │
│ │ R$ 30.000  │ │ R$ 94.230 (destaque verde) │           │
│ └────────────┘ └────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

- Small cards with light gray background (#f8f9fa), rounded corners
- Categories: Receita, Custo dos Produtos, Despesas Operacionais, Comissões, Lucro Líquido
- Lucro Líquido highlighted in green (#00b894) when positive, red when negative
- Data from `production_expenses`, `commissions`, and `lead_items` for the selected block

### Empty State

When no production block exists for the selected month:
- Show metric cards with zeroed values
- Show message: "Nenhuma produção encontrada para este período"
- Show CTA button: "Criar Produção para [Mês/Ano]"

## Data Sources

| Data | Source | Filter |
|------|--------|--------|
| Block metrics | `production_blocks` | organization_id, month/year match |
| Sales list | `leads` | status = 'won', data_conclusao within block date range |
| Expenses | `production_expenses` | production_block_id |
| Commissions | `commissions` | production_block_id or date range |
| Product costs | `lead_items` + `items` | linked to won leads in period |

## Calculations

Variation percentages for all 4 metric cards are calculated by fetching the previous month's production block and comparing:

- **Vendas Fechadas %:** `((current.total_sales - prev.total_sales) / prev.total_sales) * 100`
- **Faturamento %:** `((current.total_revenue - prev.total_revenue) / prev.total_revenue) * 100`
- **Lucro Líquido %:** Uses existing `profit_change_percentage` field from the block
- **Ticket Médio %:** `((current_ticket - prev_ticket) / prev_ticket) * 100` where `ticket = revenue / sales`

If no previous block exists, show "—" instead of a percentage.

## Scope

- **In scope:** Produção tab redesign (first tab only)
- **Out of scope:** Produtos da Empresa tab, Financeiro tab, sidebar navigation, other pages
- **Implementation target:** localhost first for visual validation
