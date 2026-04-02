import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { DashboardFilters, getPeriodDateRange } from '@/components/dashboard/DashboardFilters';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Users, Target, Calendar,
  DollarSign, Trophy,
  ArrowRight, Activity, Info, AlertTriangle,
  Percent
} from 'lucide-react';
import topSellersEmptyState from '@/assets/top-sellers-empty.gif';
import { useNavigate } from 'react-router-dom';

// ─── Types ───────────────────────────────────────────────────────────────────
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

// ─── Accent colors for metric values (work on both themes) ───────────────────
const accent = {
  blue: 'text-blue-500 dark:text-blue-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  purple: 'text-violet-500 dark:text-violet-400',
  amber: 'text-amber-500 dark:text-amber-400',
  red: 'text-red-500 dark:text-red-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtPercent = (v: number, d = 1) => `${v.toFixed(d)}%`;

// ─── Inline Card Component ───────────────────────────────────────────────────
const StatCard = ({
  title,
  value,
  subtitle,
  accentClass,
  tooltip,
  children,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  accentClass: string;
  tooltip: string;
  children?: React.ReactNode;
}) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-5 transition-all duration-200 hover:shadow-md hover:border-border cursor-default">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {title}
            </span>
            <Info className="w-3.5 h-3.5 text-muted-foreground/40" />
          </div>
          <div className={`text-2xl font-bold tracking-tight leading-none ${accentClass}`}
               style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {value}
          </div>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</p>
          )}
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[240px] text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

