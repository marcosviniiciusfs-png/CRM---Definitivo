import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { isDemoRoute } from "@/lib/demoMode";
import type { AttendanceRow } from "@/lib/attendance";

// Dados fictícios para /demo-atendimento (só em DEV, sem login). Ids iguais aos de useRanking.
const DEMO_ROWS: AttendanceRow[] = [
  { user_id: "demo-carla", channels: 1, channels_connected: 1, conversations: 64, answered: 62, pending: 2, answered_5min: 51, avg_seconds: 210, median_seconds: 150, first_response_avg_seconds: 180, oldest_pending_at: new Date(Date.now() - 25 * 60_000).toISOString() },
  { user_id: "demo-bruno", channels: 2, channels_connected: 2, conversations: 70, answered: 58, pending: 12, answered_5min: 30, avg_seconds: 1260, median_seconds: 780, first_response_avg_seconds: 960, oldest_pending_at: new Date(Date.now() - 5 * 3_600_000).toISOString() },
  { user_id: "demo-julia", channels: 1, channels_connected: 1, conversations: 38, answered: 37, pending: 1, answered_5min: 33, avg_seconds: 120, median_seconds: 90, first_response_avg_seconds: 100, oldest_pending_at: new Date(Date.now() - 8 * 60_000).toISOString() },
  { user_id: "demo-user", channels: 1, channels_connected: 1, conversations: 41, answered: 33, pending: 8, answered_5min: 20, avg_seconds: 900, median_seconds: 420, first_response_avg_seconds: 540, oldest_pending_at: new Date(Date.now() - 2 * 3_600_000).toISOString() },
  { user_id: "demo-rafael", channels: 1, channels_connected: 0, conversations: 52, answered: 31, pending: 21, answered_5min: 9, avg_seconds: 5400, median_seconds: 3300, first_response_avg_seconds: 4200, oldest_pending_at: new Date(Date.now() - 31 * 3_600_000).toISOString() },
  { user_id: "demo-ana", channels: 1, channels_connected: 1, conversations: 0, answered: 0, pending: 0, answered_5min: 0, avg_seconds: null, median_seconds: null, first_response_avg_seconds: null, oldest_pending_at: null },
];

export function useAttendanceMetrics(range: { from: string; to: string }) {
  const { organizationId } = useOrganization();
  const demo = isDemoRoute();
  return useQuery({
    queryKey: ["attendance-metrics", organizationId, range.from, range.to, demo],
    queryFn: async (): Promise<AttendanceRow[]> => {
      if (demo) return DEMO_ROWS;
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc("attendance_metrics", {
        p_organization_id: organizationId,
        p_from: range.from,
        p_to: range.to,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: demo || !!organizationId,
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60 * 2,
  });
}
