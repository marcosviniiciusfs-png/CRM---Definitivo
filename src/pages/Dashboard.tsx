import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardFilters, getPeriodDateRange } from '@/components/dashboard/DashboardFilters';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, Users, Target, UserPlus, Calendar, CheckCircle, XCircle, DollarSign, Trophy, AlertTriangle, HelpCircle, ArrowRight, Activity, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import topSellersEmptyState from '@/assets/top-sellers-empty.gif';
import { useNavigate } from 'react-router-dom';

interface TopSeller {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
}

interface FunnelStage {
  id: string;
  name: string;
  stage_type: string;
  position: number;
  lead_count: number;
}

const Dashboard = () => {
  const { user, organizationId, isReady, isSuperAdmin } = useOrganizationReady();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<'today' | 'month' | 'quarter' | 'year'>('month');
  const { startDate, endDate } = getPeriodDateRange(period);

  // ========== QUERIES ==========
  const { data: totalLeads } = useQuery({
    queryKey: ['dashboard-total-leads', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: mqlCount } = useQuery({
    queryKey: ['dashboard-mql', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { data: wonStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];
      if (wonStageIds.length === 0) return 0;

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', wonStageIds)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: todayLeads } = useQuery({
    queryKey: ['dashboard-today-leads', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString());
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 2,
  });

  const { data: appointmentCount } = useQuery({
    queryKey: ['dashboard-appointments', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('calendar_event_id', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: monthRevenue } = useQuery({
    queryKey: ['dashboard-month-revenue', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { data: wonStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];
      if (wonStageIds.length === 0) return 0;

      const { data: wonLeads } = await supabase
        .from('leads')
        .select('valor')
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', wonStageIds)
        .gte('data_conclusao', startDate.toISOString())
        .lte('data_conclusao', endDate.toISOString())
        .not('data_conclusao', 'is', null);

      const revenue = (wonLeads || []).reduce((sum, lead) => sum + (lead.valor || 0), 0);
      return revenue;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: soldTotal } = useQuery({
    queryKey: ['dashboard-sold-total', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { data: wonStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];
      if (wonStageIds.length === 0) return 0;

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', wonStageIds)
        .gte('data_conclusao', startDate.toISOString())
        .lte('data_conclusao', endDate.toISOString())
        .not('data_conclusao', 'is', null);
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: leadsInFunnel } = useQuery({
    queryKey: ['dashboard-leads-funnel', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { data: allStages } = await supabase
        .from('funnel_stages')
        .select('id, stage_type');
      const activeStageIds = (allStages || [])
        .filter(s => s.stage_type !== 'won' && s.stage_type !== 'lost')
        .map(s => s.id);

      if (activeStageIds.length === 0) return 0;

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', activeStageIds);
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  const { data: topSellersResult } = useQuery({
    queryKey: ['dashboard-top-sellers', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return { topSellers: [], loading: false };
      const [membersResult, wonStagesResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won')
      ]);
      const members = membersResult.data || [];
      const wonStageIds = wonStagesResult.data?.map(s => s.id) || [];
      if (wonStageIds.length === 0 || members.length === 0) return { topSellers: [], loading: false };

      const memberUserIds = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
      const [profilesResult, wonLeadsResult] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', memberUserIds),
        supabase.from('leads')
          .select('responsavel_user_id, valor')
          .eq('organization_id', organizationId)
          .in('funnel_stage_id', wonStageIds)
          .gte('updated_at', startDate.toISOString())
          .lte('updated_at', endDate.toISOString())
      ]);

      const profiles = profilesResult.data || [];
      const wonLeads = wonLeadsResult.data || [];
      const salesByUser: Record<string, { won_leads: number; total_revenue: number }> = {};

      wonLeads.forEach(lead => {
        if (lead.responsavel_user_id) {
          if (!salesByUser[lead.responsavel_user_id]) {
            salesByUser[lead.responsavel_user_id] = { won_leads: 0, total_revenue: 0 };
          }
          salesByUser[lead.responsavel_user_id].won_leads++;
          salesByUser[lead.responsavel_user_id].total_revenue += lead.valor || 0;
        }
      });

      const sellers: TopSeller[] = memberUserIds
        .filter((userId: string) => salesByUser[userId]?.won_leads > 0)
        .map((userId: string) => {
          const profile = profiles.find(p => p.user_id === userId);
          const sales = salesByUser[userId];
          return {
            user_id: userId,
            full_name: profile?.full_name || members.find((m: any) => m.user_id === userId)?.full_name || 'Colaborador',
            avatar_url: profile?.avatar_url || null,
            won_leads: sales.won_leads,
            total_revenue: sales.total_revenue
          };
        })
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);

      return { topSellers: sellers, loading: false };
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  const { data: funnelStages } = useQuery({
    queryKey: ['dashboard-funnel-stages', organizationId],
    queryFn: async (): Promise<FunnelStage[]> => {
      if (!organizationId) return [];
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id, name, stage_type, position')
        .order('position', { ascending: true });

      if (!stages) return [];

      const { data: leads } = await supabase
        .from('leads')
        .select('funnel_stage_id')
        .eq('organization_id', organizationId);

      const stageCounts: Record<string, number> = {};
      (leads || []).forEach(lead => {
        if (lead.funnel_stage_id) {
          stageCounts[lead.funnel_stage_id] = (stageCounts[lead.funnel_stage_id] || 0) + 1;
        }
      });

      return stages.map(stage => ({
        ...stage,
        lead_count: stageCounts[stage.id] || 0
      }));
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ========== REALTIME SUBSCRIPTION ==========
  useEffect(() => {
    const leadsChannel = supabase
      .channel('dashboard-leads-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads'
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-total-leads'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-mql'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-today-leads'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-appointments'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-month-revenue'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-sold-total'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-leads-funnel'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-top-sellers'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-funnel-stages'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
    };
  }, [queryClient]);

  // ========== DERIVED VALUES ==========
  const totalLeadsValue = totalLeads ?? 0;
  const mqlValue = mqlCount ?? 0;
  const mqlRate = totalLeadsValue > 0 ? ((mqlValue / totalLeadsValue) * 100).toFixed(1) : '0';
  const todayLeadsValue = todayLeads ?? 0;
  const appointmentCountValue = appointmentCount ?? 0;
  const monthRevenueValue = monthRevenue ?? 0;
  const soldTotalValue = soldTotal ?? 0;
  const leadsInFunnelValue = leadsInFunnel ?? 0;
  const topSellers = topSellersResult?.topSellers ?? [];
  const topSellersLoading = !topSellersResult;

  const activeStages = (funnelStages || []).filter(s => s.stage_type !== 'won' && s.stage_type !== 'lost');
  const bottleneck = activeStages.length > 0
    ? activeStages.reduce((max, stage) => stage.lead_count > max.lead_count ? stage : max, activeStages[0])
    : null;

  const loading = totalLeads === undefined || mqlCount === undefined;

  // ========== GUARDS ==========
  if (!isReady || (!organizationId && !isSuperAdmin)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
        <LoadingAnimation text="Carregando workspace..." />
        {!isReady && (
          <p className="text-xs text-muted-foreground mt-4 animate-in fade-in duration-1000">
            Aguardando inicialização do sistema...
          </p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingAnimation text="Carregando dashboard..." />
      </div>
    );
  }

  // ========== METRIC CARD COMPONENT ==========
  const MetricTile = ({
    title,
    value,
    subtitle,
    icon: Icon,
    accentColor,
    tooltip
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    accentColor: string;
    tooltip?: string;
  }) => (
    <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 transition-all duration-300 hover:border-border hover:bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20">
      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor} opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </span>
            {tooltip && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px] text-xs">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
          )}
        </div>
        <div className={`p-2.5 rounded-lg ${accentColor.replace('bg-', 'bg-').replace('-500', '-500/10')} transition-transform duration-300 group-hover:scale-110`}>
          <Icon className={`w-4 h-4 ${accentColor.replace('bg-', 'text-').replace('-500', '-500')}`} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Visão geral da performance
              </p>
            </div>
            <DashboardFilters period={period} onPeriodChange={setPeriod} />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Row 1: Primary Metrics */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-muted-foreground">Métricas Principais</h2>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <MetricTile
              title="Leads Totais"
              value={totalLeadsValue}
              icon={Users}
              accentColor="bg-blue-500"
              tooltip="Total de leads captados no período"
            />
            <MetricTile
              title="MQL"
              value={mqlValue}
              icon={Target}
              accentColor="bg-purple-500"
              tooltip="Leads que viraram clientes"
            />
            <MetricTile
              title="Taxa MQL"
              value={`${mqlRate}%`}
              icon={TrendingUp}
              accentColor="bg-emerald-500"
              tooltip="Percentual de conversão em MQL"
            />
            <MetricTile
              title="Leads Hoje"
              value={todayLeadsValue}
              icon={UserPlus}
              accentColor="bg-amber-500"
              tooltip="Novos leads criados hoje"
            />
          </div>
        </section>

        {/* Row 2: Meetings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-muted-foreground">Reuniões</h2>
          </div>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
            <MetricTile
              title="Agendadas"
              value={appointmentCountValue}
              icon={Calendar}
              accentColor="bg-blue-500"
              tooltip="Leads com reunião agendada"
            />
            <MetricTile
              title="Realizadas vs No-show"
              value="—"
              icon={CheckCircle}
              accentColor="bg-green-500"
              tooltip="Em desenvolvimento"
            />
            <MetricTile
              title="Taxa No-show"
              value="—"
              icon={XCircle}
              accentColor="bg-red-500"
              tooltip="Em desenvolvimento"
            />
          </div>
        </section>

        {/* Row 3: Sales */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-medium text-muted-foreground">Vendas</h2>
          </div>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <MetricTile
              title="Receita do Período"
              value={`R$ ${monthRevenueValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              icon={DollarSign}
              accentColor="bg-emerald-500"
              tooltip="Soma do valor das vendas"
            />
            <MetricTile
              title="Vendas Fechadas"
              value={soldTotalValue}
              icon={Trophy}
              accentColor="bg-primary"
              tooltip="Quantidade de vendas no período"
            />
            <MetricTile
              title="Leads no Funil"
              value={leadsInFunnelValue}
              icon={Users}
              accentColor="bg-cyan-500"
              tooltip="Leads em etapas ativas"
            />
            <div className="group relative overflow-hidden rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-5 transition-all duration-300 hover:border-border hover:bg-card hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20">
              <div className="absolute top-0 left-0 w-1 h-full bg-yellow-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Top Vendedores
                    </span>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[200px] text-xs">
                          Ranking por receita no período
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="text-2xl font-bold tracking-tight">
                    {topSellers.length > 0 ? topSellers.length : '—'}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {topSellers.length > 0 ? 'vendedores ativos' : 'sem vendas'}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-yellow-500/10 transition-transform duration-300 group-hover:scale-110">
                  <Trophy className="w-4 h-4 text-yellow-500" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Row 4: Bottleneck + Top Sellers */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
          {/* Bottleneck Card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                </div>
                <CardTitle className="text-base font-semibold">Gargalo do Funil</CardTitle>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px] text-xs">
                      Etapa com maior acúmulo de leads
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </CardHeader>
            <CardContent>
              {bottleneck && bottleneck.lead_count > 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/20">
                    <Zap className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{bottleneck.name}</p>
                    <p className="text-muted-foreground text-sm mt-1">
                      <span className="font-medium text-amber-600 dark:text-amber-400">{bottleneck.lead_count}</span> leads parados
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[220px]">
                    Considere ações para destravar a conversão nesta etapa
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-green-500/20 flex items-center justify-center border border-emerald-500/20">
                    <CheckCircle className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium">Nenhum gargalo</p>
                  <p className="text-xs text-muted-foreground">Leads fluindo normalmente</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Sellers Card */}
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-yellow-500/10">
                    <Trophy className="w-4 h-4 text-yellow-500" />
                  </div>
                  <CardTitle className="text-base font-semibold">Top 5 Vendedores</CardTitle>
                </div>
                {topSellers.length > 0 && (
                  <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
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
                      <div className="flex-1">
                        <Skeleton className="h-4 w-24 mb-1" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topSellers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                  <img src={topSellersEmptyState} alt="Nenhuma venda" className="w-20 h-20 mb-3 opacity-80" />
                  <p className="text-sm text-muted-foreground">Nenhuma venda no período</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topSellers.map((seller, index) => {
                    const maxRevenue = topSellers[0]?.total_revenue || 1;
                    const percentage = (seller.total_revenue / maxRevenue) * 100;
                    const positionColors = [
                      'bg-yellow-500 text-yellow-950',
                      'bg-slate-400 text-slate-950',
                      'bg-amber-600 text-amber-950',
                      'bg-muted text-muted-foreground',
                      'bg-muted text-muted-foreground'
                    ];

                    return (
                      <div key={seller.user_id} className="group">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0 ${positionColors[index]}`}>
                            {index + 1}
                          </span>
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={seller.avatar_url || undefined} />
                            <AvatarFallback className="text-[10px] bg-muted">
                              {seller.full_name?.charAt(0)?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{seller.full_name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{seller.won_leads} {seller.won_leads === 1 ? 'venda' : 'vendas'}</span>
                              <span className="text-muted-foreground/50">•</span>
                              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                R$ {seller.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="pl-[76px]">
                          <Progress value={percentage} className="h-1" />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => navigate('/ranking')}
                    className="w-full flex items-center justify-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/50 mt-3"
                  >
                    Ver ranking completo <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
