import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowUpRight, ArrowDownRight, Calendar, Phone, DollarSign, Users, TrendingUp, Trophy, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════
interface TopSeller {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
const fmtCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const fmtPercent = (v: number, d = 1) => `${v.toFixed(d)}%`;

const getInitials = (name: string) => {
  const parts = name.split(' ');
  return parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2).toUpperCase();
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACCENT COLORS (adaptáveis ao tema)
// ═══════════════════════════════════════════════════════════════════════════════
const accent = {
  blue: 'text-blue-500 dark:text-blue-400',
  green: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-500 dark:text-amber-400',
  red: 'text-red-500 dark:text-red-400',
  purple: 'text-violet-500 dark:text-violet-400',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PERIOD BUTTON COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const PeriodButton = ({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
      active
        ? 'bg-primary text-primary-foreground'
        : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
    }`}
  >
    {children}
  </button>
);

// ═══════════════════════════════════════════════════════════════════════════════
// METRIC CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const MetricCard = ({
  title,
  value,
  variation,
  sparkline,
  color = '#4a7cfb',
  subtitle,
  format = 'number'
}: {
  title: string;
  value: number;
  variation?: number;
  sparkline?: number[];
  color?: string;
  subtitle?: string;
  format?: 'number' | 'currency' | 'percent';
}) => {
  const displayValue = format === 'currency'
    ? fmtCurrency(value)
    : format === 'percent'
    ? fmtPercent(value)
    : value.toLocaleString('pt-BR');

  const maxSpark = sparkline && sparkline.length > 0 ? Math.max(...sparkline) : 1;

  return (
    <div className="bg-card rounded-xl p-5 border border-border hover:border-border/80 transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        {variation !== undefined && (
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
            variation >= 0
              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'bg-red-500/10 text-red-600 dark:text-red-400'
          }`}>
            {variation >= 0 ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {Math.abs(variation)}%
          </div>
        )}
      </div>

      <div className="text-2xl font-bold text-foreground mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>
        {displayValue}
      </div>

      {subtitle && (
        <div className="text-[11px] text-muted-foreground mb-3">{subtitle}</div>
      )}

