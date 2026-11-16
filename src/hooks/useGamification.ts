import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isDemoRoute } from "@/lib/demoMode";
import { brtDate } from "@/lib/scoring";

export interface GoalProgress {
  goal_id: string;
  scope: string;
  scope_id: string | null;
  metric: string;
  target: number | null;
  achieved: number | null;
}

export interface SellerProfile {
  lifetime_points: number;
  streak_days: number;
  daily_points_target: number;
  achievements: Array<{ code: string; period: string; earned_at: string }>;
}

export interface FeedItem {
  id: string;
  user_id: string;
  kind: string;
  amount: number | null;
  occurred_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  metric: string;
  format: string;
  target: number | null;
  starts_on: string;
  ends_on: string;
  prize: string | null;
  reveal_on: string | null;
  closed_at: string | null;
  winners: unknown;
  participant_user_ids: string[] | null;
  team_ids: string[] | null;
}

const monthStart = () => `${brtDate().slice(0, 8)}01`;
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString();

// ---------- dados de exemplo (/demo-ranking) ----------
const DEMO_GOALS: GoalProgress[] = [
  { goal_id: "g-org", scope: "org", scope_id: null, metric: "producao", target: 3_000_000, achieved: 2_176_000 },
  { goal_id: "g-user", scope: "user", scope_id: "demo-user", metric: "producao", target: 500_000, achieved: 312_000 },
  { goal_id: "g-carla", scope: "user", scope_id: "demo-carla", metric: "producao", target: 600_000, achieved: 712_000 },
  { goal_id: "g-team", scope: "team", scope_id: "t-alfa", metric: "vendas", target: 20, achieved: 14 },
];
const DEMO_PROFILE: SellerProfile = {
  lifetime_points: 2_380,
  streak_days: 6,
  daily_points_target: 20,
  achievements: [
    { code: "primeira_venda", period: "sempre", earned_at: daysAgo(120) },
    { code: "resposta_relampago", period: "2026-S46", earned_at: daysAgo(2) },
    { code: "dez_reunioes_mes", period: "2026-11", earned_at: daysAgo(1) },
  ],
};
const DEMO_FEED: FeedItem[] = [
  { id: "f1", user_id: "demo-carla", kind: "venda", amount: 180_000, occurred_at: daysAgo(0.02) },
  { id: "f2", user_id: "demo-carla", kind: "meta_batida", amount: null, occurred_at: daysAgo(0.1) },
  { id: "f3", user_id: "demo-julia", kind: "medalha:resposta_relampago", amount: null, occurred_at: daysAgo(0.4) },
  { id: "f4", user_id: "demo-bruno", kind: "venda", amount: 95_000, occurred_at: daysAgo(0.8) },
  { id: "f5", user_id: "demo-user", kind: "venda", amount: 120_000, occurred_at: daysAgo(1.2) },
];
const DEMO_CAMPAIGNS: CampaignRow[] = [
  {
    id: "c1", name: "Corrida de novembro", metric: "producao", format: "corrida", target: null,
    starts_on: monthStart(), ends_on: `${brtDate().slice(0, 8)}30`, prize: "Jantar para dois", reveal_on: null,
    closed_at: null, winners: null, participant_user_ids: null, team_ids: null,
  },
];

export function useGamificationRefresh() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (isDemoRoute() || !organizationId) return;
    supabase
      .rpc("gamification_refresh", { p_organization_id: organizationId })
      .then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ["gamification"] });
      });
  }, [organizationId, queryClient]);
}

export function useGoalsProgress() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["gamification", "goals", organizationId, demo],
    queryFn: async (): Promise<GoalProgress[]> => {
      if (demo) return DEMO_GOALS;
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("goals_progress", { p_organization_id: organizationId, p_month: monthStart() });
      if (error) throw error;
      return (data ?? []).map((g) => ({
        ...g,
        target: g.target === null ? null : Number(g.target),
        achieved: g.achieved === null ? null : Number(g.achieved),
      }));
    },
    enabled: demo || !!organizationId,
  });
}