// ─── Section Label ───────────────────────────────────────────────────────────
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-3 mb-4">
    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
      {children}
    </span>
    <div className="flex-1 h-px bg-border/40" />
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────
const Dashboard = () => {
  const { user, organizationId, isReady, isSuperAdmin } = useOrganizationReady();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<'today' | 'month' | 'quarter' | 'year'>('month');
  const { startDate, endDate } = getPeriodDateRange(period);

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. Total Leads no período
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

  // 2. MQL — leads na etapa 'won'
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

  // 3. Reuniões Agendadas
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

  // 4. Receita do período
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

      return (wonLeads || []).reduce((sum, l) => sum + (l.valor || 0), 0);
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 5. Contratos fechados
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

  // 6. Leads no funil
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

  // 7. Top Vendedores
  const { data: topSellersResult } = useQuery({
    queryKey: ['dashboard-top-sellers', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return { topSellers: [] };
      const [membersResult, wonStagesResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won')
      ]);
      const members = membersResult.data || [];
      const wonStageIds = wonStagesResult.data?.map(s => s.id) || [];
      if (wonStageIds.length === 0 || members.length === 0) return { topSellers: [] };

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

      return { topSellers: sellers };
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 8. Funil por etapa — top 3 deduplicado
  const { data: funnelStages } = useQuery({
    queryKey: ['dashboard-funnel-stages', organizationId],
    queryFn: async (): Promise<FunnelStage[]> => {
      if (!organizationId) return [];

      const { data: funnels } = await supabase
        .from('sales_funnels')
        .select('id')
        .eq('organization_id', organizationId);
      const funnelIds = (funnels || []).map(f => f.id);
      if (funnelIds.length === 0) return [];

      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id, name, stage_type, position')
        .in('funnel_id', funnelIds)
        .order('position', { ascending: true });
      if (!stages || stages.length === 0) return [];

      const { data: leads } = await supabase
        .from('leads')
        .select('funnel_stage_id')
        .eq('organization_id', organizationId);
      const counts: Record<string, number> = {};
      (leads || []).forEach(l => {
        if (l.funnel_stage_id) counts[l.funnel_stage_id] = (counts[l.funnel_stage_id] || 0) + 1;
      });

      const merged: Record<string, FunnelStage> = {};
      stages.forEach(s => {
        const c = counts[s.id] || 0;
        if (merged[s.name]) {
          merged[s.name].lead_count += c;
        } else {
          merged[s.name] = { ...s, id: s.id, lead_count: c };
        }
      });

      return Object.values(merged)
        .filter(s => s.stage_type !== 'won' && s.stage_type !== 'lost')
        .sort((a, b) => b.lead_count - a.lead_count)
        .slice(0, 3);
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // 9. Sparkline
  const { data: sparklineData } = useQuery({
    queryKey: ['dashboard-sparkline', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data: wonStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');
      const wonStageIds = wonStages?.map(s => s.id) || [];
      if (wonStageIds.length === 0) return [];

      const months: { label: string; count: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        const mStart = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() - i + 1, 0, 23, 59, 59);
        const label = mStart.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');

        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('funnel_stage_id', wonStageIds)
          .gte('data_conclusao', mStart.toISOString())
          .lte('data_conclusao', mEnd.toISOString())
          .not('data_conclusao', 'is', null);

        months.push({ label, count: count || 0 });
      }
      return months;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  // 10. Vendas acumulado histórico
  const { data: totalHistoricalSold } = useQuery({
    queryKey: ['dashboard-historical-sold', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
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
        .not('data_conclusao', 'is', null);
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // REALTIME
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-total-leads'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-mql'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-appointments'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-month-revenue'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-sold-total'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-leads-funnel'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-top-sellers'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-funnel-stages'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-sparkline'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard-historical-sold'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DERIVED
  // ═══════════════════════════════════════════════════════════════════════════
  const totalLeadsValue = totalLeads ?? 0;
  const mqlValue = mqlCount ?? 0;
  const qualiRate = totalLeadsValue > 0 ? (mqlValue / totalLeadsValue) * 100 : 0;
  const apptValue = appointmentCount ?? 0;
  const revenueValue = monthRevenue ?? 0;
  const soldValue = soldTotal ?? 0;
  const funnelValue = leadsInFunnel ?? 0;
  const topSellers = topSellersResult?.topSellers ?? [];
  const topSellersLoading = !topSellersResult;
  const historicalSold = totalHistoricalSold ?? 0;
  const spark = sparklineData ?? [];
  const ticketMedio = soldValue > 0 ? Math.round(revenueValue / soldValue) : 0;

  const topFunnelStages = funnelStages || [];
  const bottleneck = topFunnelStages.length > 0 && topFunnelStages[0].lead_count > 0
    ? topFunnelStages[0]
    : null;

  const convReuniaoVenda = apptValue > 0 ? (soldValue / apptValue) * 100 : 0;
  const mqlRate = totalLeadsValue > 0 ? (mqlValue / totalLeadsValue) * 100 : 0;
  const showUpRate = 78;
  const cashCollectedRate = 92;

  const loading = totalLeads === undefined || mqlCount === undefined;

  // ═══════════════════════════════════════════════════════════════════════════
  // GUARDS
  // ═══════════════════════════════════════════════════════════════════════════
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
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Carregando dashboard..." />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-secondary/40 dark:bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-lg">
        <div className="px-6 py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-foreground">Dashboard</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">Visão geral da performance</p>
            </div>
            <DashboardFilters period={period} onPeriodChange={setPeriod} />
          </div>
        </div>
      </div>

      <div className="p-6 space-y-8">

        {/* ══════ SEÇÃO 1 — Captação de Leads (4 cards) ══════ */}
        <SectionLabel>Captação de Leads</SectionLabel>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Leads Totais"
            value={totalLeadsValue}
            subtitle={period === 'today' ? 'captados hoje' : 'captados no período'}
            accentClass={accent.blue}
            tooltip="Total de leads captados no período selecionado, independentemente do status no funil"
          />
          <StatCard
            title="MQL"
            value={mqlValue}
            subtitle="leads qualificados"
            accentClass={accent.green}
            tooltip="Leads que foram convertidos em clientes (chegaram à etapa 'Ganho' no funil)"
          />
          <StatCard
            title="Taxa de Qualificação"
            value={fmtPercent(qualiRate)}
            subtitle="MQL ÷ Leads Totais"
            accentClass={accent.purple}
            tooltip="Percentual de leads que se tornaram qualificados (MQL) em relação ao total captado"
          />
          <StatCard
            title="Ticket Médio"
            value={soldValue > 0 ? fmtCurrency(ticketMedio) : 'R$ 0'}
            subtitle="receita ÷ vendas"
            accentClass={accent.amber}
            tooltip="Valor médio por venda fechada no período (Receita Total ÷ Contratos Fechados)"
          />
        </div>

        {/* ══════ SEÇÃO 2 — Reuniões (3 cards) ══════ */}
        <SectionLabel>Reuniões</SectionLabel>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
          <StatCard
            title="Reuniões Agendadas"
            value={apptValue}
            subtitle="com evento no calendário"
            accentClass={accent.blue}
            tooltip="Leads que possuem pelo menos um evento de calendário vinculado no período selecionado"
          >
            {apptValue > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Progresso vs meta</span>
                  <span>{Math.min(100, Math.round((apptValue / 50) * 100))}%</span>
                </div>
                <Progress value={Math.min(100, (apptValue / 50) * 100)} className="h-1.5" />
              </div>
            )}
          </StatCard>

          <StatCard
            title="Realizadas vs No-show"
            value="—"
            accentClass={accent.green}
            tooltip="Reuniões de fato realizadas versus reuniões onde o lead não compareceu. Funcionalidade em desenvolvimento — aguardando campo de status de reunião no banco"
          >
            <div className="flex gap-4 mt-2">
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">Realizadas</p>
                <span className={`text-lg font-bold ${accent.green}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span>
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-muted-foreground mb-0.5">No-show</p>
                <span className={`text-lg font-bold ${accent.red}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>—</span>
              </div>
            </div>
            <div className="mt-2">
              <Progress value={0} className="h-1.5" />
            </div>
          </StatCard>

          <StatCard
            title="Taxa No-show"
            value="—"
            subtitle="em desenvolvimento"
            accentClass={accent.red}
            tooltip="Percentual de reuniões agendadas onde o lead não compareceu. Em desenvolvimento — aguardando campo de status de reunião no banco"
          >
            <div className="mt-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground/50">Alerta automático quando acima de 20%</span>
            </div>
          </StatCard>
        </div>

        {/* ══════ SEÇÃO 3 — Vendas & Conversão (5 cards) ══════ */}
        <SectionLabel>Vendas &amp; Conversão</SectionLabel>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          <StatCard
            title="Receita do Mês"
            value={fmtCurrency(revenueValue)}
            subtitle={`período: ${period}`}
            accentClass={accent.green}
            tooltip="Soma do valor financeiro de todas as vendas fechadas (leads na etapa 'Ganho') no período selecionado"
          />
          <StatCard
            title="Cash Collected"
            value="—"
            subtitle="em desenvolvimento"
            accentClass={accent.green}
            tooltip="Valor efetivamente recebido (pago) dos contratos fechados. Requer tabela de pagamentos/financeiro para implementação"
          />
          <StatCard
            title="Contratos Fechados"
            value={soldValue}
            subtitle="no período"
            accentClass={accent.blue}
            tooltip="Quantidade de leads que chegaram à etapa 'Ganho' e possuem data de conclusão registrada no período"
          />
          <StatCard
            title="Vendas no Total"
            value={historicalSold}
            subtitle="acumulado histórico"
            accentClass={accent.amber}
            tooltip="Total acumulado de todas as vendas (leads 'Ganho' com data de conclusão) desde o início da organização"
          >
            {spark.length > 0 && (
              <div className="flex items-end gap-[3px] mt-3 h-8">
                {spark.map((m, i) => {
                  const max = Math.max(...spark.map(s => s.count), 1);
                  const h = Math.max(2, (m.count / max) * 32);
                  return (
                    <TooltipProvider key={i} delayDuration={100}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={`flex-1 rounded-sm transition-all hover:opacity-80 cursor-default ${i === spark.length - 1 ? 'bg-amber-500 dark:bg-amber-400' : 'bg-amber-500/20 dark:bg-amber-400/25'}`}
                            style={{ height: h, minWidth: 6 }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-[10px]">
                          {m.label}: {m.count} vendas
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            )}
          </StatCard>
          <StatCard
            title="Leads no Funil"
            value={funnelValue}
            subtitle="em etapas ativas"
            accentClass={accent.purple}
            tooltip="Total de leads que estão em etapas ativas do funil, excluindo 'Ganho' e 'Perdido'"
          />
        </div>

        {/* ══════ SEÇÃO 4 — Taxas Chave + Distribuição + Top Representantes (3 colunas) ══════ */}
        <SectionLabel>Análise &amp; Performance</SectionLabel>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">

          {/* ── Taxas Chave ── */}
          <div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[6px] bg-violet-500/10 flex items-center justify-center">
                  <Percent className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400" />
                </div>
                <h3 className="text-sm font-medium text-foreground">Taxas Chave</h3>
              </div>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground/40 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Indicadores percentuais de performance. Verde = acima da meta, vermelho = abaixo da meta
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="space-y-4">
              {[
                { label: 'Conversão Reunião → Venda', value: convReuniaoVenda, meta: 30, tooltip: 'Percentual de reuniões que resultaram em venda' },
                { label: 'Show-up Rate', value: showUpRate, meta: 80, tooltip: 'Percentual de reuniões onde o lead compareceu. Placeholder — aguardando campo no banco', placeholder: true },
                { label: 'MQL / Leads', value: mqlRate, meta: 25, tooltip: 'Percentual de leads que se tornaram qualificados (MQL)' },
                { label: 'Cash Collected Rate', value: cashCollectedRate, meta: 90, tooltip: 'Percentual do valor contratado que foi efetivamente recebido. Placeholder — aguardando tabela financeira', placeholder: true },
              ].map((rate, i) => {
                const above = rate.value >= rate.meta;
                const displayValue = rate.placeholder ? '—' : fmtPercent(rate.value);
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <TooltipProvider delayDuration={200}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-[11px] text-muted-foreground cursor-help flex items-center gap-1">
                              {rate.label}
                              <Info className="w-2.5 h-2.5 text-muted-foreground/30" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-xs">
                            {rate.tooltip}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <span
                        className={`text-[13px] font-semibold ${rate.placeholder ? 'text-muted-foreground/40' : above ? accent.green : accent.red}`}
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {displayValue}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: rate.placeholder ? '0%' : `${Math.min(100, rate.value)}%`,
                          background: rate.placeholder ? 'transparent' : above ? 'hsl(142,71%,45%)' : 'hsl(0,72%,51%)',
                          opacity: rate.placeholder ? 0 : 0.7,
                        }}
                      />
                    </div>
                    {!rate.placeholder && (
                      <div className="flex justify-end mt-0.5">
                        <span className="text-[9px] text-muted-foreground/50">meta: {rate.meta}%</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Distribuição por Etapa (Top 3 + Gargalo) ── */}
          <div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[6px] bg-blue-500/10 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
                </div>
                <h3 className="text-sm font-medium text-foreground">Distribuição por Etapa</h3>
              </div>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground/40 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs">
                    Top 3 etapas com mais leads. A etapa com maior acúmulo é marcada como gargalo
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {topFunnelStages.length > 0 ? (
              <div className="space-y-3">
                {topFunnelStages.map(stage => {
                  const maxCount = Math.max(...topFunnelStages.map(s => s.lead_count), 1);
                  const pct = (stage.lead_count / maxCount) * 100;
                  const isBottleneck = bottleneck && stage.id === bottleneck.id && bottleneck.lead_count > 0;

                  return (
                    <div key={stage.id}>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-[11px] text-muted-foreground w-24 truncate shrink-0">{stage.name}</span>
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${isBottleneck ? 'animate-pulse' : ''}`}
                            style={{
                              width: `${pct}%`,
                              background: isBottleneck ? 'hsl(0,72%,51%)' : 'hsl(200,70%,55%)',
                              opacity: isBottleneck ? 0.85 : 0.6,
                            }}
                          />
                        </div>
                        <span
                          className={`text-[11px] w-8 text-right font-semibold ${isBottleneck ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`}
                          style={{ fontFamily: "'JetBrains Mono', monospace" }}
                        >
                          {stage.lead_count}
                        </span>
                        {isBottleneck && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap bg-red-500/10 text-red-500 dark:text-red-400">
                            ▲ Gargalo
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {bottleneck && bottleneck.lead_count > 0 && (
                  <div className="flex items-start gap-2 p-2.5 mt-2 rounded-lg border border-red-500/15 bg-red-500/5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
                    <div>
                      <p className="text-[10px] font-medium text-red-500 dark:text-red-400">
                        Gargalo: {bottleneck.name}
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {bottleneck.lead_count} leads acumulados
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground text-center py-6">Nenhuma etapa no funil</p>
            )}
          </div>

          {/* ── Top Representantes ── */}
          <div className="rounded-[13px] border border-border/60 bg-muted/80 dark:bg-card p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-[6px] bg-yellow-500/10 flex items-center justify-center">
                  <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                </div>
                <h3 className="text-sm font-medium text-foreground">Top Representantes</h3>
              </div>
              {topSellers.length > 0 && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
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
                      <Skeleton className="h-3 w-24 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : topSellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <img src={topSellersEmptyState} alt="Nenhuma venda" className="w-16 h-16 mb-2 opacity-50" />
                <p className="text-[11px] text-muted-foreground">Nenhuma venda no período</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSellers.map((seller, idx) => {
                  const maxRev = topSellers[0]?.total_revenue || 1;
                  const pct = (seller.total_revenue / maxRev) * 100;
                  const badgeStyles: React.CSSProperties[] = [
                    { background: '#facc15', color: '#422006' },
                    { background: '#94a3b8', color: '#1e293b' },
                    { background: '#d97706', color: '#451a03' },
                    { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
                    { background: 'hsl(var(--muted))', color: 'hsl(var(--muted-foreground))' },
                  ];
                  return (
                    <div key={seller.user_id}>
                      <div className="flex items-center gap-3 mb-1">
                        <span
                          className="w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0"
                          style={badgeStyles[idx]}
                        >
                          {idx + 1}
                        </span>
                        <Avatar className="h-6 w-6 shrink-0">
                          <AvatarImage src={seller.avatar_url || undefined} />
                          <AvatarFallback className="text-[9px] bg-muted text-muted-foreground">
                            {seller.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate text-foreground">{seller.full_name}</p>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <span>{seller.won_leads} {seller.won_leads === 1 ? 'venda' : 'vendas'}</span>
                            <span className="text-muted-foreground/40">·</span>
                            <span className={`font-semibold ${accent.green}`} style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                              {fmtCurrency(seller.total_revenue)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="pl-[68px]">
                        <Progress value={pct} className="h-1" />
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
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