      {sparkline && sparkline.length > 0 && (
        <div className="flex items-end gap-[2px] h-8 mt-2">
          {sparkline.map((v, i) => {
            const h = Math.max(4, (v / maxSpark) * 32);
            const isLast = i === sparkline.length - 1;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm transition-all hover:opacity-80"
                style={{
                  height: h,
                  minWidth: 4,
                  backgroundColor: isLast ? color : `${color}40`,
                  opacity: isLast ? 1 : 0.5
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TODAY HIGHLIGHT CARD
// ═══════════════════════════════════════════════════════════════════════════════
const TodayCard = ({
  icon: Icon,
  label,
  value,
  subValue,
  color
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  color: string;
}) => (
  <div className="flex items-center gap-3 p-4 bg-card rounded-xl border border-border">
    <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
      <Icon className="w-5 h-5" style={{ color }} />
    </div>
    <div className="flex-1">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-lg font-bold text-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>
        {value}
      </div>
      {subValue && <div className="text-[10px] text-muted-foreground">{subValue}</div>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE BREAKDOWN CARD
// ═══════════════════════════════════════════════════════════════════════════════
const RevenueCard = ({
  label,
  value,
  active
}: {
  label: string;
  value: number;
  active?: boolean;
}) => (
  <div className={`p-4 rounded-xl text-center transition-all ${active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
    <div className={`text-[10px] uppercase tracking-wider mb-1 ${active ? 'text-emerald-600/70 dark:text-emerald-400/70' : ''}`}>
      {label}
    </div>
    <div className="text-lg font-bold" style={{ fontFamily: "'DM Mono', monospace" }}>
      {fmtCurrency(value)}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// FUNNEL BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const FunnelBar = ({
  etapa,
  valor,
  max,
  color
}: {
  etapa: string;
  valor: number;
  max: number;
  color: string;
}) => {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted-foreground w-28 truncate">{etapa}</span>
      <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[12px] font-semibold text-foreground w-10 text-right" style={{ fontFamily: "'DM Mono', monospace" }}>
        {valor}
      </span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// RANKING ROW COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const RankingRow = ({
  rank,
  name,
  initials,
  vendas,
  receita,
  maxReceita
}: {
  rank: number;
  name: string;
  initials: string;
  vendas: number;
  receita: number;
  maxReceita: number;
}) => {
  const pct = maxReceita > 0 ? (receita / maxReceita) * 100 : 0;
  const colors = ['#3ecf8e', '#4a7cfb', '#f5a623', '#9ca3af', '#6b7280'];
  const color = colors[rank - 1] || colors[4];

  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
        style={{ backgroundColor: color, color: rank <= 2 ? '#000' : '#fff' }}
      >
        {rank}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-foreground truncate">{name}</span>
          <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "'DM Mono', monospace" }}>
            {vendas} vendas
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ORIGIN BAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const OriginBar = ({
  canal,
  valor,
  max,
  cor
}: {
  canal: string;
  valor: number;
  max: number;
  cor: string;
}) => {
  const pct = max > 0 ? (valor / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-[11px] text-muted-foreground w-24 truncate">{canal}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: cor }}
        />
      </div>
      <span className="text-[11px] text-foreground w-8 text-right" style={{ fontFamily: "'DM Mono', monospace" }}>
        {valor}
      </span>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { organizationId, isReady, isSuperAdmin } = useOrganizationReady();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<'today' | 'month' | 'quarter' | 'year'>('month');

  // Date range helper
  const getDateRange = (p: string) => {
    const now = new Date();
    let start: Date, end: Date;

    switch (p) {
      case 'today':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        break;
      case 'quarter':
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qMonth, 1);
        end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    return { startDate: start, endDate: end };
  };

  const { startDate, endDate } = getDateRange(period);

  // ════════════════════════════════════════════════════════════════════════════
  // QUERIES
  // ════════════════════════════════════════════════════════════════════════════

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

  // 2. Leads atendidos (com responsável)
  const { data: attendedLeads } = useQuery({
    queryKey: ['dashboard-attended-leads', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('responsavel_user_id', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 3. Reuniões realizadas
  const { data: realizedCount } = useQuery({
    queryKey: ['dashboard-realized', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status_reuniao', 'realizada')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 4. Propostas enviadas
  const { data: proposalsCount } = useQuery({
    queryKey: ['dashboard-proposals', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id')
        .ilike('name', '%proposta%');
      const stageIds = stages?.map(s => s.id) || [];
      if (stageIds.length === 0) return 0;

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .in('funnel_stage_id', stageIds)
        .gte('updated_at', startDate.toISOString())
        .lte('updated_at', endDate.toISOString());
      return count || 0;
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 5. Vendas no período
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

  // 6. Receita do período
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

  // 7. Receita trimestre
  const { data: quarterRevenue } = useQuery({
    queryKey: ['dashboard-quarter-revenue', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qMonth, 1);

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
        .gte('data_conclusao', start.toISOString())
        .not('data_conclusao', 'is', null);

      return (wonLeads || []).reduce((sum, l) => sum + (l.valor || 0), 0);
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // 8. Receita ano
  const { data: yearRevenue } = useQuery({
    queryKey: ['dashboard-year-revenue', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 1);

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
        .gte('data_conclusao', start.toISOString())
        .not('data_conclusao', 'is', null);

      return (wonLeads || []).reduce((sum, l) => sum + (l.valor || 0), 0);
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // 9. Agendamentos hoje
  const { data: todayAppointments } = useQuery({
    queryKey: ['dashboard-today-appointments', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .not('calendar_event_id', 'is', null)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60,
  });

  // 10. Reuniões realizadas hoje
  const { data: todayRealized } = useQuery({
    queryKey: ['dashboard-today-realized', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status_reuniao', 'realizada')
        .gte('updated_at', start.toISOString())
        .lte('updated_at', end.toISOString());
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60,
  });

  // 11. Leads criados hoje
  const { data: todayLeads } = useQuery({
    queryKey: ['dashboard-today-leads', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60,
  });

  // 11. Top Vendedores
  const { data: topSellersResult } = useQuery({
    queryKey: ['dashboard-top-sellers', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return [];
      const [membersResult, wonStagesResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won')
      ]);
      const members = membersResult.data || [];
      const wonStageIds = wonStagesResult.data?.map(s => s.id) || [];
      if (wonStageIds.length === 0 || members.length === 0) return [];

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

      return memberUserIds
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
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 12. Origem dos leads
  const { data: leadsBySource } = useQuery({
    queryKey: ['dashboard-leads-source', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return [];
      const { data } = await supabase
        .from('leads')
        .select('source')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      const counts: Record<string, number> = {};
      (data || []).forEach(l => {
        const src = l.source || 'Outros';
        counts[src] = (counts[src] || 0) + 1;
      });

      const colors: Record<string, string> = {
        'Instagram': '#4a7cfb',
        'Google Ads': '#3ecf8e',
        'Indicação': '#f5a623',
        'WhatsApp': '#a78bfa',
        'Facebook Leads': '#e05252',
        'Webhook': '#6366f1',
        'Manual': '#9ca3af',
        'Outros': '#6b7280'
      };

      return Object.entries(counts)
        .map(([canal, valor]) => ({ canal, valor, cor: colors[canal] || colors['Outros'] }))
        .sort((a, b) => b.valor - a.valor);
    },
    enabled: !!organizationId && !!startDate,
    staleTime: 1000 * 60 * 5,
  });

  // 13. Sparkline mensal
  const { data: sparklineData } = useQuery({
    queryKey: ['dashboard-sparkline', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const months: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        const mStart = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() - i + 1, 0, 23, 59, 59);

        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('created_at', mStart.toISOString())
          .lte('created_at', mEnd.toISOString());

        months.push(count || 0);
      }
      return months;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 10,
  });

  // ════════════════════════════════════════════════════════════════════════════
  // REALTIME
  // ════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const ch = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  // ════════════════════════════════════════════════════════════════════════════
  // DERIVED VALUES
  // ════════════════════════════════════════════════════════════════════════════
  const totalLeadsValue = totalLeads ?? 0;
  const attendedLeadsValue = attendedLeads ?? 0;
  const attendedPct = totalLeadsValue > 0 ? Math.round((attendedLeadsValue / totalLeadsValue) * 100) : 0;
  const realizedValue = realizedCount ?? 0;
  const proposalsValue = proposalsCount ?? 0;
  const soldValue = soldTotal ?? 0;
  const revenueValue = monthRevenue ?? 0;
  const quarterValue = quarterRevenue ?? 0;
  const yearValue = yearRevenue ?? 0;
  const todayApptValue = todayAppointments ?? 0;
  const todayRealizedValue = todayRealized ?? 0;
  const todayLeadsValue = todayLeads ?? 0;
  const ticketMedio = soldValue > 0 ? Math.round(revenueValue / soldValue) : 0;
  const topSellers = topSellersResult ?? [];
  const sources = leadsBySource ?? [];
  const spark = sparklineData ?? [];

  const loading = totalLeads === undefined;

  // Funil data
  const funilData = [
    { etapa: 'Leads captados', valor: totalLeadsValue, color: '#4a7cfb' },
    { etapa: 'Leads atendidos', valor: attendedLeadsValue, color: '#3ecf8e' },
    { etapa: 'Reuniões realizadas', valor: realizedValue, color: '#f5a623' },
    { etapa: 'Propostas enviadas', valor: proposalsValue, color: '#a78bfa' },
    { etapa: 'Vendas fechadas', valor: soldValue, color: '#3ecf8e' }
  ];
  const maxFunil = Math.max(...funilData.map(f => f.valor), 1);

  // Conversões data
  const conversoesData = [
    { etapa: 'Novo lead', valor: totalLeadsValue },
    { etapa: 'Contato realizado', valor: attendedLeadsValue },
    { etapa: 'Reunião agendada', valor: todayApptValue },
    { etapa: 'Reunião realizada', valor: realizedValue },
    { etapa: 'Proposta enviada', valor: proposalsValue },
    { etapa: 'Venda fechada', valor: soldValue }
  ];
  const maxConversoes = Math.max(...conversoesData.map(c => c.valor), 1);

  // ════════════════════════════════════════════════════════════════════════════
  // GUARDS
  // ════════════════════════════════════════════════════════════════════════════
  if (!isReady || (!organizationId && !isSuperAdmin)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
        <LoadingAnimation text="Carregando workspace..." />
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

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-secondary/40 dark:bg-background p-6" style={{ fontFamily: "'Syne', sans-serif" }}>
      {/* ════════════════════════════════════════════════════════════════════════
          HEADER
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-4 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Dashboard Comercial</h1>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe a performance da sua equipe</p>
        </div>
        <div className="flex gap-2">
          <PeriodButton active={period === 'today'} onClick={() => setPeriod('today')}>Hoje</PeriodButton>
          <PeriodButton active={period === 'month'} onClick={() => setPeriod('month')}>Este Mês</PeriodButton>
          <PeriodButton active={period === 'quarter'} onClick={() => setPeriod('quarter')}>Trimestre</PeriodButton>
          <PeriodButton active={period === 'year'} onClick={() => setPeriod('year')}>Ano</PeriodButton>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BLOCO 1 — VISÃO GERAL DO MÊS
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          title="Leads no Mês"
          value={totalLeadsValue}
          variation={12}
          sparkline={spark}
          color="#4a7cfb"
          subtitle="captados no período"
        />
        <MetricCard
          title="Leads Atendidos"
          value={attendedPct}
          variation={5}
          sparkline={[60, 65, 68, 72, 65, 70, attendedPct]}
          color="#3ecf8e"
          subtitle={`${attendedLeadsValue} de ${totalLeadsValue} leads`}
          format="percent"
        />
        <MetricCard
          title="Vendas no Mês"
          value={soldValue}
          variation={soldValue > 20 ? 8 : -3}
          sparkline={[15, 18, 22, 20, 25, 23, soldValue]}
          color="#3ecf8e"
          subtitle="contratos fechados"
        />
        <MetricCard
          title="Ticket Médio"
          value={ticketMedio}
          variation={8}
          sparkline={[3500, 3800, 4200, 4000, 4500, 4300, ticketMedio]}
          color="#f5a623"
          subtitle="receita ÷ vendas"
          format="currency"
        />
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BLOCO 2 — HOJE
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Hoje</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <TodayCard
            icon={Users}
            label="Leads Hoje"
            value={todayLeadsValue}
            subValue="captados hoje"
            color="#a78bfa"
          />
          <TodayCard
            icon={Calendar}
            label="Agendamentos Hoje"
            value={todayApptValue}
            subValue="reuniões marcadas"
            color="#4a7cfb"
          />
          <TodayCard
            icon={Phone}
            label="Reuniões Realizadas"
            value={todayApptValue > 0 ? `${todayRealizedValue}/${todayApptValue}` : '0/0'}
            subValue="realizadas / agendadas"
            color="#3ecf8e"
          />
          <TodayCard
            icon={DollarSign}
            label="Faturamento Gerado"
            value={fmtCurrency(Math.round(revenueValue * 0.1))}
            subValue="comissões estimadas"
            color="#f5a623"
          />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BLOCO 3 — FINANCEIRO
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Receita Total */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Receita Total
          </h3>
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
            <RevenueCard label="Mês" value={revenueValue} active={period === 'month'} />
            <RevenueCard label="Trimestre" value={quarterValue} active={period === 'quarter'} />
            <RevenueCard label="Ano" value={yearValue} active={period === 'year'} />
          </div>
        </div>

        {/* Funil Leads vs Vendas */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            Funil Leads → Vendas
          </h3>
          <div className="space-y-3">
            {funilData.map((item, i) => (
              <FunnelBar key={i} {...item} max={maxFunil} />
            ))}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          BLOCO 4 — ANÁLISES
          ════════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversões por Etapa */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-500" />
            Conversões por Etapa
          </h3>
          <div className="space-y-2">
            {conversoesData.map((item, i) => {
              const colors = ['#4a7cfb', '#3ecf8e', '#f5a623', '#a78bfa', '#e05252', '#3ecf8e'];
              return (
                <FunnelBar
                  key={i}
                  etapa={item.etapa}
                  valor={item.valor}
                  max={maxConversoes}
                  color={colors[i]}
                />
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Taxa de conversão total</span>
              <span className="text-emerald-500 font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
                {totalLeadsValue > 0 ? fmtPercent((soldValue / totalLeadsValue) * 100) : '0%'}
              </span>
            </div>
          </div>
        </div>

        {/* Ranking + Performance */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Ranking + Performance
          </h3>
          {topSellers.length > 0 ? (
            <>
              <div className="space-y-1">
                {topSellers.map((seller, idx) => (
                  <RankingRow
                    key={seller.user_id}
                    rank={idx + 1}
                    name={seller.full_name}
                    initials={getInitials(seller.full_name)}
                    vendas={seller.won_leads}
                    receita={seller.total_revenue}
                    maxReceita={topSellers[0]?.total_revenue || 1}
                  />
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-border">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Meta do mês</span>
                  <span className="text-foreground font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
                    {fmtPercent((soldValue / 30) * 100)} atingida
                  </span>
                </div>
                <Progress value={(soldValue / 30) * 100} className="h-2 mt-2" />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Nenhuma venda no período</p>
          )}
          <button
            onClick={() => navigate('/ranking')}
            className="w-full mt-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
          >
            Ver ranking completo →
          </button>
        </div>

        {/* Origem dos Leads */}
        <div className="bg-card rounded-xl p-5 border border-border">
          <h3 className="text-sm font-medium text-muted-foreground mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-500" />
            Origem dos Leads
          </h3>
          {sources.length > 0 ? (
            <div className="space-y-1">
              {sources.slice(0, 6).map((item, i) => (
                <OriginBar
                  key={i}
                  canal={item.canal}
                  valor={item.valor}
                  max={sources[0]?.valor || 1}
                  cor={item.cor}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-8">Sem dados de origem</p>
          )}
          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total de canais</span>
              <span className="text-foreground font-semibold" style={{ fontFamily: "'DM Mono', monospace" }}>
                {sources.length} canais ativos
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
