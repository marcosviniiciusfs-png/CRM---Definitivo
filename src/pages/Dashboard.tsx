import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { DashboardFilters, getPeriodDateRange } from '@/components/dashboard/DashboardFilters';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Users, Target, UserPlus, Calendar,
  CheckCircle, XCircle, DollarSign, Trophy,
  ArrowRight, Activity
} from 'lucide-react';
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

  // ========== METRIC CARD ==========
  const MetricTile = ({
    title,
    value,
    subtitle,
    icon: Icon,
    iconBg,
    iconColor,
    tooltip,
  }: {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ElementType;
    iconBg: string;
    iconColor: string;
    tooltip: string;
  }) => (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-[6px] border border-border/60 bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-border cursor-default">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-muted-foreground">{title}</span>
              <div className={`w-8 h-8 rounded-[6px] flex items-center justify-center ${iconBg}`}>
                <Icon className={`w-4 h-4 ${iconColor}`} />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{value}</div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const formatCurrency = (val: number) =>
    `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-lg">
        <div className="px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Visão geral da performance</p>
            </div>
            <DashboardFilters period={period} onPeriodChange={setPeriod} />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Primary Metrics — 4 cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <MetricTile
            title="Leads Totais"
            value={totalLeadsValue}
            subtitle={period === 'today' ? 'captados hoje' : `captados no período`}
            icon={Users}
            iconBg="bg-blue-500/10"
            iconColor="text-blue-500"
            tooltip="Total de leads captados no período selecionado, independentemente do status no funil"
          />
          <MetricTile
            title="Leads Qualificados"
            value={mqlValue}
            subtitle={`taxa de ${mqlRate}%`}
            icon={Target}
            iconBg="bg-violet-500/10"
            iconColor="text-violet-500"
            tooltip="Leads que foram convertidos em clientes (chegaram à etapa 'Ganho' no funil)"
          />
          <MetricTile
            title="Leads Hoje"
            value={todayLeadsValue}
            subtitle="entradas do dia"
            icon={UserPlus}
            iconBg="bg-amber-500/10"
            iconColor="text-amber-500"
            tooltip="Quantidade de novos leads criados hoje, independente do filtro de período"
          />
          <MetricTile
            title="Leads no Funil"
            value={leadsInFunnelValue}
            subtitle="em etapas ativas"
            icon={Activity}
            iconBg="bg-cyan-500/10"
            iconColor="text-cyan-500"
            tooltip="Total de leads que estão em etapas ativas do funil, excluindo 'Ganho' e 'Perdido'"
          />
        </div>

        {/* Secondary Metrics — Reuniões + Vendas */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <MetricTile
            title="Reuniões Agendadas"
            value={appointmentCountValue}
            subtitle="com evento no calendário"
            icon={Calendar}
            iconBg="bg-sky-500/10"
            iconColor="text-sky-500"
            tooltip="Leads que possuem pelo menos um evento de calendário vinculado no período"
          />
          <MetricTile
            title="Reuniões Realizadas"
            value="—"
            subtitle="em desenvolvimento"
            icon={CheckCircle}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-500"
            tooltip="Reuniões que foram de fato realizadas. Funcionalidade em desenvolvimento"
          />
          <MetricTile
            title="Taxa No-show"
            value="—"
            subtitle="em desenvolvimento"
            icon={XCircle}
            iconBg="bg-red-500/10"
            iconColor="text-red-500"
            tooltip="Percentual de reuniões agendadas onde o lead não compareceu. Em desenvolvimento"
          />
          <MetricTile
            title="Receita do Período"
            value={formatCurrency(monthRevenueValue)}
            subtitle={`${soldTotalValue} vendas fechadas`}
            icon={DollarSign}
            iconBg="bg-emerald-500/10"
            iconColor="text-emerald-500"
            tooltip="Soma do valor financeiro de todas as vendas fechadas (leads na etapa 'Ganho') no período"
          />
        </div>

        {/* Top 5 Vendedores */}
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-[6px] border border-border/60 bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-border cursor-default">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-[6px] bg-yellow-500/10 flex items-center justify-center">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                    </div>
                    <h3 className="text-sm font-medium">Top 5 Vendedores</h3>
                  </div>
                  {topSellers.length > 0 && (
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {topSellers.reduce((sum, s) => sum + s.won_leads, 0)} vendas
                    </span>
                  )}
                </div>

                {topSellersLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Skeleton className="h-7 w-7 rounded-full" />
                        <div className="flex-1">
                          <Skeleton className="h-3.5 w-24 mb-1" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : topSellers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <img src={topSellersEmptyState} alt="Nenhuma venda" className="w-16 h-16 mb-2 opacity-70" />
                    <p className="text-xs text-muted-foreground">Nenhuma venda no período</p>
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
                        <div key={seller.user_id}>
                          <div className="flex items-center gap-3 mb-1">
                            <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0 ${positionColors[index]}`}>
                              {index + 1}
                            </span>
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={seller.avatar_url || undefined} />
                              <AvatarFallback className="text-[9px] bg-muted">
                                {seller.full_name?.charAt(0)?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{seller.full_name}</p>
                              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{seller.won_leads} {seller.won_leads === 1 ? 'venda' : 'vendas'}</span>
                                <span className="text-muted-foreground/40">·</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  {formatCurrency(seller.total_revenue)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="pl-[68px]">
                            <Progress value={percentage} className="h-1" />
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => navigate('/ranking')}
                      className="w-full flex items-center justify-center gap-1 pt-2.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors border-t border-border/40 mt-2"
                    >
                      Ver ranking completo <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[220px] text-xs">
              Ranking dos 5 vendedores com maior receita no período, ordenados por valor total de vendas
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default Dashboard;