export function useSaveGoal() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (goal: { id?: string; scope: string; scope_id: string | null; metric: string; target: number }) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const row: TablesInsert<"seller_goals"> = {
        organization_id: organizationId,
        scope: goal.scope,
        scope_id: goal.scope_id,
        metric: goal.metric,
        month: monthStart(),
        target: goal.target,
      };
      const { error } = goal.id
        ? await supabase.from("seller_goals").update({ target: goal.target }).eq("id", goal.id)
        : await supabase.from("seller_goals").insert(row);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gamification", "goals"] }),
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("seller_goals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gamification", "goals"] }),
  });
}

export function useSellerProfile(userId: string | null) {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["gamification", "profile", organizationId, userId, demo],
    queryFn: async (): Promise<SellerProfile | null> => {
      if (demo) return DEMO_PROFILE;
      if (!organizationId || !userId) return null;
      const { data, error } = await supabase.rpc("seller_profile", { p_organization_id: organizationId, p_user_id: userId });
      if (error) throw error;
      return data as unknown as SellerProfile;
    },
    enabled: demo || (!!organizationId && !!userId),
  });
}

export function useRankingFeed(limit = 12) {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["gamification", "feed", organizationId, limit, demo],
    queryFn: async (): Promise<FeedItem[]> => {
      if (demo) return DEMO_FEED;
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("ranking_feed", { p_organization_id: organizationId, p_limit: limit });
      if (error) throw error;
      return (data ?? []).map((f) => ({ ...f, amount: f.amount === null ? null : Number(f.amount) }));
    },
    enabled: demo || !!organizationId,
    refetchInterval: 1000 * 60 * 2,
  });
}

export function useCampaigns() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["gamification", "campaigns", organizationId, demo],
    queryFn: async (): Promise<CampaignRow[]> => {
      if (demo) return DEMO_CAMPAIGNS;
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("campaigns")
        .select("*")
        .eq("organization_id", organizationId)
        .order("ends_on", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []).map((c) => ({ ...c, target: c.target === null ? null : Number(c.target) }));
    },
    enabled: demo || !!organizationId,
  });
}

export function useCampaignStandings(campaignId: string | null) {
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["gamification", "standings", campaignId, demo],
    queryFn: async () => {
      if (demo) {
        return [
          { entity_type: "user", entity_id: "demo-carla", value: 712_000, hidden: false },
          { entity_type: "user", entity_id: "demo-bruno", value: 548_000, hidden: false },
          { entity_type: "user", entity_id: "demo-julia", value: 369_000, hidden: false },
          { entity_type: "user", entity_id: "demo-user", value: 312_000, hidden: false },
        ];
      }
      if (!campaignId) return [];
      const { data, error } = await supabase.rpc("campaign_standings", { p_campaign_id: campaignId });
      if (error) throw error;
      return (data ?? [])
        .map((r) => ({ ...r, value: r.value === null ? null : Number(r.value) }))
        .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
    },
    enabled: demo || !!campaignId,
  });
}

export function useSaveCampaign() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (campaign: Omit<TablesInsert<"campaigns">, "organization_id">) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { error } = await supabase.from("campaigns").insert({ ...campaign, organization_id: organizationId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gamification", "campaigns"] }),
  });
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["gamification", "campaigns"] }),
  });
}

export function useTvToken(enabled: boolean) {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["tv-token", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      const { data, error } = await supabase.rpc("get_tv_token", { p_organization_id: organizationId });
      if (error) throw error;
      return data ?? null;
    },
    enabled: enabled && !!organizationId,
  });
}

export function useSetTvToken() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enable: boolean) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { data, error } = await supabase.rpc("set_tv_token", { p_organization_id: organizationId, p_enable: enable });
      if (error) throw error;
      return data ?? null;
    },
    onSuccess: (token) => queryClient.setQueryData(["tv-token", organizationId], token),
  });
}
