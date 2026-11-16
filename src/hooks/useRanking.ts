import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import { fetchOrganizationMembersSafe } from "@/hooks/useOrganizationMembers";
import { isDemoRoute } from "@/lib/demoMode";
import type { RankingRow, ScoreKind } from "@/lib/scoring";

export interface MemberInfo {
  name: string;
  avatarUrl: string | null;
}

export interface ScoreEventItem {
  id: string;
  event_kind: string;
  points: number;
  amount: number | null;
  occurred_at: string;
  voided_at: string | null;
}

// Dados fictícios para /demo-ranking (só em DEV, sem login).
const DEMO_MEMBERS: Record<string, MemberInfo> = {
  "demo-carla": { name: "Carla Mendes", avatarUrl: null },
  "demo-bruno": { name: "Bruno Alves", avatarUrl: null },
  "demo-julia": { name: "Júlia Rocha", avatarUrl: null },
  "demo-rafael": { name: "Rafael Lima", avatarUrl: null },
  "demo-ana": { name: "Ana Souza", avatarUrl: null },
  "demo-user": { name: "Você (demonstração)", avatarUrl: null },
};

const demoRow = (user_id: string, production: number, sales: number, points: number, leads: number, meetings: number, replies: number): RankingRow => ({
  user_id,
  production,
  sales,
  points,
  leads_received: leads,
  meetings_scheduled: meetings,
  meetings_done: Math.round(meetings * 0.6),
  fast_replies: replies,
});

const DEMO_ROWS: RankingRow[] = [
  demoRow("demo-carla", 712000, 9, 1240, 64, 18, 52),
  demoRow("demo-bruno", 548000, 7, 1015, 70, 15, 41),
  demoRow("demo-julia", 369000, 5, 860, 38, 21, 60),
  demoRow("demo-user", 312000, 4, 790, 41, 12, 37),
  demoRow("demo-rafael", 235000, 3, 455, 52, 9, 18),
  demoRow("demo-ana", 0, 0, 120, 22, 4, 9),
];

const DEMO_TEAMS = {
  teams: [
    { id: "t-alfa", name: "Equipe Alfa", color: "#3B82F6" as string | null },
    { id: "t-beta", name: "Equipe Beta", color: "#14B8A6" as string | null },
  ],
  memberships: [
    { team_id: "t-alfa", user_id: "demo-carla" },
    { team_id: "t-alfa", user_id: "demo-julia" },
    { team_id: "t-alfa", user_id: "demo-ana" },
    { team_id: "t-beta", user_id: "demo-bruno" },
    { team_id: "t-beta", user_id: "demo-rafael" },
    { team_id: "t-beta", user_id: "demo-user" },
  ],
};

export function useCurrentUserId() {
  const { user } = useAuth();
  return isDemoRoute() ? "demo-user" : user?.id ?? null;
}

export function useRankingBoard(range: { from: string; to: string } | null) {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["ranking-board", organizationId, range?.from, range?.to, demo],
    queryFn: async (): Promise<RankingRow[]> => {
      if (demo) return DEMO_ROWS;
      if (!organizationId || !range) return [];
      const { data, error } = await supabase.rpc("ranking_board", {
        p_organization_id: organizationId,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        ...row,
        production: row.production === null ? null : Number(row.production),
      }));
    },
    enabled: !!range && (demo || !!organizationId),
    staleTime: 1000 * 60,
  });
}

export function useMembersMap() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["ranking-members", organizationId, demo],
    queryFn: async (): Promise<Record<string, MemberInfo>> => {
      if (demo) return DEMO_MEMBERS;
      const members = await fetchOrganizationMembersSafe();
      const map: Record<string, MemberInfo> = {};
      for (const m of members) {
        if (m.user_id) map[m.user_id] = { name: m.full_name || "Colaborador", avatarUrl: m.avatar_url };
      }
      return map;
    },
    enabled: demo || !!organizationId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useTeamsWithMembers() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["ranking-teams", organizationId, demo],
    queryFn: async () => {
      if (demo) return DEMO_TEAMS;
      if (!organizationId) return { teams: [], memberships: [] };
      const { data: teams, error } = await supabase
        .from("teams")
        .select("id, name, color")
        .eq("organization_id", organizationId)
        .order("name");
      if (error) throw error;
      const ids = (teams ?? []).map((t) => t.id);
      if (ids.length === 0) return { teams: [], memberships: [] };
      const { data: memberships, error: membersError } = await supabase
        .from("team_members")
        .select("team_id, user_id")
        .in("team_id", ids);
      if (membersError) throw membersError;
      return { teams: teams ?? [], memberships: memberships ?? [] };
    },
    enabled: demo || !!organizationId,
    staleTime: 1000 * 60 * 5,
  });
}

export function useMyScoreEvents(range: { from: string; to: string } | null) {
  const { organizationId } = useOrganization();
  const userId = useCurrentUserId();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["my-score-events", organizationId, userId, range?.from, range?.to, demo],
    queryFn: async (): Promise<ScoreEventItem[]> => {
      if (demo) {
        const now = Date.now();
        return [
          { id: "e1", event_kind: "venda", points: 100, amount: 120000, occurred_at: new Date(now - 36e5).toISOString(), voided_at: null },
          { id: "e2", event_kind: "resposta_5min", points: 5, amount: null, occurred_at: new Date(now - 72e5).toISOString(), voided_at: null },
          { id: "e3", event_kind: "reuniao_feita", points: 25, amount: null, occurred_at: new Date(now - 864e5).toISOString(), voided_at: null },
          { id: "e4", event_kind: "reuniao_agendada", points: 10, amount: null, occurred_at: new Date(now - 1.2e8).toISOString(), voided_at: null },
        ];
      }
      if (!organizationId || !userId || !range) return [];
      const { data, error } = await supabase
        .from("score_events")
        .select("id, event_kind, points, amount, occurred_at, voided_at")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .gte("occurred_on", range.from)
        .lte("occurred_on", range.to)
        .order("occurred_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!range && (demo || (!!organizationId && !!userId)),
  });
}

export function useScoreRules() {
  const { organizationId } = useOrganization();
  return useQuery({
    queryKey: ["score-rules", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.from("score_rules").select("*").eq("organization_id", organizationId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!organizationId,
  });
}

export function useSaveScoreRule() {
  const { organizationId } = useOrganization();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: { event_kind: ScoreKind; points: number; daily_cap: number | null; enabled: boolean }) => {
      if (!organizationId) throw new Error("Organização não encontrada.");
      const { error } = await supabase
        .from("score_rules")
        .upsert({ ...rule, organization_id: organizationId }, { onConflict: "organization_id,event_kind" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["score-rules", organizationId] }),
  });
}
