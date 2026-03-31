# Dashboard Redesign - Kairoz CRM

## Visão Geral
Redesign complete do dashboard principal do CRM base no modelo de referência enviado pelo usuário. O design profissional, sem espaços vazidos desnos excessivos, adaptado ao dark mode. Mantém o card "Top 5 Vendedores" com gif de empty state existente no projeto.

## Escopo
### Reescrita completa do Dashboard.tsx
- Remover todas as métricas atuais
- Implementar new metrics based on model
- Implementar filter de period global
- Criar campo `status_reuniao` in table leads

- Adicionar sections for Taxas chave, Performance by etapa do funil and Gargalo

- Maintain Top 5 Vendedores

### Layout Final

```
┌─────────────────────────────────────────────────────────────────────┐
│  [FILTRO: Hoje | Este Mês | Trimestre | Ano]                    │
│  ┌──────────────┐──────────────┐──────────────┐──────────────┐────────────────────────────────────────────┐
│                     │  Linha 1 (4 cards)                           │  Linha 2 (3 cards)                         │  Linha 3 (3 cards)                    │
│  ┌─────────────┬─────────────┬─────────────┬─────────────────────────────────────────────┤
│  │ LEADS TOTAis │  MQL          │ Taxa MQL         │ LEADS Hoje           │
│  │ azul        │ roxo         │ verde        │ amarelo        │
│  └─────────────┴─────────────┴─────────────┴─────────────────────────────────────────────┘
│                     │                                              │                                               |
│                     │  Taxas Chave (tabela)                         │  Top 5 Vendedores (card)                │
│                     │                                              │                                               |
│                     │  Funil completo (gráfico)                  │  Funil - Gargalo (visual)               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Filtro de Período:**
- **Hoje** - leads from today
00:00h to 23:59:59)
- **Este Mês** - leads from start of current month to last day of current month at 23:59:59
- **Trimestre** - leads from start of current quarter (Q1st) to last day of quarter at 23:59:59)
- **Ano** - leads from start of this year (Jan 1st) to Dec 31st

  const startDate = new Date(startDate);
  const endDate = new Date(endDate);
  endDate.setHours(0, 23, 59);
  return { startDate, endDate };
}
```

---

## Cards de Métricas

### Linha 1 (4 cards principais)

