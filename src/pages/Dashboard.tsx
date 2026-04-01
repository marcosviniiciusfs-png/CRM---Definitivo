import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { MetricCard } from '@/components/MetricCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardFilters, getPeriodDateRange } from '@/components/dashboard/DashboardFilters';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { TrendingUp, Users, Target, UserPlus, Calendar, CheckCircle, XCircle, DollarSign, Trophy, BarChart3, AlertTriangle, HelpCircle, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import topSellersEmptyState from '@/assets/top-sellers-empty.gif';
import { useNavigate } from 'react-router-dom';

// Interfaces
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

  // Period filter state
  const [period, setPeriod] = useState<'today' | 'month' | 'quarter' | 'year'>('month');
  const { startDate, endDate } = getPeriodDateRange(period);

  // ========== QUERY: Total Leads no periodo ==========
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

  // ========== QUERY: MQL (leads em etapa "Ganho") ==========
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

  // ========== QUERY: Leads Hoje ==========
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

  // ========== QUERY: Reunioes Agendadas (leads com calendar_event_id) ==========
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

  // ========== QUERY: Vendas do Mes (soma de valor em "Ganho") ==========
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

  // ========== QUERY: Vendas no Total (count em "Ganho") ==========
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

  // ========== QUERY: Leads no Funil (etapas ativas - nao won/lost) ==========
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

  // ========== QUERY: Top 5 Vendedores ==========
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

  // ========== QUERY: Funnel Stages (para visualizacao do funil) ==========
  const { data: funnelStages } = useQuery({
    queryKey: ['dashboard-funnel-stages', organizationId],
    queryFn: async (): Promise<FunnelStage[]> => {
      if (!organizationId) return [];
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id, name, stage_type, position')
        .order('position', { ascending: true });

      if (!stages) return [];

      // Get lead counts for each stage
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

  // Calculate bottleneck (stage with most leads, excluding won/lost)
  const activeStages = (funnelStages || []).filter(s => s.stage_type !== 'won' && s.stage_type !== 'lost');
  const bottleneck = activeStages.length > 0
    ? activeStages.reduce((max, stage) => stage.lead_count > max.lead_count ? stage : max, activeStages[0])
    : null;

  // Loading state
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

  return (
    <div className="space-y-6">
      {/* Header with Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe as metricas de performance do seu time
          </p>
        </div>
        <DashboardFilters period={period} onPeriodChange={setPeriod} />
      </div>

      {/* Linha 1: 4 cards principais */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <MetricCard
          title="Leads Totais"
          value={totalLeadsValue}
          icon={Users}
          iconColor="text-blue-500"
          tooltip="Total de leads captados no periodo selecionado"
        />
        <MetricCard
          title="MQL"
          value={mqlValue}
          icon={Target}
          iconColor="text-purple-500"
          tooltip="Leads que foram qualificados e viraram clientes (etapa Ganho)"
        />
        <MetricCard
          title="Taxa MQL"
          value={`${mqlRate}%`}
          icon={TrendingUp}
          iconColor="text-green-500"
          tooltip="Percentual de leads que se tornaram MQLs no periodo"
        />
        <MetricCard
          title="Leads Hoje"
          value={todayLeadsValue}
          icon={UserPlus}
          iconColor="text-yellow-500"
          tooltip="Novos leads criados hoje"
        />
      </div>

      {/* Linha 2: 3 cards - Reunioes */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <MetricCard
          title="Reunioes Agendadas"
          value={appointmentCountValue}
          icon={Calendar}
          iconColor="text-blue-500"
          tooltip="Leads com reuniao agendada no periodo"
        />
        <MetricCard
          title="Realizadas vs No-Show"
          value="--"
          icon={CheckCircle}
          iconColor="text-green-500"
          tooltip="Reunioes realizadas vs reunioes com no-show (em desenvolvimento)"
        />
        <MetricCard
          title="Taxa No-Show"
          value="--"
          icon={XCircle}
          iconColor="text-red-500"
          tooltip="Percentual de reunioes com no-show (em desenvolvimento)"
        />
      </div>

      {/* Linha 3: 4 cards - Vendas */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <MetricCard
          title="Vendas do Mes"
          value={`R$ ${monthRevenueValue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          iconColor="text-emerald-500"
          tooltip="Soma do valor de todas as vendas fechadas no periodo"
        />
        <MetricCard
          title="Vendas no Total"
          value={soldTotalValue}
          icon={Trophy}
          iconColor="text-green-500"
          tooltip="Quantidade de vendas fechadas no periodo"
        />
        <MetricCard
          title="Leads no Funil"
          value={leadsInFunnelValue}
          icon={Users}
          iconColor="text-blue-500"
          tooltip="Leads em etapas ativas do funil (nao ganhos nem perdidos)"
        />
        <Card className="transition-all duration-300 hover:shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              Top 5 Vendedores
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px] text-xs">
                    Ranking dos vendedores com mais receita gerada no periodo
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <Trophy className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold">
              {topSellers.length > 0 ? `${topSellers.length} vendedores` : 'Sem vendas'}
            </div>
            <p className="text-xs text-muted-foreground">Ranking por receita</p>
          </CardContent>
        </Card>
      </div>

      {/* Seções inferiores */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {/* Card: Gargalo do Funil */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
                Gargalo do Funil
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px] text-xs">
                      Etapa do funil com maior acumulo de leads ativos
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {bottleneck && bottleneck.lead_count > 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-amber-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{bottleneck.name}</p>
                  <p className="text-muted-foreground text-sm mt-1">
                    <span className="font-semibold text-amber-600 dark:text-amber-400">{bottleneck.lead_count}</span> leads parados nesta etapa
                  </p>
                </div>
                <p className="text-xs text-muted-foreground max-w-[250px]">
                  Esta e a etapa do funil com maior acumulo de leads ativos. Considere acoes para destravar a conversao.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center space-y-2">
                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <p className="text-sm font-medium">Nenhum gargalo identificado</p>
                <p className="text-xs text-muted-foreground">Os leads estao fluindo normalmente pelo funil</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Card: Top 5 Vendedores Detalhado */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <CardTitle className="text-lg font-semibold flex items-center gap-1.5">
                Top 5 Vendedores
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px] text-xs">
                      Ranking dos vendedores com mais receita gerada no periodo
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24 mb-1" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : topSellers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <img src={topSellersEmptyState} alt="Nenhuma venda" className="w-24 h-24 mb-3" />
              <p className="text-sm text-muted-foreground">Nenhuma venda no periodo</p>
              <p className="text-xs text-muted-foreground mt-1">Os melhores vendedores aparecerão aqui</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topSellers.map((seller, index) => {
                const maxRevenue = topSellers[0]?.total_revenue || 1;
                const percentage = (seller.total_revenue / maxRevenue) * 100;
                const positionColors = [
                  'bg-yellow-500 text-yellow-950',
                  'bg-gray-400 text-gray-950',
                  'bg-amber-600 text-amber-950',
                  'bg-muted text-muted-foreground',
                  'bg-muted text-muted-foreground'
                ];

                return (
                  <div key={seller.user_id} className="group overflow-hidden">
                    <div className="flex items-center gap-3 mb-1.5">
                      <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0 ${positionColors[index]}`}>
                        {index + 1}
                      </span>
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarImage src={seller.avatar_url || undefined} />
                        <AvatarFallback className="text-xs bg-muted">
                          {seller.full_name?.charAt(0)?.toUpperCase() || '?'}
                        </AvatarFallback>
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
              <button
                onClick={() => navigate('/ranking')}
                className="w-full flex items-center justify-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
              >
                Ver ranking completo <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
