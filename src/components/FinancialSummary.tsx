import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingDown, TrendingUp, Receipt, Users, Wallet } from "lucide-react";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface FinancialSummaryProps {
  organizationId: string;
}

export function FinancialSummary({ organizationId }: FinancialSummaryProps) {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthLabel = format(now, "MMMM yyyy", { locale: ptBR });

  const { data, isLoading } = useQuery({
    queryKey: ['financial-summary', organizationId, now.getMonth(), now.getFullYear()],
    queryFn: async () => {
      // 1. Revenue from won leads this month
      const { data: stages } = await supabase
        .from("funnel_stages")
        .select("id")
        .eq("stage_type", "won");
      const wonStageIds = stages?.map(s => s.id) || [];

      let totalRevenue = 0;
      let totalCOGS = 0;
      if (wonStageIds.length > 0) {
        const { data: wonLeads } = await supabase
          .from("leads")
          .select("id, valor")
          .eq("organization_id", organizationId)
          .in("funnel_stage_id", wonStageIds)
          .gte("data_conclusao", monthStart.toISOString())
          .lte("data_conclusao", monthEnd.toISOString());

        totalRevenue = (wonLeads || []).reduce((sum, l) => sum + (l.valor || 0), 0);
        const leadIds = (wonLeads || []).map(l => l.id);

        if (leadIds.length > 0) {
          const { data: items } = await supabase
            .from("lead_items")
            .select("quantity, items(cost_price)")
            .in("lead_id", leadIds);

          totalCOGS = (items || []).reduce((sum, item) => {
            const cost = (item.items as any)?.cost_price || 0;
            return sum + (item.quantity * cost);
          }, 0);
        }
      }

      // 2. Production expenses this month
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const { data: block } = await supabase
        .from("production_blocks")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("month", currentMonth)
        .eq("year", currentYear)
        .maybeSingle();

      let totalExpenses = 0;
      if (block) {
        const { data: expenses } = await supabase
          .from("production_expenses")
          .select("amount")
          .eq("production_block_id", block.id);
        totalExpenses = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
      }

      // 3. Commissions
      const { data: commissions } = await supabase
        .from("commissions")
        .select("commission_value, status")
        .eq("organization_id", organizationId)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString());

      const pendingCommissions = (commissions || [])
        .filter(c => c.status === "pending")
        .reduce((sum, c) => sum + c.commission_value, 0);
      const paidCommissions = (commissions || [])
        .filter(c => c.status === "paid")
        .reduce((sum, c) => sum + c.commission_value, 0);
      const totalCommissions = pendingCommissions + paidCommissions;

      const netProfit = totalRevenue - totalCOGS - totalExpenses - totalCommissions;

      return { totalRevenue, totalCOGS, totalExpenses, pendingCommissions, paidCommissions, totalCommissions, netProfit };
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const cards = [
    { label: "Receita Total", value: data?.totalRevenue || 0, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
    { label: "Custo dos Produtos", value: data?.totalCOGS || 0, icon: TrendingDown, color: "text-red-600", bg: "bg-red-100 dark:bg-red-900/30" },
    { label: "Despesas Operacionais", value: data?.totalExpenses || 0, icon: Receipt, color: "text-orange-600", bg: "bg-orange-100 dark:bg-orange-900/30" },
    { label: "Comissões", value: data?.totalCommissions || 0, icon: Users, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", sub: data ? `Pendente: ${fmt(data.pendingCommissions)} | Pago: ${fmt(data.paidCommissions)}` : undefined },
    { label: "Lucro Líquido", value: data?.netProfit || 0, icon: Wallet, color: (data?.netProfit || 0) >= 0 ? "text-emerald-600" : "text-red-600", bg: (data?.netProfit || 0) >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold capitalize">Resumo Financeiro - {monthLabel}</h2>
        <p className="text-muted-foreground">Visão consolidada de receitas, custos e lucro</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <Card key={card.label} className="shadow-sm">
            <CardContent className="pt-5">
              {isLoading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-20 bg-muted rounded" />
                  <div className="h-8 w-28 bg-muted rounded" />
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${card.bg}`}>
                    <card.icon className={`h-5 w-5 ${card.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                    <p className={`text-lg font-bold ${card.color}`}>{fmt(card.value)}</p>
                    {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Profit breakdown bar */}
      {data && data.totalRevenue > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Composição do Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-6 rounded-full overflow-hidden flex bg-muted">
              {[
                { value: data.totalCOGS, color: "bg-red-500", label: "Custos" },
                { value: data.totalExpenses, color: "bg-orange-500", label: "Despesas" },
                { value: data.totalCommissions, color: "bg-blue-500", label: "Comissões" },
                { value: Math.max(data.netProfit, 0), color: "bg-emerald-500", label: "Lucro" },
              ].map((seg, i) => {
                const pct = (seg.value / data.totalRevenue) * 100;
                if (pct <= 0) return null;
                return (
                  <div
                    key={i}
                    className={`${seg.color} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${seg.label}: ${fmt(seg.value)} (${pct.toFixed(1)}%)`}
                  />
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Custos</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /> Despesas</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Comissões</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Lucro</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