| # | Métrica | Cálculo | Cor | Ícone | Observação |
|---------|---------|-----|-------|
| LEADS TOTAIS | `COUNT(leads)` no período | Azul claro (#3b82f6) | Users |
| Taxa MQL | | `COUNT(leads)` em etapas qualificadas | Roxo (#8b5cf6) | Target |
| Taxa Qualif. | | `COUNT(leads)` etapa "Ganho") / total leads) | stage_type === 'won') × 100). | Verde (#10b981) | TrendingUp |
| Trend={{ value: `${Math.abs(soldThisMonth - lastMonth) > 0 ? '+' : '' : negative, < 0 }}
        subtitle={`- ${Math.abs(soldThisMonth - lastMonth)}%`}
          trend={salesTrend}
      />
      <MetricCard
        title="Leads Hoje"
        value={todayLeads}
        icon={UserPlus}
        iconColor="text-yellow-500"
      />
      <MetricCard
        title="Reuniões Agendadas"
        value={appointmentCount}
        icon={Calendar}
        iconColor="text-blue-500"
      />
      <MetricCard
        title="Realizadas vs No-show"
        value={`${realized} / ${noShow}`}
        icon={realized ? CheckCircle : noShow?XCircle}
        iconColor="text-green-500"
        trend={noShowTrend}
        subtitle={`${noShowtrend < 0 ? '-' : pause`}
      />
      <MetricCard
        title="Taxa de No-show"
        value={`${noShowRate}%`}
        icon={XCircle}
        iconColor="text-red-500"
      />
      <MetricCard
        title="Vendas do Mês"
        value={`R$ ${monthRevenue.toLocaleString('pt-BR')}`}
        icon={dollarSign}
        iconColor="text-emerald-500"
      />
      <MetricCard
        title="Vendas no Total"
        value={soldTotal}
        icon={trophy}
        iconColor="text-green-500"
      />
    </div>
  </div>
</div>

<!-- Linha 2: 3 cards = Performance de reuniões/vendas -->
<div className="grid gap-4 grid-cols-1 md:grid-cols-3">
  <MetricCard
    title="Reuniões Realizadas"
    value={`${realized}/${noShow}`}
    icon={realized ?CheckCircle}
    iconColor="text-green-500"
  />
  <MetricCard
    title="Reuniões no-show"
    value={`${noShow}`}
    icon={noShow?XCircle}
    iconColor="text-red-500"
  />
  <MetricCard
    title="Vendas não Total"
    value={soldTotal}
    icon={trophy}
    iconColor="text-green-500"
  />
</div>
</div>
</div>

<!-- Seções inferiores -->
<div className="grid gap-4 grid-cols-1 md:grid-cols-2">
  {/* Card: Taxas chave + Top 5 vendedores */}
  <Card>
    <CardHeader>
      <CardTitle className="text-lg font-semibold">Taxas Chave</CardTitle>
    </CardHeader>
    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Taxa</TableHead>
            <TableHead>Comparação</TableHead>
          <TableHead>Tendência</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead className="text-right">%Leads</TableHead>
          <TableHead className="text-right">Variação</TableHead>
          <TableHead className="text-right">% do total</TableHead>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</div>

<!-- Card: Funnel Stages -->
<div className="grid gap-4 grid-cols-1 md:grid-cols-2">
  <Card>
    <CardHeader>
      <CardTitle className="text-lg font-semibold flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <span className="text-sm text-muted-foreground">Distribuição de leads por etapa</CardTitle>
      </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stages.map(stage => (
          <div key={stage.id} className="relative">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{stage.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{stage.position}</span>
              <div className="text-xs text-muted-foreground">{leads}</span>
              <div className="text-xs font-bold">
{stage.count} leads</div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

<!-- Card: Top 5 Vendedores -->
<div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center gap-2">
        <Trophy className="w-5 h-5 text-yellow-500" />
        <span className="text-sm font-semibold">Top 5 Vendedores</span>
        <span className="text-xs text-muted-foreground">Ranking por receita</ mês</span>
      </CardHeader>
    <CardContent>
      {/* Empty state */}
      {topSellers.length === 0 && sellers.length === 0 ? (
        <div className="text-center py-4 text-muted-foreground">
          <img src={topSellersEmptyState} alt="Nenhuma venda este mês" className="w-24 h-24 mb-3" />
          <p className="text-sm text-muted-foreground">Os melhores vendedores aparecerão aqui!</p>
        </div>
      )}

      {/* Sellers list */}
      <div className="space-y-2">
        {topSellers.length > 0 && sellers.map((seller, index) => (
          const maxRevenue = topSellers[0].total_revenue;
          const percentage = (seller.total_revenue / maxRevenue) * 100;
          const barWidth = `${percentage}%`;

          return (
            <div key={seller.user_id} className="flex items-center gap-3">
              <span className="text-sm font-medium truncate">{seller.full_name}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {seller.won_leads} vendas
                </p>
                <div className="text-xs text-muted-foreground">
                  R$ {formatCurrency(seller.total_revenue)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </CardContent>
  </Card>

  {/* Card: Funil completo - Gargalo */}
<div className="grid gap-4 grid-cols-1 md:grid-cols-2">
  <Card>
    <CardHeader>
      <CardTitle className="text-lg font-semibold flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-chart-3" />
        <span className="text-sm text-muted-foreground">Visualização do funil completo</CardTitle>
      </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stages.map(stage => (
          <div key={stage.id} className="relative">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{stage.name}</span>
              <span className="text-xs text-muted-foreground">{stage.position}</span>
              <div className="text-xs text-muted-foreground">
{stage.count} leads in this stage}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>

  {/* Card: Gargalo no funil -->
<div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
  <Card>
    <CardHeader className="pb-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <span className="text-sm font-semibold">Gargalo do Funil</span>
        <span className="text-xs text-muted-foreground">Etapa com maior acúmulo de leads</span>
      </CardHeader>
    <CardContent>
      {bottleneck ? (
        <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
          {bottleneck && (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-amber-600">
                <span className="text-xs text-muted-foreground">{bottleneck.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {bottleneck.count} leads ({bottleneck.count} > 5 ? 'Nenhum gargalo identificado.'')
              </div>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</div>

<!-- Seções inferiores -->
<div className="grid gap-4 grid-cols-1 md:grid-cols-2">
  <div className="flex flex-col items-center justify-center gap-6">
    <h2 className="text-lg font-bold">Dashboard</h2>
    <p className="text-xs text-muted-foreground mb-4">
              Filtre por período
 útil para a entender de performance de vendas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
 <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
  <MetricCard
            title="Leads Totais"
            value={metricsData?.newLeadsCount}
            icon={TrendingUp}
            iconColor="text-cyan-500"
            tooltip="Total de leads captados neste mês"
          />
        </div>
      <MetricCard
        title="Mql"
        value={mql}
        icon={Target}
        iconColor="text-purple-500"
        subtitle="Leads qualificados (viraram clientes)"
 />
        tooltip="% de leads queificados como Mql (marketing qualified lead)"
 />
      <MetricCard
        title="taxa MQL"
        value={`${mqlRate}%`}
        icon={trendingUp}
        iconColor="text-green-500"
        subtitle="Leads queificados como mQL"
Marketing qualified lead"
 />
        trend={{
          value: `${Math.abs(soldThisMonth - lastMonth) > 0 ? '+' : '' : < 0}
            positive: trend >= 0}
          }
        />
 content>
      </MetricCard>

      <MetricCard
        title="leads hoje"
        value={todayLeads}
        icon={UserPlus}
        iconColor="text-yellow-500"
      />
      <MetricCard
        title="reuniões agendadas"
        value={appointmentCount}
        icon={Calendar}
        iconColor="text-blue-500"
      />
      <MetricCard
        title="realizadas vs no-show"
        value={`${realized}/${noShow}`}
        icon={realized ?CheckCircle}
        iconColor="text-green-500"
        trend={noShowTrend}
        subtitle={noShowtrend < 0 ? '🔴' : pause`}
      />
      <MetricCard
        title="taxa de no-show"
        value={`${noShowRate}%`}
        icon={noShow?XCircle}
        iconColor="text-red-500"
      />
      <MetricCard
        title="vendas do mês"
        value={`R$ ${monthRevenue.toLocaleString('pt-BR')}`}
        icon={dollarSign}
        iconColor="text-emerald-500"
      />
      <MetricCard
        title="vendas no total"
        value={soldTotal}
        icon={trophy}
        iconColor="text-green-500"
      />
    </div>
  </div>
</div>

<!-- seção de filtros -->
<div className="flex flex-col sm:flex-row items-center justify-between gap-4">
    <div className="grid gap-2 md:grid-cols-3">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-9 px-3",
              !dateRange && "text-muted-foreground"
            )}
          </Button>
        </Popover>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="grid grid-cols-2 gap-2">
            {["Hoje", "Este Mês", "Trimestre", "Ano"].map((p) => (
              <Button
                key={p.label}
                size="sm"
                variant="ghost"
                onClick={() => setPeriod(p)}
              >
                {p.label}
              </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-5 w-5",
                    !dateRange ? "text-muted-foreground"
                  }
                </Button>
              </Popover>
            </Popover>
          </div>
        </div>

        {/* Filtros de actions */}
 */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium">Se necessário,}</span>
        </CardContent>
      </div>

      {/* Row 3: charts and funnel */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-chart-3" />
              <span className="text-sm text-muted-foreground">Visualização do funil completo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={funnelStages}>
                <Bar dataKey="count" radius={[4, 4, 0]} />
              <XAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const stage = (funnelStages || []).find(s => s.stage_type === 'won');
                  const [idx, index] = idx;
                  }
                : null;
              });

              // Calculate totals
              const totals: { won: number = 0, totalLeads: number, avgTicket: number } = 0, totalRevenue,                </div>
                });

              });
              />
              </CardContent>
            </div>
          </div>
        </CardContent>
      </div>
    </div>
  );
}

export default Dashboard;
