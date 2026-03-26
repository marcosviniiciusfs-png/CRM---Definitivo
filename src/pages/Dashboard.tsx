import { useState, useEffect } from "react";
import { Trophy, ArrowRight, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, Rectangle,
  XAxis, Tooltip as RechartsTooltip, AreaChart, Area, CartesianGrid, YAxis,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import topSellersEmptyState from "@/assets/top-sellers-empty.gif";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TopSeller {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
}
interface ConversionDataPoint { month: string; rate: number; }
interface StageData { id: string; name: string; count: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const fmtK = (n: number) => n >= 1000 ? `R$ ${(n / 1000).toFixed(1)}k` : `R$ ${fmt(n)}`;
const pct  = (n: number) => `${n.toFixed(1)}%`;

const getBarColor = (value: number, data: ConversionDataPoint[]) => {
  const rates = data.map(d => d.rate);
  const min = Math.min(...rates, 0), max = Math.max(...rates, 1);
  const t = Math.max(0, Math.min(1, (value - min) / (max - min || 1)));
  const r = Math.round(0   + (0   - 0)   * t);
  const g = Math.round(105 + (214 - 105) * t);
  const b = Math.round(40  + (143 - 40)  * t);
  return `rgb(${r},${g},${b})`;
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const G = '#00d68f';
const B = '#4d9eff';
const A = '#f59e0b';
const P = '#a78bfa';
const R = '#f87171';

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = () => {
  const { organizationId, isReady, isSuperAdmin } = useOrganizationReady();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter]       = useState('Este Mês');
  const [barsAnimated, setBarsAnimated]       = useState(false);
  const [hoveredBar, setHoveredBar]           = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => setBarsAnimated(true), 140);
    return () => clearTimeout(t);
  }, []);

  // ── Metrics (leads + revenue + won) ─────────────────────────────────────────
  const { data: metricsData } = useQuery({
    queryKey: ['dashboard-metrics', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [leadsResult, wonStagesResult] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gte('created_at', startOfMonth),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won'),
      ]);
      let newCustomersCount = 0, monthRevenue = 0, avgTicket = 0;
      if (wonStagesResult.data?.length) {
        const wonIds = wonStagesResult.data.map(s => s.id);
        const { data: wonLeads, count } = await supabase
          .from('leads').select('id, valor', { count: 'exact' })
          .eq('organization_id', organizationId)
          .in('funnel_stage_id', wonIds)
          .gte('data_conclusao', startOfMonth)
          .not('data_conclusao', 'is', null);
        newCustomersCount = count || 0;
        const rev = (wonLeads || []).reduce((s, l) => s + (l.valor || 0), 0);
        monthRevenue = rev;
        avgTicket    = wonLeads?.length ? rev / wonLeads.length : 0;
      }
      return { newLeadsCount: leadsResult.count || 0, newCustomersCount, monthRevenue, avgTicket };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── MQL + Today ──────────────────────────────────────────────────────────────
  const { data: captacaoData } = useQuery({
    queryKey: ['dashboard-captacao', organizationId],
    queryFn: async () => {
      if (!organizationId) return { mqlCount: 0, todayCount: 0 };
      const now  = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const { data: stages } = await supabase
        .from('funnel_stages').select('id, position')
        .eq('stage_type', 'custom').order('position');

      const sorted        = (stages || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const firstId       = sorted[0]?.id;
      const qualifiedIds  = sorted.filter(s => s.id !== firstId).map(s => s.id);

      const [mqlResult, todayResult] = await Promise.all([
        qualifiedIds.length
          ? supabase.from('leads').select('id', { count: 'exact', head: true })
              .eq('organization_id', organizationId)
              .in('funnel_stage_id', qualifiedIds)
              .gte('created_at', startOfMonth)
          : Promise.resolve({ count: 0 }),
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .gte('created_at', startOfToday),
      ]);
      return {
        mqlCount:   (mqlResult as any).count || 0,
        todayCount: todayResult.count || 0,
      };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Total won all time ────────────────────────────────────────────────────────
  const { data: totalWonData } = useQuery({
    queryKey: ['dashboard-total-won', organizationId],
    queryFn: async () => {
      if (!organizationId) return { totalWon: 0 };
      const { data: wonStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'won');
      const wonIds = wonStages?.map(s => s.id) || [];
      if (!wonIds.length) return { totalWon: 0 };
      const { count } = await supabase.from('leads').select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId).in('funnel_stage_id', wonIds);
      return { totalWon: count || 0 };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Conversion chart ─────────────────────────────────────────────────────────
  const { data: conversionResult } = useQuery({
    queryKey: ['dashboard-conversion', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now = new Date();
      const ranges = Array.from({ length: 6 }, (_, i) => {
        const d    = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const next = new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 1);
        const name = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        return { start: d.toISOString(), end: next.toISOString(), name: name[0].toUpperCase() + name.slice(1) };
      });
      const [wonStagesRes, allLeadsRes] = await Promise.all([
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won'),
        supabase.from('leads').select('id, created_at, updated_at, data_conclusao, funnel_stage_id')
          .eq('organization_id', organizationId).gte('created_at', ranges[0].start),
      ]);
      const wonSet  = new Set(wonStagesRes.data?.map(s => s.id) || []);
      const leads   = allLeadsRes.data || [];
      const months: ConversionDataPoint[] = ranges.map(r => {
        const inMonth  = leads.filter(l => l.created_at >= r.start && l.created_at < r.end);
        const conv     = leads.filter(l => wonSet.has(l.funnel_stage_id ?? '') && l.data_conclusao && l.data_conclusao >= r.start && l.data_conclusao < r.end);
        return { month: r.name, rate: inMonth.length ? parseFloat((conv.length / inMonth.length * 100).toFixed(1)) : 0 };
      });
      const cur   = months[months.length - 1]?.rate ?? 0;
      const trend = months.length > 1 ? parseFloat((cur - months[months.length - 2].rate).toFixed(1)) : 0;
      return { conversionData: months, currentConversionRate: cur, conversionTrend: trend };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Top sellers ───────────────────────────────────────────────────────────────
  const { data: topSellersResult } = useQuery({
    queryKey: ['dashboard-top-sellers', organizationId],
    queryFn: async () => {
      if (!organizationId) return { topSellers: [] };
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const [membersRes, wonStagesRes] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase.from('funnel_stages').select('id').eq('stage_type', 'won'),
      ]);
      const members    = membersRes.data || [];
      const wonIds     = wonStagesRes.data?.map(s => s.id) || [];
      if (!wonIds.length || !members.length) return { topSellers: [] };
      const uids = members.filter((m: any) => m.user_id).map((m: any) => m.user_id);
      const [profilesRes, wonLeadsRes] = await Promise.all([
        supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', uids),
        supabase.from('leads').select('responsavel_user_id, valor')
          .eq('organization_id', organizationId).in('funnel_stage_id', wonIds).gte('updated_at', startOfMonth),
      ]);
      const profiles = profilesRes.data || [];
      const wonLeads = wonLeadsRes.data || [];
      const byUser: Record<string, { won_leads: number; total_revenue: number }> = {};
      wonLeads.forEach(l => {
        if (l.responsavel_user_id) {
          if (!byUser[l.responsavel_user_id]) byUser[l.responsavel_user_id] = { won_leads: 0, total_revenue: 0 };
          byUser[l.responsavel_user_id].won_leads++;
          byUser[l.responsavel_user_id].total_revenue += l.valor || 0;
        }
      });
      const sellers: TopSeller[] = uids
        .filter((uid: string) => byUser[uid]?.won_leads > 0)
        .map((uid: string) => {
          const p = profiles.find(p => p.user_id === uid);
          return { user_id: uid, full_name: p?.full_name || members.find((m: any) => m.user_id === uid)?.full_name || 'Colaborador', avatar_url: p?.avatar_url || null, ...byUser[uid] };
        })
        .sort((a: TopSeller, b: TopSeller) => b.total_revenue - a.total_revenue)
        .slice(0, 5);
      return { topSellers: sellers };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 30000,
  });

  // ── Loss rate ─────────────────────────────────────────────────────────────────
  const { data: lossRateData } = useQuery({
    queryKey: ['dashboard-loss-rate', organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { data: lostStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'lost');
      const lostIds = lostStages?.map(s => s.id) || [];
      const [totalRes, lostRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        lostIds.length ? supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).in('funnel_stage_id', lostIds) : Promise.resolve({ count: 0 }),
      ]);
      const total = totalRes.count || 0;
      const lost  = (lostRes as any).count || 0;
      return total > 0 ? parseFloat((lost / total * 100).toFixed(1)) : 0;
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Forecast ──────────────────────────────────────────────────────────────────
  const { data: forecastData } = useQuery({
    queryKey: ['dashboard-forecast', organizationId],
    queryFn: async () => {
      if (!organizationId) return { forecast: 0 };
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
      const { data: stages } = await supabase.from('funnel_stages').select('id, name, stage_type, position');
      if (!stages) return { forecast: 0 };
      const wonSet    = new Set(stages.filter(s => s.stage_type === 'won').map(s => s.id));
      const lostSet   = new Set(stages.filter(s => s.stage_type === 'lost').map(s => s.id));
      const custom    = stages.filter(s => s.stage_type === 'custom');
      const { data: active } = await supabase.from('leads').select('id, valor, funnel_stage_id').eq('organization_id', organizationId).gt('valor', 0);
      if (!active) return { forecast: 0 };
      const pipeline = active.filter(l => l.funnel_stage_id && !wonSet.has(l.funnel_stage_id) && !lostSet.has(l.funnel_stage_id));
      const [toWon, allHist] = await Promise.all([
        supabase.from('funnel_stage_history').select('from_stage_id, to_stage_id').in('to_stage_id', Array.from(wonSet)).gte('moved_at', ninetyDaysAgo),
        supabase.from('funnel_stage_history').select('from_stage_id').gte('moved_at', ninetyDaysAgo),
      ]);
      const rates: Record<string, number> = {};
      custom.forEach(s => {
        const total = (allHist.data || []).filter(h => h.from_stage_id === s.id).length;
        const won   = (toWon.data   || []).filter(h => h.from_stage_id === s.id).length;
        rates[s.id] = total > 0 ? won / total : 0.1;
      });
      let forecast = 0;
      pipeline.forEach(l => { forecast += (l.valor || 0) * (rates[l.funnel_stage_id!] || 0.1); });
      return { forecast };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Advanced (cycle + revenue by day + funnel stages) ────────────────────────
  const { data: advancedData } = useQuery({
    queryKey: ['dashboard-advanced', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const now  = new Date();
      const som  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const sopm = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const eopm = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
      const { data: wonStages } = await supabase.from('funnel_stages').select('id').eq('stage_type', 'won');
      const wonIds = wonStages?.map(s => s.id) || [];
      const { data: allStages } = await supabase.from('funnel_stages').select('id, name, stage_type');
      const lostSet = new Set((allStages || []).filter(s => s.stage_type === 'lost').map(s => s.id));
      const [wonNow, wonPrev, activeLeads] = await Promise.all([
        wonIds.length ? supabase.from('leads').select('id, valor, created_at, updated_at').eq('organization_id', organizationId).in('funnel_stage_id', wonIds).gte('updated_at', som) : Promise.resolve({ data: [] }),
        wonIds.length ? supabase.from('leads').select('id, created_at, updated_at').eq('organization_id', organizationId).in('funnel_stage_id', wonIds).gte('updated_at', sopm).lte('updated_at', eopm) : Promise.resolve({ data: [] }),
        supabase.from('leads').select('id, funnel_stage_id').eq('organization_id', organizationId),
      ]);
      const thisMonth = (wonNow as any).data || [];
      const prevMonth = (wonPrev as any).data || [];
      const cycleFn  = (arr: any[]) => arr.map(l => Math.max(0, Math.floor((new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()) / 86400000)));
      const avgCycle = cycleFn(thisMonth).length ? Math.round(cycleFn(thisMonth).reduce((a: number, b: number) => a + b, 0) / cycleFn(thisMonth).length) : 0;
      const prevAvg  = cycleFn(prevMonth).length ? Math.round(cycleFn(prevMonth).reduce((a: number, b: number) => a + b, 0) / cycleFn(prevMonth).length) : 0;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      let cum = 0;
      const revenueByDay = Array.from({ length: daysInMonth }, (_, di) => {
        const dayRev = thisMonth.filter((l: any) => new Date(l.updated_at).getDate() === di + 1).reduce((s: number, l: any) => s + (l.valor || 0), 0);
        cum += dayRev;
        return { day: String(di + 1), receita: cum };
      });
      const stageCount: Record<string, number> = {};
      (activeLeads.data || []).forEach(l => {
        if (l.funnel_stage_id && !wonIds.includes(l.funnel_stage_id) && !lostSet.has(l.funnel_stage_id))
          stageCount[l.funnel_stage_id] = (stageCount[l.funnel_stage_id] || 0) + 1;
      });
      const stagesData: StageData[] = Object.entries(stageCount)
        .map(([id, count]) => ({ id, name: (allStages || []).find(s => s.id === id)?.name || 'Etapa', count }))
        .sort((a, b) => b.count - a.count).slice(0, 8);
      const bottleneck = stagesData.length ? { name: stagesData[0].name, count: stagesData[0].count } : null;
      return { avgCycle, cycleTrend: prevAvg > 0 ? avgCycle - prevAvg : 0, revenueByDay, bottleneck, stagesData };
    },
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Real-time subscription ────────────────────────────────────────────────────
  useEffect(() => {
    if (!organizationId) return;
    const keys = [
      'dashboard-metrics', 'dashboard-captacao', 'dashboard-total-won',
      'dashboard-conversion', 'dashboard-top-sellers', 'dashboard-loss-rate',
      'dashboard-forecast', 'dashboard-advanced',
    ];
    const invalidateAll = () => keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    const ch = supabase.channel('dashboard-rt-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' },              invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'funnel_stage_history' }, invalidateAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_members' }, () => {
        queryClient.invalidateQueries({ queryKey: ['dashboard-top-sellers'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [organizationId, queryClient]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const newLeadsCount         = metricsData?.newLeadsCount         ?? 0;
  const newCustomersCount     = metricsData?.newCustomersCount     ?? 0;
  const monthRevenue          = metricsData?.monthRevenue          ?? 0;
  const avgTicket             = metricsData?.avgTicket             ?? 0;
  const mqlCount              = captacaoData?.mqlCount             ?? 0;
  const todayCount            = captacaoData?.todayCount           ?? 0;
  const totalWon              = totalWonData?.totalWon             ?? 0;
  const taxaQualif            = newLeadsCount > 0 ? (mqlCount / newLeadsCount) * 100 : 0;
  const lossRate              = lossRateData                       ?? 0;
  const conversionData        = conversionResult?.conversionData   ?? [];
  const currentConversionRate = conversionResult?.currentConversionRate ?? 0;
  const conversionTrend       = conversionResult?.conversionTrend  ?? 0;
  const topSellers            = topSellersResult?.topSellers       ?? [];
  const topSellersLoading     = !topSellersResult;
  const forecast              = forecastData?.forecast             ?? 0;
  const avgCycle              = advancedData?.avgCycle             ?? 0;
  const cycleTrend            = advancedData?.cycleTrend           ?? 0;
  const revenueByDay          = advancedData?.revenueByDay         ?? [];
  const bottleneck            = advancedData?.bottleneck           ?? null;
  const stagesData            = advancedData?.stagesData           ?? [];
  const loading               = !metricsData && !conversionResult;

  const rankColors = [A, '#b0b0b8', '#c17f3a', 'rgba(255,255,255,.35)', 'rgba(255,255,255,.2)'];
  const filters    = ['Hoje', 'Este Mês', 'Trimestre', 'Ano'];

  const taxasChave = [
    { label: '% Conversão Lead → Venda', value: pct(currentConversionRate), ok: currentConversionRate >= 5,  meta: '5% mín.' },
    { label: '% Qualificação MQL',       value: pct(taxaQualif),            ok: taxaQualif >= 40,             meta: '40% ideal' },
    { label: '% Taxa de Perda',          value: pct(lossRate),              ok: lossRate  <= 30,             meta: '< 30%' },
    { label: 'Ticket Médio',             value: fmtK(avgTicket),            ok: avgTicket  > 0,              meta: 'por contrato' },
  ];

  // ── Guards ────────────────────────────────────────────────────────────────────
  if (!isReady || (!organizationId && !isSuperAdmin)) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-6">
      <LoadingAnimation text="Carregando workspace..." />
    </div>
  );
  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <LoadingAnimation text="Carregando dashboard..." />
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="dash-root">

      {/* ══ Injected CSS ══════════════════════════════════════════════════════ */}
      <style>{`
        .dash-root {
          font-family: 'Outfit', sans-serif;
          --g: ${G}; --b: ${B}; --a: ${A}; --p: ${P}; --r: ${R};
          --card-bg:     rgba(255,255,255,.028);
          --card-border: rgba(255,255,255,.07);
          --text-1: rgba(255,255,255,.88);
          --text-2: rgba(255,255,255,.44);
          --text-3: rgba(255,255,255,.2);
        }

        /* Cards */
        .dc {
          background: var(--card-bg);
          border: 0.5px solid var(--card-border);
          border-radius: 14px;
          padding: 16px;
          position: relative;
          overflow: hidden;
          transition: border-color .25s, background .25s;
          animation: dc-in .45s cubic-bezier(.25,.46,.45,.94) both;
        }
        .dc::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.09), transparent);
        }
        .dc:hover { border-color: rgba(255,255,255,.13); background: rgba(255,255,255,.04); }

        /* Section labels */
        .ds {
          display: flex; align-items: center; gap: 10px;
          font-size: 9.5px; font-weight: 600;
          color: rgba(255,255,255,.2);
          text-transform: uppercase; letter-spacing: 1.2px;
          margin: 20px 0 10px;
        }
        .ds::after { content: ''; flex: 1; height: .5px; background: rgba(255,255,255,.06); }

        /* Filter buttons */
        .df {
          padding: 5px 13px; border-radius: 8px;
          font-size: 11px; font-weight: 500;
          border: 0.5px solid rgba(255,255,255,.09);
          background: transparent; color: var(--text-3);
          cursor: pointer; font-family: 'Outfit', sans-serif;
          transition: all .2s;
        }
        .df:hover { color: rgba(255,255,255,.65); border-color: rgba(255,255,255,.18); }
        .df.active {
          background: rgba(0,214,143,.09);
          color: var(--g); border-color: rgba(0,214,143,.3);
        }

        /* Metric value */
        .dv { font-family: 'DM Mono', 'JetBrains Mono', monospace; }

        /* Progress bars */
        .dp-track { height: 5px; background: rgba(255,255,255,.05); border-radius: 3px; overflow: hidden; }
        .dp-fill   { height: 100%; border-radius: 3px; transition: width .9s cubic-bezier(.4,0,.2,1); }

        /* Funnel bars */
        .df-track { flex: 1; height: 18px; background: rgba(255,255,255,.04); border-radius: 5px; overflow: hidden; }
        .df-fill  { height: 100%; border-radius: 5px; transition: width .75s cubic-bezier(.4,0,.2,1); display: flex; align-items: center; position: relative; }

        /* Hot animation */
        @keyframes hot-pulse   { 0%,100%{box-shadow:0 0 0 0 rgba(255,60,60,.45)} 50%{box-shadow:0 0 0 5px rgba(255,60,60,.08)} }
        @keyframes hot-shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        .df-hot {
          background: linear-gradient(90deg,#b91c1c,#f87171,#fca5a5,#f87171,#b91c1c) !important;
          background-size: 200% 100% !important;
          animation: hot-pulse 1.8s ease-in-out infinite, hot-shimmer 2.4s linear infinite;
        }

        /* Badge */
        .dbadge {
          font-size: 10px; font-weight: 600;
          padding: 3px 9px; border-radius: 6px;
          white-space: nowrap;
        }

        /* Card entrance */
        @keyframes dc-in { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }

        /* Responsive grids */
        .dg4 { display: grid; gap: 10px; grid-template-columns: repeat(4,1fr); }
        .dg5 { display: grid; gap: 10px; grid-template-columns: repeat(5,1fr); }
        .dg2 { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; }

        @media (max-width: 1100px) {
          .dg5 { grid-template-columns: repeat(3,1fr); }
        }
        @media (max-width: 860px) {
          .dg4, .dg5 { grid-template-columns: repeat(2,1fr); }
          .dg2        { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .dg4, .dg5 { grid-template-columns: 1fr; }
        }

        .recharts-tooltip-wrapper { z-index: 50; }
        .recharts-wrapper { overflow: visible !important; }
      `}</style>

      {/* ══ Period Filter ═════════════════════════════════════════════════════ */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 16 }}>
        {filters.map(f => (
          <button key={f} className={`df${activeFilter === f ? ' active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
        ))}
      </div>

      {/* ══ CAPTAÇÃO DE LEADS ════════════════════════════════════════════════ */}
      <div className="ds">Captação de Leads</div>
      <div className="dg4" style={{ marginBottom: 4 }}>

        {/* Leads Totais */}
        <div className="dc" style={{ animationDelay: '.05s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: B, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Leads Totais</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${B}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 7a5 5 0 0 1 10 0" stroke={B} strokeWidth="1.4" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: B, marginBottom: 5 }}>{fmt(newLeadsCount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>captados este mês</div>
        </div>

        {/* MQL */}
        <div className="dc" style={{ animationDelay: '.1s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: P, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>MQL</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${P}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={P} strokeWidth="1.3"/><path d="M5 8l2 2 4-4" stroke={P} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: P, marginBottom: 5 }}>{fmt(mqlCount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>leads qualificados</div>
        </div>

        {/* Taxa Qualificação */}
        <div className="dc" style={{ animationDelay: '.15s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: G, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Taxa Qualif.</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${G}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 12L6 7L9 10L13 4" stroke={G} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: taxaQualif >= 40 ? G : R, marginBottom: 5 }}>{pct(taxaQualif)}</div>
          <div style={{ fontSize: 10, color: taxaQualif >= 40 ? G : R }}>{taxaQualif >= 40 ? '▲ acima do ideal 40%' : '▼ abaixo do ideal 40%'}</div>
        </div>

        {/* Leads Hoje */}
        <div className="dc" style={{ animationDelay: '.2s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: A, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Leads Hoje</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${A}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1L10 6H15L11 9.5L12.5 15L8 11.5L3.5 15L5 9.5L1 6H6L8 1Z" fill={A}/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: A, marginBottom: 5 }}>{fmt(todayCount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>captados hoje</div>
        </div>
      </div>

      {/* ══ VENDAS & CONVERSÃO ══════════════════════════════════════════════ */}
      <div className="ds">Vendas & Conversão</div>
      <div className="dg5" style={{ marginBottom: 4 }}>

        {/* Receita do Mês */}
        <div className="dc" style={{ animationDelay: '.1s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: G, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Receita do Mês</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${G}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><rect x="1" y="4" width="14" height="10" rx="2" stroke={G} strokeWidth="1.3"/><path d="M5 4V3a3 3 0 0 1 6 0v1" stroke={G} strokeWidth="1.3" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.8px', lineHeight: 1, color: G, marginBottom: 5 }}>{fmtK(monthRevenue)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>contratos fechados</div>
        </div>

        {/* Previsão de Faturamento */}
        <div className="dc" style={{ animationDelay: '.15s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: A, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Previsão</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${A}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={A} strokeWidth="1.3"/><path d="M8 5.5v5M5.5 8h5" stroke={A} strokeWidth="1.3" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.8px', lineHeight: 1, color: A, marginBottom: 5 }}>{fmtK(forecast)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>pipeline ponderado</div>
        </div>

        {/* Contratos */}
        <div className="dc" style={{ animationDelay: '.2s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: B, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Contratos</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${B}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-5" stroke={B} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: B, marginBottom: 5 }}>{fmt(newCustomersCount)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>fechados este mês</div>
        </div>

        {/* Vendas no Total */}
        <div className="dc" style={{ animationDelay: '.25s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: G, filter: 'blur(22px)', opacity: .1 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Vendas Total</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${G}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 14h12M4 10l4-6 4 6" stroke={G} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: G, marginBottom: 5 }}>{fmt(totalWon)}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>contratos acumulados</div>
        </div>

        {/* Ciclo Médio */}
        <div className="dc" style={{ animationDelay: '.3s' }}>
          <div style={{ position: 'absolute', top: -18, right: -18, width: 60, height: 60, borderRadius: '50%', background: R, filter: 'blur(22px)', opacity: .13 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.8px' }}>Ciclo Médio</span>
            <div style={{ width: 26, height: 26, borderRadius: 7, background: `${R}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={R} strokeWidth="1.3"/><path d="M8 5v3l2 2" stroke={R} strokeWidth="1.3" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div className="dv" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-1px', lineHeight: 1, color: R, marginBottom: 5 }}>
            {avgCycle}<span style={{ fontSize: 13, letterSpacing: 0 }}> d</span>
          </div>
          <div style={{ fontSize: 10, color: cycleTrend < 0 ? G : cycleTrend > 0 ? R : 'var(--text-3)' }}>
            {cycleTrend !== 0 ? `${cycleTrend > 0 ? '▲' : '▼'} ${Math.abs(cycleTrend)}d vs mês ant.` : 'mesmo ciclo anterior'}
          </div>
        </div>
      </div>

      {/* ══ TAXAS CHAVE + TOP VENDEDORES ════════════════════════════════════ */}
      <div className="ds">Performance & Ranking</div>
      <div className="dg2" style={{ marginBottom: 4 }}>

        {/* Taxas Chave */}
        <div className="dc" style={{ animationDelay: '.1s' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 4h12M2 8h9M2 12h6" stroke="rgba(255,255,255,.45)" strokeWidth="1.5" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Taxas Chave</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {taxasChave.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 11px', background: 'rgba(255,255,255,.025)', border: '0.5px solid rgba(255,255,255,.05)', borderRadius: 9 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.38)', marginBottom: 1 }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)' }}>Meta: {t.meta}</div>
                </div>
                <div className="dv" style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.5px', color: t.ok ? G : R, flexShrink: 0 }}>{t.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Vendedores */}
        <div className="dc" style={{ animationDelay: '.15s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trophy size={12} color={A} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Top Representantes</span>
            </div>
            <span className="dbadge" style={{ background: `${A}18`, color: A }}>Este mês</span>
          </div>

          {topSellersLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[0,1,2].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Skeleton className="h-7 w-7 rounded-lg" />
                  <div style={{ flex: 1 }}><Skeleton className="h-3 w-24 mb-1.5"/><Skeleton className="h-2.5 w-16"/></div>
                </div>
              ))}
            </div>
          ) : topSellers.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: 8 }}>
              <img src={topSellersEmptyState} alt="" style={{ width: 52, height: 52, opacity: .65 }} />
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Nenhuma venda este mês</span>
            </div>
          ) : (
            <div>
              {topSellers.map((s, i) => (
                <div key={s.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '0.5px solid rgba(255,255,255,.04)' }}>
                  <span className="dv" style={{ fontSize: 10, color: rankColors[i] || 'var(--text-3)', minWidth: 14 }}>{i + 1}</span>
                  <Avatar style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0 }}>
                    <AvatarImage src={s.avatar_url || undefined} />
                    <AvatarFallback style={{ fontSize: 10, background: 'rgba(255,255,255,.05)', borderRadius: 7 }}>{s.full_name?.charAt(0)?.toUpperCase() || '?'}</AvatarFallback>
                  </Avatar>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{s.won_leads} {s.won_leads === 1 ? 'venda' : 'vendas'}</div>
                  </div>
                  <div className="dv" style={{ fontSize: 11, color: G, flexShrink: 0 }}>{fmtK(s.total_revenue)}</div>
                </div>
              ))}
              <button
                onClick={() => navigate('/ranking')}
                style={{ marginTop: 10, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 10, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', borderTop: '0.5px solid rgba(255,255,255,.05)', cursor: 'pointer', fontFamily: "'Outfit', sans-serif" }}
              >
                Ver ranking completo <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══ TAXA DE CONVERSÃO ═══════════════════════════════════════════════ */}
      <div className="ds">Conversão</div>
      <div className="dc" style={{ animationDelay: '.1s', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Taxa de Conversão — Últimos 6 Meses</span>
          <span className="dbadge" style={{ background: conversionTrend >= 0 ? `${G}18` : `${R}18`, color: conversionTrend >= 0 ? G : R }}>
            {conversionTrend >= 0 ? <TrendingUp size={10} style={{ display: 'inline', marginRight: 4 }} /> : <TrendingDown size={10} style={{ display: 'inline', marginRight: 4 }} />}
            {conversionTrend >= 0 ? '+' : ''}{conversionTrend}%
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
          <div className="dv" style={{ fontSize: 40, fontWeight: 700, color: G, letterSpacing: '-2px', lineHeight: 1 }}>{currentConversionRate}%</div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-2)' }}>Leads → Clientes</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>baseado nos últimos 6 meses</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={conversionData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Bar dataKey="rate" radius={[4,4,0,0]}
              shape={(props: any) => {
                const { x, y, width, height, payload, index } = props;
                return <Rectangle x={x} y={y} width={width} height={height} fill={getBarColor(payload.rate, conversionData)} radius={[4,4,0,0]} opacity={hoveredBar !== null && hoveredBar !== index ? .25 : 1} style={{ transition: 'opacity .2s' }} />;
              }}
              onMouseEnter={(_: any, i: number) => setHoveredBar(i)}
              onMouseLeave={() => setHoveredBar(null)}
            />
            <XAxis dataKey="month" tick={{ fill: 'rgba(255,255,255,.2)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <RechartsTooltip cursor={{ fill: 'transparent' }} content={({ active, payload: pl }) =>
              active && pl?.length ? (
                <div style={{ background: '#0d0f18', border: '0.5px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '8px 12px' }}>
                  <div className="dv" style={{ fontSize: 18, fontWeight: 600, color: G }}>{pl[0].value}%</div>
                </div>
              ) : null
            } />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ══ FUNIL & GARGALO ══════════════════════════════════════════════════ */}
      <div className="ds">Funil & Gargalos</div>
      <div className="dc" style={{
        animationDelay: '.1s',
        border: '0.5px solid rgba(255,80,80,.18)',
        marginBottom: 4,
      }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(ellipse 80% 45% at 50% 0%, rgba(255,50,50,.04) 0%, transparent 70%)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={13} color={R} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,130,130,.8)' }}>Funil Completo — Gargalo</span>
          </div>
          {bottleneck && (
            <span className="dbadge" style={{ background: `${R}18`, color: R }}>{bottleneck.count} parados em {bottleneck.name}</span>
          )}
        </div>

        {stagesData.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 24px', position: 'relative' }}>
            {stagesData.map((stage, i) => {
              const maxCount = stagesData[0]?.count || 1;
              const pctW     = Math.round(stage.count / maxCount * 100);
              const isHot    = bottleneck?.name === stage.name;
              return (
                <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ fontSize: 10, color: isHot ? 'rgba(255,130,130,.85)' : 'rgba(255,255,255,.28)', minWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
                    {stage.name}
                    {isHot && <span style={{ display: 'inline-flex', fontSize: 9, fontWeight: 700, color: R, background: 'rgba(255,60,60,.12)', border: '0.5px solid rgba(255,60,60,.3)', borderRadius: 4, padding: '1px 5px', marginLeft: 5, letterSpacing: '.4px', textTransform: 'uppercase' }}>HOT</span>}
                  </div>
                  <div className="df-track">
                    <div
                      className={isHot ? 'df-fill df-hot' : 'df-fill'}
                      style={{
                        width: barsAnimated ? `${pctW}%` : '0%',
                        ...(isHot ? {} : { background: `${B}8a`, transition: `width .75s cubic-bezier(.4,0,.2,1) ${i * 70}ms` }),
                      }}
                    >
                      <span className="dv" style={{ position: 'absolute', right: 6, fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>{stage.count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : bottleneck ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0', gap: 6, textAlign: 'center' }}>
            <div className="dv" style={{ fontSize: 38, color: R, fontWeight: 700, letterSpacing: '-2px' }}>{bottleneck.count}</div>
            <div style={{ fontSize: 14, color: 'rgba(255,130,130,.75)', fontWeight: 600 }}>{bottleneck.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>leads parados nesta etapa</div>
          </div>
        ) : (
          <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
            Nenhum gargalo identificado · Leads fluindo normalmente
          </div>
        )}

        {bottleneck && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(255,60,60,.05)', border: '0.5px solid rgba(255,60,60,.16)', borderRadius: 9, display: 'flex', alignItems: 'flex-start', gap: 8, position: 'relative' }}>
            <AlertTriangle size={12} color={R} style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 10, color: 'rgba(200,75,75,.9)', lineHeight: 1.55 }}>
              Gargalo em <strong style={{ color: R }}>{bottleneck.name}</strong>: {bottleneck.count} leads acumulados. Revise o critério de conversão desta etapa.
            </span>
          </div>
        )}
      </div>

      {/* ══ RECEITA ACUMULADA ════════════════════════════════════════════════ */}
      <div className="ds">Receita Acumulada</div>
      <div className="dc" style={{ animationDelay: '.05s', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>Acumulado do Mês</span>
          <span className="dv" style={{ fontSize: 14, fontWeight: 600, color: G }}>R$ {fmt(monthRevenue)}</span>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={revenueByDay} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={G} stopOpacity={0.2} />
                <stop offset="95%" stopColor={G} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.04)" />
            <XAxis dataKey="day" tick={{ fill: 'rgba(255,255,255,.18)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'rgba(255,255,255,.18)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
            <RechartsTooltip content={({ active, payload }) =>
              active && payload?.length ? (
                <div style={{ background: '#0d0f18', border: '0.5px solid rgba(255,255,255,.12)', borderRadius: 9, padding: '8px 12px' }}>
                  <div style={{ color: 'var(--text-3)', fontSize: 10, marginBottom: 2 }}>Dia {payload[0].payload.day}</div>
                  <div className="dv" style={{ fontSize: 16, fontWeight: 600, color: G }}>R$ {fmt(payload[0].value as number)}</div>
                </div>
              ) : null
            } />
            <Area type="monotone" dataKey="receita" stroke={G} strokeWidth={1.5} fill="url(#revGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
};

export default Dashboard;
