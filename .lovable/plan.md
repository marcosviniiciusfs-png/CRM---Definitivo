
# Evolucao do Dashboard e Gestao de Equipe/Financeiro

## Contexto Atual

O sistema hoje tem:
- **Dashboard principal**: 5 metricas no topo (Novos Leads, Novos Clientes, Tarefas Atuais, Tarefas Atrasadas, Taxa de Perda) + Meta pessoal + Taxa de Conversao + Top 5 Vendedores
- **Colaboradores**: CRUD basico (add/edit/delete/ativar/desativar) + dashboard de metricas por colaborador
- **Equipes**: Drag-and-drop de membros entre equipes + metas de equipe
- **Producao**: Blocos de producao mensais + catalogo de produtos
- **Ranking**: Vendas vs Tarefas vs Agendamentos
- **Comissoes**: Tabela `commissions` e `commission_configs` existem no banco mas NAO ha interface para gerencia-las

## Problemas Identificados

1. **Dashboard focado em tarefas**: 2 de 5 cards sao sobre tarefas (Tarefas Atuais, Tarefas Atrasadas), nao sobre vendas/financeiro
2. **Sem visao financeira consolidada**: Nao ha receita do mes, ticket medio, comissoes pendentes, lucro
3. **Gestao de equipe superficial**: Nao ha metricas de performance por equipe, comparativo entre equipes, metas por equipe com progresso visual
4. **Comissoes sem interface**: Existe no banco mas o admin nao consegue ver/gerenciar comissoes dos vendedores
5. **Colaboradores sem KPIs rapidos**: O admin nao ve de forma pratica quanto cada colaborador vendeu, sua taxa de conversao, comissao pendente

## Plano de Implementacao

### Fase 1 - Dashboard Focado em Vendas e Financeiro

Substituir os cards de metricas do topo por metricas de vendas/financeiro:

| Posicao | Antes | Depois |
|---------|-------|--------|
| 1 | Novos Leads | Novos Leads (mantem) |
| 2 | Novos Clientes | Novos Clientes (mantem) |
| 3 | **Tarefas Atuais** | **Receita do Mes** (R$ total de leads ganhos no mes) |
| 4 | **Tarefas Atrasadas** | **Ticket Medio** (receita / numero de vendas) |
| 5 | Taxa de Perda | Taxa de Perda (mantem) |

A receita do mes ja e calculada em `loadSalesTotal()`. O ticket medio e `totalRevenue / salesCount`.

### Fase 2 - Painel de Comissoes (Nova Aba em Colaboradores)

Adicionar aba "Comissoes" na pagina de Colaboradores com:

1. **Resumo de Comissoes**:
   - Total de comissoes pendentes (status = 'pending')
   - Total de comissoes pagas no mes (status = 'paid')
   - Configuracao atual (percentual ou valor fixo)

2. **Lista de Comissoes por Colaborador**:
   - Tabela com: Colaborador | Lead | Valor da Venda | Comissao | Status | Acoes
   - Acoes: Marcar como paga / Ver detalhes

3. **Configuracao de Comissao**:
   - Editar tipo (percentual ou fixo) e valor na tabela `commission_configs`
   - Ja existe no banco, so falta a UI

### Fase 3 - Metricas de Equipe (Aprimorar Equipes)

Na pagina de Equipes, adicionar para cada equipe:

1. **Vendas da equipe no mes**: Soma dos leads ganhos por membros da equipe
2. **Meta da equipe vs realizado**: Barra de progresso
3. **Melhor vendedor da equipe**: Avatar + nome + valor
4. **Comparativo entre equipes**: Card no topo mostrando ranking de equipes por receita

Dados vem de `leads` (filtrado por `responsavel_user_id` dos membros da equipe) + `funnel_stages` (stage_type = 'won').

### Fase 4 - Visao Financeira Rapida do Colaborador

Na pagina de Colaboradores, na listagem, adicionar colunas visuais:

1. **Vendas no mes**: Quantidade de leads ganhos
2. **Receita gerada**: Valor total vendido
3. **Comissao pendente**: Valor calculado a receber

Essas informacoes aparecem como badges ou colunas extras na tabela de colaboradores.

## Arquivos a Criar/Modificar

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| `src/pages/Dashboard.tsx` | MODIFICAR | Trocar cards de tarefas por Receita do Mes e Ticket Medio |
| `src/pages/Colaboradores.tsx` | MODIFICAR | Adicionar aba Comissoes + metricas na listagem |
| `src/components/CommissionsTab.tsx` | CRIAR | Componente da aba de comissoes |
| `src/components/CommissionConfigModal.tsx` | CRIAR | Modal para configurar regras de comissao |
| `src/pages/Equipes.tsx` | MODIFICAR | Adicionar metricas de vendas por equipe e comparativo |
| `src/components/TeamSalesMetrics.tsx` | CRIAR | Componente de metricas de vendas por equipe |

## Secao Tecnica

### Dashboard - Calculo de Receita e Ticket Medio

```typescript
// Receita do mes - reutiliza logica existente de loadMetrics
const monthRevenue = wonLeads.reduce((sum, lead) => sum + (lead.valor || 0), 0);
const avgTicket = wonLeads.length > 0 ? monthRevenue / wonLeads.length : 0;
```

Nao precisa de nova tabela. Dados ja existem em `leads` + `funnel_stages`.

### Comissoes - Interface para dados existentes

A tabela `commissions` ja tem:
- `user_id`, `lead_id`, `sale_value`, `commission_value`, `commission_rate`, `status`, `paid_at`

A tabela `commission_configs` ja tem:
- `organization_id`, `commission_type` (percentage/fixed), `commission_value`, `is_active`

Nao precisa de migracao. So UI.

### Metricas de Equipe

```sql
-- Vendas por equipe no mes
SELECT t.id, t.name, COUNT(l.id) as sales, SUM(l.valor) as revenue
FROM teams t
JOIN team_members tm ON tm.team_id = t.id
JOIN leads l ON l.responsavel_user_id = tm.user_id
JOIN funnel_stages fs ON fs.id = l.funnel_stage_id AND fs.stage_type = 'won'
WHERE l.updated_at >= start_of_month
GROUP BY t.id, t.name
ORDER BY revenue DESC
```

### Colaboradores com KPIs

Na listagem de colaboradores, adicionar query paralela:
```typescript
// Para cada colaborador, buscar vendas do mes
const salesByUser = wonLeads.reduce((acc, lead) => {
  const userId = lead.responsavel_user_id;
  if (!acc[userId]) acc[userId] = { count: 0, revenue: 0 };
  acc[userId].count++;
  acc[userId].revenue += lead.valor || 0;
  return acc;
}, {});
```

### Ordem de Implementacao

1. Dashboard (mais impacto visual, menos risco)
2. Colaboradores + Comissoes (funcionalidade nova mais pedida)
3. Equipes + Metricas (complemento)

Todas as mudancas usam dados ja existentes no banco. Nenhuma migracao SQL necessaria.
