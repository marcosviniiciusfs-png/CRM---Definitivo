import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, FileText, XCircle, Target, Trophy, ArrowRight, Clock, DollarSign, AlertTriangle, BarChart3, HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ResponsiveContainer, BarChart, Bar, Rectangle, XAxis, Tooltip as RechartsTooltip, AreaChart, Area, CartesianGrid, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import topSellersEmptyState from "@/assets/top-sellers-empty.gif";

// Interfaces
interface TopSeller {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
}
interface ConversionDataPoint {
  month: string;
  rate: number;
}

const getBarColor = (value: number, data: ConversionDataPoint[]) => {
  const rates = data.map(d => d.rate);
  const minRate = Math.min(...rates, 0);
  const maxRate = Math.max(...rates, 1);
  const range = maxRate - minRate || 1;
  const normalized = Math.max(0, Math.min(1, (value - minRate) / range));
  const darkGreen = { r: 0, g: 105, b: 40 };
  const brightGreen = { r: 0, g: 255, b: 106 };
  const r = Math.round(darkGreen.r + (brightGreen.r - darkGreen.r) * normalized);
  const g = Math.round(darkGreen.g + (brightGreen.g - darkGreen.g) * normalized);
  const b = Math.round(darkGreen.b + (brightGreen.b - darkGreen.b) * normalized);
  return `rgb(${r}, ${g}, ${b})`;
};

