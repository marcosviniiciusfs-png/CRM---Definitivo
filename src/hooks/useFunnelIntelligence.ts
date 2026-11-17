import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isDemoRoute } from "@/lib/demoMode";
import type { FunnelIntel, FunnelStageStat } from "@/lib/funnelIntel";

export interface FunnelOption {
  id: string;
  name: string;
  is_default: boolean;
}

const st = (name: string, position: number, o: Partial<FunnelStageStat> = {}): FunnelStageStat => ({
  id: name, name, position, stage_type: "custom", is_final: false, linked_event: null, color: null,
  reached: 0, avg_seconds_in_stage: null, current: 0, stalled: 0, lost_here: 0, ...o,
});

// Dados fictícios para /demo-inteligencia (só em DEV, sem login).
const DEMO: FunnelIntel = {
  totals: { leads: 312, won: 24, lost: 96, won_value: 5_120_000, avg_days_to_win: 21.4 },
  stages: [
    st("Novo lead", 0, { reached: 312, avg_seconds_in_stage: 5400, current: 18, stalled: 6, lost_here: 31 }),
    st("Qualificado", 1, { reached: 241, avg_seconds_in_stage: 172800, current: 52, stalled: 38, lost_here: 29 }),
    st("Simulação enviada", 2, { reached: 168, avg_seconds_in_stage: 259200, current: 33, stalled: 21, lost_here: 17 }),
    st("Reunião agendada", 3, { reached: 118, avg_seconds_in_stage: 129600, current: 14, stalled: 4, lost_here: 6 }),
    st("Reunião feita", 4, { reached: 71, avg_seconds_in_stage: 216000, current: 12, stalled: 5, lost_here: 8 }),
    st("Proposta enviada", 5, { reached: 52, avg_seconds_in_stage: 345600, current: 15, stalled: 9, lost_here: 5 }),
    st("Aguardando pagamento", 6, { reached: 31, avg_seconds_in_stage: 86400, current: 7, stalled: 1 }),
    st("Cota vendida", 7, { reached: 24, stage_type: "won", is_final: true, current: 24 }),
    st("Perdido", 99, { reached: 96, stage_type: "lost", is_final: true, current: 96 }),
  ],
};

export function useFunnels() {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["intel-funnels", organizationId, demo],
    queryFn: async (): Promise<FunnelOption[]> => {
      if (demo) return [{ id: "demo", name: "Funil comercial", is_default: true }];
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("sales_funnels")
        .select("id, name, is_default")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []).map((f) => ({ id: f.id, name: f.name, is_default: !!f.is_default }));
    },
    enabled: demo || !!organizationId,
    staleTime: 1000 * 60 * 10,
  });
}

export function useFunnelIntelligence(funnelId: string | null, range: { from: string; to: string }) {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["funnel-intelligence", organizationId, funnelId, range.from, range.to, demo],
    queryFn: async (): Promise<FunnelIntel> => {
      if (demo) return DEMO;
      const { data, error } = await supabase.rpc("funnel_intelligence", {
        p_organization_id: organizationId as string,
        p_funnel_id: funnelId as string,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return data as unknown as FunnelIntel;
    },
    enabled: demo || (!!organizationId && !!funnelId),
    staleTime: 1000 * 60 * 2,
  });
}
