import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationReady } from '@/hooks/useOrganizationReady';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { SalesOverview, type SalesOverviewData } from '@/components/dashboard/SalesOverview';
import { useOrganizationSegment } from '@/hooks/useOrganizationSegment';
import { fetchOrganizationMembersSafe } from '@/hooks/useOrganizationMembers';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  const { organizationId, isReady, isSuperAdmin } = useOrganizationReady();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isConsorcio, terms: segmentTerms } = useOrganizationSegment();

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
      case 'quarter': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), qMonth, 1);
        end = new Date(now.getFullYear(), qMonth + 3, 0, 23, 59, 59);
        break;
      }
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

  // Modo consórcio: produção e vendas vêm das cotas registradas, pela regra da organização.
  const { data: consortiumSummary } = useQuery({
    queryKey: ['consortium-summary', organizationId, format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd')],
    queryFn: async () => {
      if (!organizationId) return null;
      const [{ data, error }, members] = await Promise.all([
        supabase.rpc('consortium_sales_summary', {
          p_organization_id: organizationId,
          p_from: format(startDate, 'yyyy-MM-dd'),
          p_to: format(endDate, 'yyyy-MM-dd'),
        }),
        fetchOrganizationMembersSafe(),
      ]);
      if (error) throw error;
      const rows = data ?? [];
      return {
        revenue: rows.reduce((sum, row) => sum + Number(row.credit_total || 0), 0),
        sales: rows.reduce((sum, row) => sum + Number(row.sales_count || 0), 0),
        team: rows
          .filter((row) => row.seller_user_id)
          .map((row) => {
            const member = members.find((m) => m.user_id === row.seller_user_id);
            return {
              id: row.seller_user_id as string,
              name: member?.full_name || 'Colaborador',
              sales: Number(row.sales_count || 0),
              revenue: Number(row.credit_total || 0),
              avatarUrl: member?.avatar_url ?? null,
            };
          })
          .sort((a, b) => b.revenue - a.revenue),
      };
    },
    enabled: isConsorcio && !!organizationId,
    staleTime: 1000 * 60 * 2,
  });

  // Compartilhado por vendas, receita e ranking. Antes cada card repetia a
  // mesma consulta de estágios ganhos, multiplicando round-trips na abertura.
  const { data: wonStageIds = [], isFetched: wonStagesFetched } = useQuery({
    queryKey: ['dashboard-won-stage-ids', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');
      if (error) throw error;
      return (data || []).map((stage) => stage.id);
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 30,
  });
  const wonStageKey = wonStageIds.join(',');

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

  // 3b. Reuniões no-show
  const { data: noShowCount } = useQuery({
    queryKey: ['dashboard-no-show', organizationId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status_reuniao', 'no_show')
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
    queryKey: ['dashboard-sold-total', organizationId, startDate?.toISOString(), endDate?.toISOString(), wonStageKey],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
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
    enabled: !!organizationId && !!startDate && wonStagesFetched,
    staleTime: 1000 * 60 * 5,
  });

  // 6. Receita do período
  const { data: monthRevenue } = useQuery({
    queryKey: ['dashboard-month-revenue', organizationId, startDate?.toISOString(), endDate?.toISOString(), wonStageKey],
    queryFn: async () => {
      if (!organizationId || !startDate) return 0;
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
    enabled: !!organizationId && !!startDate && wonStagesFetched,
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
    queryKey: ['dashboard-top-sellers', organizationId, startDate?.toISOString(), endDate?.toISOString(), wonStageKey],
    queryFn: async () => {
      if (!organizationId || !startDate) return [];
      const membersResult = await supabase.rpc('get_organization_members_masked');
      const members = membersResult.data || [];
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
    enabled: !!organizationId && !!startDate && wonStagesFetched,
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
      return Promise.all(Array.from({ length: 7 }, async (_, index) => {
        const i = 6 - index;
        const d = new Date();
        const mStart = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const mEnd = new Date(d.getFullYear(), d.getMonth() - i + 1, 0, 23, 59, 59);

        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('created_at', mStart.toISOString())
          .lte('created_at', mEnd.toISOString());

        return count || 0;
      }));
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
  // DADOS DO DASHBOARD (só números reais; sem variações ou metas fixas)
  // ════════════════════════════════════════════════════════════════════════════
  const monthLabels = Array.from({ length: 7 }, (_, index) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() - (6 - index), 1)
      .toLocaleDateString('pt-BR', { month: 'short' })
      .replace('.', '');
  });

  const baseOverview: SalesOverviewData = {
    revenue: monthRevenue ?? 0,
    sales: soldTotal ?? 0,
    leads: totalLeads ?? 0,
    attended: attendedLeads ?? 0,
    meetingsRealized: realizedCount ?? 0,
    noShow: noShowCount ?? 0,
    proposals: proposalsCount ?? 0,
    today: {
      leads: todayLeads ?? 0,
      appointments: todayAppointments ?? 0,
      realized: todayRealized ?? 0,
    },
    monthlyLeads: (sparklineData ?? []).map((value, index) => ({ label: monthLabels[index], value })),
    sources: (leadsBySource ?? []).map((source) => ({ name: source.canal, value: source.valor })),
    team: (topSellersResult ?? []).map((seller) => ({
      id: seller.user_id,
      name: seller.full_name,
      sales: seller.won_leads,
      revenue: seller.total_revenue,
      avatarUrl: seller.avatar_url,
    })),
  };

  const overview: SalesOverviewData = isConsorcio && consortiumSummary
    ? { ...baseOverview, revenue: consortiumSummary.revenue, sales: consortiumSummary.sales, team: consortiumSummary.team }
    : baseOverview;

  const loading = totalLeads === undefined;

  // ════════════════════════════════════════════════════════════════════════════
  // GUARDS
  // ════════════════════════════════════════════════════════════════════════════
  if (!isReady || (!organizationId && !isSuperAdmin)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
        <LoadingAnimation text="Carregando o workspace..." />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoadingAnimation text="Carregando o dashboard..." />
      </div>
    );
  }

  return (
    <SalesOverview
      data={overview}
      period={period}
      onPeriodChange={setPeriod}
      onOpenRanking={() => navigate('/ranking')}
      terms={segmentTerms}
    />
  );
};

export default Dashboard;