const Dashboard = () => {
  const { user, organizationId, isReady } = useOrganizationReady();
  const queryClient = useQueryClient();
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const navigate = useNavigate();

  // ========== EXISTING QUERIES (kept) ==========

  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [leadsResult, wonStagesResult] = await Promise.all([
        supabase.from('leads').select('id, funnel_stage_id', { count: 'exact' }).eq('organization_id', organizationId).gte('created_at', startOfMonth),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won')
      ]);
      let newCustomersCount = 0;
      let monthRevenue = 0;
      let avgTicket = 0;
      if (wonStagesResult.data && wonStagesResult.data.length > 0) {
        const wonStageIds = wonStagesResult.data.map(s => s.id);
        const { data: wonLeadsMonth, count: customersCount } = await supabase.from('leads').select('id, valor', { count: 'exact' }).eq('organization_id', organizationId).in('funnel_stage_id', wonStageIds).gte('updated_at', startOfMonth);
        newCustomersCount = customersCount || 0;
        const revenue = (wonLeadsMonth || []).reduce((sum, lead) => sum + (lead.valor || 0), 0);
        const salesCount = wonLeadsMonth?.length || 0;
        monthRevenue = revenue;
        avgTicket = salesCount > 0 ? revenue / salesCount : 0;
      }
      return { newLeadsCount: leadsResult.count || 0, newCustomersCount, monthRevenue, avgTicket };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: conversionResult } = useQuery({
    queryKey: ['dashboard-conversion', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const monthRanges = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        monthRanges.push({ start: monthDate.toISOString(), end: nextMonthDate.toISOString(), name: monthName.charAt(0).toUpperCase() + monthName.slice(1) });
      }
      const sixMonthsAgo = monthRanges[0].start;
      const [wonStagesResult, allLeadsResult] = await Promise.all([
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won'),
        supabase.from('leads').select('id, created_at, updated_at, funnel_stage_id').eq('organization_id', organizationId).gte('created_at', sixMonthsAgo)
      ]);
      const wonStageIds = new Set(wonStagesResult.data?.map(s => s.id) || []);
      const allLeads = allLeadsResult.data || [];
      const months: ConversionDataPoint[] = monthRanges.map(range => {
        const leadsInMonth = allLeads.filter(lead => lead.created_at >= range.start && lead.created_at < range.end);
        const convertedInMonth = allLeads.filter(lead => lead.funnel_stage_id && wonStageIds.has(lead.funnel_stage_id) && lead.updated_at >= range.start && lead.updated_at < range.end);
        const totalLeads = leadsInMonth.length;
        const convertedLeads = convertedInMonth.length;
        const rate = totalLeads > 0 ? convertedLeads / totalLeads * 100 : 0;
        return { month: range.name, rate: parseFloat(rate.toFixed(1)) };
      });
      const currentRate = months.length > 0 ? months[months.length - 1].rate : 0;
      const trend = months.length > 1 ? parseFloat((currentRate - months[months.length - 2].rate).toFixed(1)) : 0;
      return { conversionData: months, currentConversionRate: currentRate, conversionTrend: trend };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: topSellersResult } = useQuery({
    queryKey: ['dashboard-top-sellers', organizationId],
    queryFn: async () => {
      if (!organizationId) return { topSellers: [], loading: false };
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [membersResult, wonStagesResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won')
      ]);
      const members = membersResult.data || [];
      const wonStageIds = wonStagesResult.data?.map(s => s.id) || [];
      if (wonStageIds.length === 0 || members.length === 0) return { topSellers: [], loading: false };
      const memberUserIds = members.filter(m => m.user_id).map(m => m.user_id);
      const [profilesResult, wonLeadsResult] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', memberUserIds),
        supabase.from('leads').select('responsavel_user_id, valor').eq('organization_id', organizationId).in('funnel_stage_id', wonStageIds).gte('updated_at', startOfMonth)
      ]);
      const profiles = profilesResult.data || [];
      const wonLeads = wonLeadsResult.data || [];
      const salesByUser: Record<string, { won_leads: number; total_revenue: number }> = {};
      wonLeads.forEach(lead => {
        if (lead.responsavel_user_id) {
          if (!salesByUser[lead.responsavel_user_id]) salesByUser[lead.responsavel_user_id] = { won_leads: 0, total_revenue: 0 };
          salesByUser[lead.responsavel_user_id].won_leads++;
          salesByUser[lead.responsavel_user_id].total_revenue += lead.valor || 0;
        }
      });
      const sellers: TopSeller[] = memberUserIds.filter(userId => salesByUser[userId]?.won_leads > 0).map(userId => {
        const profile = profiles.find(p => p.user_id === userId);
        const sales = salesByUser[userId];
        return { user_id: userId, full_name: profile?.full_name || 'Colaborador', avatar_url: profile?.avatar_url || null, won_leads: sales.won_leads, total_revenue: sales.total_revenue };
      }).sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 5);
      return { topSellers: sellers, loading: false };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: lossRateData } = useQuery({
    queryKey: ['dashboard-loss-rate', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { data: lostStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'lost');
      const lostStageIds = lostStages?.map(s => s.id) || [];
      const [totalResult, lostResult] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        lostStageIds.length > 0
          ? supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('funnel_stage_id', lostStageIds)
          : Promise.resolve({ count: 0 })
      ]);
      const totalLeads = totalResult.count || 0;
      const lostLeads = lostResult.count || 0;
      return totalLeads > 0 ? parseFloat((lostLeads / totalLeads * 100).toFixed(1)) : 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ========== NEW QUERIES ==========

  // 1. Pipeline Forecast (Previsão de Faturamento)
  const { data: forecastData } = useQuery({
    queryKey: ['dashboard-forecast', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

      // Get all funnel stages
      const { data: stages } = await supabase.from('funnel_stages').select('id, name, stage_type, position');
      if (!stages) return { forecast: 0 };

      const wonStageIds = new Set(stages.filter(s => s.stage_type === 'won').map(s => s.id));
      const lostStageIds = new Set(stages.filter(s => s.stage_type === 'lost').map(s => s.id));
      const customStages = stages.filter(s => s.stage_type === 'custom');

      // Get active leads with value grouped by stage
      const { data: activeLeads } = await supabase
        .from('leads')
        .select('id, valor, funnel_stage_id')
        .eq('organization_id', organizationId)
        .gt('valor', 0);

      if (!activeLeads) return { forecast: 0 };

      // Filter to only custom stage leads
      const pipelineLeads = activeLeads.filter(l =>
        l.funnel_stage_id && !wonStageIds.has(l.funnel_stage_id) && !lostStageIds.has(l.funnel_stage_id)
      );

      // Get historical conversion: leads that moved to won in last 90 days from stage history
      const { data: historyToWon } = await supabase
        .from('funnel_stage_history')
        .select('from_stage_id, to_stage_id')
        .in('to_stage_id', Array.from(wonStageIds))
        .gte('moved_at', ninetyDaysAgo);

      // Count total leads that passed through each stage in 90 days
      const { data: allHistory } = await supabase
        .from('funnel_stage_history')
        .select('from_stage_id')
        .gte('moved_at', ninetyDaysAgo);

      // Calculate conversion rate per stage
      const stageConversionRates: Record<string, number> = {};
      customStages.forEach(stage => {
        const totalFromStage = (allHistory || []).filter(h => h.from_stage_id === stage.id).length;
        const wonFromStage = (historyToWon || []).filter(h => h.from_stage_id === stage.id).length;
        stageConversionRates[stage.id] = totalFromStage > 0 ? wonFromStage / totalFromStage : 0.1; // 10% default
      });

      // Calculate weighted forecast
      let forecast = 0;
      pipelineLeads.forEach(lead => {
        const rate = stageConversionRates[lead.funnel_stage_id!] || 0.1;
        forecast += (lead.valor || 0) * rate;
      });

      return { forecast };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // 2. Projected Revenue (Receita Prevista - média 3 meses)
  const { data: projectedData } = useQuery({
    queryKey: ['dashboard-projected', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();

      // Get won stages
      const { data: wonStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];
      if (wonStageIds.length === 0) return { projected: 0, trend: 0 };

      // Get won leads from last 3 months
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
      const { data: wonLeads } = await supabase
        .from('leads')
        .select('valor, updated_at')
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', wonStageIds)
        .gte('updated_at', threeMonthsAgo);

      if (!wonLeads || wonLeads.length === 0) return { projected: 0, trend: 0 };

      // Group by month
      const monthlyRevenue: number[] = [0, 0, 0];
      wonLeads.forEach(lead => {
        const leadDate = new Date(lead.updated_at);
        const monthsAgo = (now.getFullYear() - leadDate.getFullYear()) * 12 + (now.getMonth() - leadDate.getMonth());
        if (monthsAgo >= 1 && monthsAgo <= 3) {
          monthlyRevenue[3 - monthsAgo] += lead.valor || 0;
        }
      });

      const validMonths = monthlyRevenue.filter(v => v > 0);
      const avg = validMonths.length > 0 ? validMonths.reduce((a, b) => a + b, 0) / validMonths.length : 0;

      // Simple trend: if last month > avg, project higher
      const lastMonth = monthlyRevenue[2] || 0;
      const trendPct = avg > 0 ? ((lastMonth - avg) / avg) * 100 : 0;
      const projected = avg > 0 ? avg * (1 + Math.max(-0.3, Math.min(0.3, trendPct / 100))) : 0;

      return { projected, trend: parseFloat(trendPct.toFixed(1)) };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Advanced Metrics (Ciclo de vendas, Receita por dia, Gargalo)
  const { data: advancedData } = useQuery({
    queryKey: ['dashboard-advanced', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

      // Get won stages
      const { data: wonStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];

      // Get all funnel stages for bottleneck
      const { data: allStages } = await supabase.from('funnel_stages').select('id, name, stage_type');
      const lostStageIds = new Set((allStages || []).filter(s => s.stage_type === 'lost').map(s => s.id));

      // Parallel queries
      const [wonThisMonthRes, wonPrevMonthRes, activeLeadsRes] = await Promise.all([
        wonStageIds.length > 0
          ? supabase.from('leads').select('id, valor, created_at, updated_at').eq('organization_id', organizationId).in('funnel_stage_id', wonStageIds).gte('updated_at', startOfMonth)
          : Promise.resolve({ data: [] }),
        wonStageIds.length > 0
          ? supabase.from('leads').select('id, created_at, updated_at').eq('organization_id', organizationId).in('funnel_stage_id', wonStageIds).gte('updated_at', startOfPrevMonth).lte('updated_at', endOfPrevMonth)
          : Promise.resolve({ data: [] }),
        supabase.from('leads').select('id, funnel_stage_id').eq('organization_id', organizationId),
      ]);

      const wonThisMonth = wonThisMonthRes.data || [];
      const wonPrevMonth = wonPrevMonthRes.data || [];

      // Sales Cycle (days)
      const cycleDays = wonThisMonth.map(lead => {
        const created = new Date(lead.created_at).getTime();
        const updated = new Date(lead.updated_at).getTime();
        return Math.max(0, Math.floor((updated - created) / (1000 * 60 * 60 * 24)));
      });
      const avgCycle = cycleDays.length > 0 ? Math.round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length) : 0;

      const prevCycleDays = wonPrevMonth.map(lead => {
        const created = new Date(lead.created_at).getTime();
        const updated = new Date(lead.updated_at).getTime();
        return Math.max(0, Math.floor((updated - created) / (1000 * 60 * 60 * 24)));
      });
      const prevAvgCycle = prevCycleDays.length > 0 ? Math.round(prevCycleDays.reduce((a, b) => a + b, 0) / prevCycleDays.length) : 0;
      const cycleTrend = prevAvgCycle > 0 ? avgCycle - prevAvgCycle : 0;

      // Revenue per day (this month)
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const revenueByDay: { day: string; receita: number }[] = [];
      let cumulative = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${d}`;
        const dayRevenue = wonThisMonth
          .filter(lead => new Date(lead.updated_at).getDate() === d)
          .reduce((sum, lead) => sum + (lead.valor || 0), 0);
        cumulative += dayRevenue;
        revenueByDay.push({ day: dayStr, receita: cumulative });
      }

      // Funnel bottleneck
      const activeLeads = activeLeadsRes.data || [];
      const stageCount: Record<string, number> = {};
      activeLeads.forEach(lead => {
        if (lead.funnel_stage_id && !wonStageIds.includes(lead.funnel_stage_id) && !lostStageIds.has(lead.funnel_stage_id)) {
          stageCount[lead.funnel_stage_id] = (stageCount[lead.funnel_stage_id] || 0) + 1;
        }
      });

      let bottleneck: { name: string; count: number } | null = null;
      let maxCount = 0;
      Object.entries(stageCount).forEach(([stageId, count]) => {
        if (count > maxCount) {
          maxCount = count;
          const stage = (allStages || []).find(s => s.id === stageId);
          bottleneck = { name: stage?.name || 'Desconhecido', count };
        }
      });

      return { avgCycle, cycleTrend, revenueByDay, bottleneck };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ========== REALTIME ==========
  useEffect(() => {
    const leadsChannel = supabase.channel('dashboard-leads-updates').on('postgres_changes', {
      event: '*', schema: 'public', table: 'leads'
    }, () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-conversion'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-top-sellers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-loss-rate'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-forecast'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-projected'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-advanced'] });
    }).subscribe();

    return () => { supabase.removeChannel(leadsChannel); };
  }, [queryClient]);

  // ========== DERIVED VALUES ==========
  const newLeadsCount = metricsData?.newLeadsCount ?? 0;
  const newCustomersCount = metricsData?.newCustomersCount ?? 0;
  const monthRevenue = metricsData?.monthRevenue ?? 0;
  const avgTicket = metricsData?.avgTicket ?? 0;
  const lossRate = lossRateData ?? 0;
  const conversionData = conversionResult?.conversionData ?? [];
  const currentConversionRate = conversionResult?.currentConversionRate ?? 0;
  const conversionTrend = conversionResult?.conversionTrend ?? 0;
  const topSellers = topSellersResult?.topSellers ?? [];
  const topSellersLoading = !topSellersResult;
  const loading = !metricsData && !conversionResult;

  const forecast = forecastData?.forecast ?? 0;
  const projected = projectedData?.projected ?? 0;
  const projectedTrend = projectedData?.trend ?? 0;
  const avgCycle = advancedData?.avgCycle ?? 0;
  const cycleTrend = advancedData?.cycleTrend ?? 0;
  const revenueByDay = advancedData?.revenueByDay ?? [];
  const bottleneck = advancedData?.bottleneck;

  // ========== GUARDS ==========
  if (!isReady || !organizationId) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingAnimation text="Carregando dashboard..." /></div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><LoadingAnimation text="Carregando dashboard..." /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Main metrics */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title="Novos Leads" value={newLeadsCount} icon={TrendingUp} iconColor="text-cyan-500" tooltip="Total de leads captados neste mês. Inclui todas as fontes (manual, webhook, formulários)." />
        <MetricCard title="Novos Clientes" value={newCustomersCount} icon={Users} iconColor="text-green-500" tooltip="Leads que foram movidos para a etapa 'Ganho' do funil neste mês." />
        <MetricCard title="Receita do Mês" value={`R$ ${monthRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={FileText} iconColor="text-emerald-500" tooltip="Soma do valor de todos os leads marcados como 'Ganho' neste mês." />
        <MetricCard title="Ticket Médio" value={`R$ ${avgTicket.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} icon={Target} iconColor="text-blue-500" tooltip="Receita do mês dividida pelo número de vendas fechadas. Quanto maior, mais valor por venda." />
        <MetricCard title="Taxa de Perda" value={`${lossRate}%`} icon={XCircle} iconColor="text-rose-500" tooltip="Percentual de leads marcados como 'Perdido' em relação ao total de leads." />
      </div>

      {/* Row 2: New automatic metrics */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <MetricCard
          title="Ciclo Médio de Vendas"
          value={`${avgCycle} dias`}
          icon={Clock}
          iconColor="text-violet-500"
          tooltip="Tempo médio em dias entre a criação do lead e o fechamento da venda (etapa 'Ganho'). Quanto menor, mais rápido sua equipe converte."
          trend={cycleTrend !== 0 ? { value: `${Math.abs(cycleTrend)} dias`, positive: cycleTrend < 0 } : undefined}
        />
        <MetricCard
          title="Previsão de Faturamento"
          value={`R$ ${forecast.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtitle="Pipeline ativo"
          icon={TrendingUp}
          iconColor="text-amber-500"
          tooltip="Valor ponderado do pipeline ativo. Calcula: valor de cada lead × taxa histórica de conversão da etapa em que ele se encontra (últimos 90 dias)."
        />
        <MetricCard
          title="Receita Prevista"
          value={`R$ ${projected.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          subtitle="Próximo mês"
          icon={DollarSign}
          iconColor="text-emerald-500"
          tooltip="Projeção de receita do próximo mês baseada na média dos últimos 3 meses de vendas fechadas, com ajuste de tendência."
          trend={projectedTrend !== 0 ? { value: `${Math.abs(projectedTrend).toFixed(1)}%`, positive: projectedTrend > 0 } : undefined}
        />
      </div>

      {/* Row 3: Conversion + Top Sellers */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Conversion Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
              Taxa de Conversão
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[250px] text-xs">Percentual de leads que se tornaram clientes (etapa 'Ganho') em relação ao total de leads criados. Histórico dos últimos 6 meses.</TooltipContent></Tooltip></TooltipProvider>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'rgba(0, 179, 76, 0.1)' }}>
                  <Target className="w-8 h-8" style={{ color: '#00b34c' }} />
                </div>
                <div>
                  <p className="text-4xl font-bold" style={{ color: '#00b34c' }}>{currentConversionRate}%</p>
                  <p className="text-xs text-muted-foreground">Leads → Clientes</p>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded" style={{ backgroundColor: conversionTrend >= 0 ? 'rgba(0, 179, 76, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                <TrendingUp className={`w-3 h-3 ${conversionTrend < 0 ? 'rotate-180' : ''}`} style={{ color: conversionTrend >= 0 ? '#00b34c' : '#ef4444' }} />
                <span className="text-xs font-medium" style={{ color: conversionTrend >= 0 ? '#00b34c' : '#ef4444' }}>{conversionTrend >= 0 ? '+' : ''}{conversionTrend}%</span>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-2">Evolução (últimos 6 meses)</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={conversionData}>
                  <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>
                  <Bar dataKey="rate" radius={[4, 4, 0, 0]} cursor="default"
                    onMouseEnter={(_, index) => setHoveredBarIndex(index)}
                    onMouseLeave={() => setHoveredBarIndex(null)}
                    activeBar={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      const centerX = x + width / 2;
                      const newWidth = width * 1.1;
                      const newHeight = height * 1.05;
                      const newX = centerX - newWidth / 2;
                      const newY = y - (newHeight - height);
                      return <Rectangle x={newX} y={newY} width={newWidth} height={newHeight} fill={getBarColor(payload.rate, conversionData)} radius={[4, 4, 0, 0]} filter="url(#glow)" style={{ transition: 'all 0.2s ease' }} />;
                    }}
                    shape={(props: any) => {
                      const { x, y, width, height, payload, index } = props;
                      const isOtherBarHovered = hoveredBarIndex !== null && hoveredBarIndex !== index;
                      const opacity = isOtherBarHovered ? 0.3 : 1;
                      return <Rectangle x={x} y={y} width={width} height={height} fill={getBarColor(payload.rate, conversionData)} radius={[4, 4, 0, 0]} opacity={opacity} style={{ transition: 'opacity 0.2s ease' }} />;
                    }}
                  />
                  <XAxis dataKey="month" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: 'transparent' }} content={({ active, payload: tooltipPayload }) => {
                    if (active && tooltipPayload && tooltipPayload.length) {
                      const rate = tooltipPayload[0].value as number;
                      const idx = conversionData.findIndex(d => d.rate === rate);
                      const month = conversionData[idx]?.month;
                      return (
                        <div className="rounded-lg border bg-popover px-3 py-2 shadow-xl text-xs">
                          <p className="text-muted-foreground uppercase tracking-wider text-[10px]">{month}</p>
                          <p className="text-xl font-bold" style={{ color: '#00b34c' }}>{rate}%</p>
                        </div>
                      );
                    }
                    return null;
                  }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Funnel Bottleneck */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
                Gargalo do Funil
                <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[250px] text-xs">Etapa do funil com maior acúmulo de leads ativos (excluindo ganhos e perdidos). Indica onde a conversão está travando.</TooltipContent></Tooltip></TooltipProvider>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {bottleneck ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{bottleneck.name}</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{bottleneck.count}</span> leads parados nesta etapa
                  </p>
                </div>
                <p className="text-xs text-muted-foreground max-w-[250px]">
                  Esta é a etapa do funil com maior acúmulo de leads ativos. Considere ações para destravar a conversão.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nenhum gargalo identificado</p>
                <p className="text-xs text-muted-foreground">Os leads estão fluindo normalmente pelo funil</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top 5 Sellers */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
                  Top 5 Vendedores
                  <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[250px] text-xs">Ranking dos vendedores com mais receita gerada neste mês (leads na etapa 'Ganho').</TooltipContent></Tooltip></TooltipProvider>
                </CardTitle>
              </div>
              {topSellers.length > 0 && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full text-background bg-chart-4">
                  {topSellers.reduce((sum, s) => sum + s.won_leads, 0)} vendas
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {topSellersLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1"><Skeleton className="h-4 w-24 mb-1" /><Skeleton className="h-3 w-16" /></div>
                  </div>
                ))}
              </div>
            ) : topSellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <img src={topSellersEmptyState} alt="Nenhuma venda" className="w-24 h-24 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma venda este mês</p>
                <p className="text-xs text-muted-foreground mt-1">Os melhores vendedores aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSellers.map((seller, index) => {
                  const maxRevenue = topSellers[0]?.total_revenue || 1;
                  const percentage = seller.total_revenue / maxRevenue * 100;
                  const positionColors = ['bg-yellow-500 text-yellow-950', 'bg-gray-400 text-gray-950', 'bg-amber-600 text-amber-950', 'bg-muted text-muted-foreground', 'bg-muted text-muted-foreground'];
                  return (
                    <div key={seller.user_id} className="group overflow-hidden">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0 ${positionColors[index]}`}>{index + 1}</span>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={seller.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-muted">{seller.full_name?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{seller.full_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{seller.won_leads} {seller.won_leads === 1 ? 'venda' : 'vendas'}</span>
                            <span>•</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              R$ {seller.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="pl-8 pr-0">
                        <Progress value={percentage} className="h-1.5" indicatorClassName="bg-[#EAB308]" />
                      </div>
                    </div>
                  );
                })}
                <button onClick={() => navigate('/ranking')} className="w-full flex items-center justify-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border">
                  Ver ranking completo <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Revenue per day AreaChart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
            Receita Acumulada por Dia
            <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" /></TooltipTrigger><TooltipContent side="top" className="max-w-[250px] text-xs">Gráfico da receita acumulada ao longo do mês, baseado nos leads fechados como 'Ganho' por dia.</TooltipContent></Tooltip></TooltipProvider>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={revenueByDay}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
              <RechartsTooltip content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 shadow-xl text-xs">
                      <p className="text-muted-foreground">Dia {payload[0].payload.day}</p>
                      <p className="text-lg font-bold text-emerald-500">
                        R$ {(payload[0].value as number).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  );
                }
                return null;
              }} />
              <Area type="monotone" dataKey="receita" stroke="#10b981" strokeWidth={2} fill="url(#revenueGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
