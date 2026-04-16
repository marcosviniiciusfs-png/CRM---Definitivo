import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export function RouletteAnalyticsBar() {
  const { organizationId } = useOrganization();

  const { data: stats } = useQuery({
    queryKey: ["roulette-analytics", organizationId],
    queryFn: async () => {
      if (!organizationId) return null;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [todayRes, yesterdayRes, weekRes] = await Promise.all([
        supabase
          .from("lead_distribution_history")
          .select("id, created_at", { count: "exact" })
          .eq("organization_id", organizationId)
          .gte("created_at", todayStart),
        supabase
          .from("lead_distribution_history")
          .select("id", { count: "exact" })
          .eq("organization_id", organizationId)
          .gte("created_at", yesterdayStart)
          .lt("created_at", todayStart),
        supabase
          .from("lead_distribution_history")
          .select("created_at")
          .eq("organization_id", organizationId)
          .gte("created_at", sevenDaysAgo),
      ]);

      const todayCount = todayRes.count || 0;
      const yesterdayCount = yesterdayRes.count || 0;
      const delta = yesterdayCount > 0
        ? Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100)
        : todayCount > 0 ? 100 : 0;

      // Build daily counts for last 7 days
      const dailyCounts: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const count = (weekRes.data || []).filter(
          (r) => r.created_at >= dayStart.toISOString() && r.created_at < dayEnd.toISOString()
        ).length;
        dailyCounts.push(count);
      }

      // Placeholder response rate (78% with mock delta)
      const responseRate = 78;
      const responseDelta = -3;

      return { todayCount, delta, dailyCounts, responseRate, responseDelta };
    },
    staleTime: 60_000,
    enabled: !!organizationId,
  });

  const maxCount = Math.max(...(stats?.dailyCounts || [1]), 1);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Card 1: Leads distribuidos hoje */}
      <div className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Leads distribuidos hoje
          </span>
          {stats && stats.delta !== 0 && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
              stats.delta >= 0
                ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
                : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
            }`}>
              {stats.delta >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
              {stats.delta >= 0 ? "+" : ""}{stats.delta}%
            </span>
          )}
        </div>
        <div className="text-2xl font-bold tracking-tight mb-3">
          {stats?.todayCount ?? 0}
        </div>
        {/* Mini bar chart */}
        <div className="flex items-end gap-1 h-8">
          {(stats?.dailyCounts || Array(7).fill(0)).map((count, i) => {
            const height = Math.max(4, (count / maxCount) * 32);
            const isToday = i === 6;
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm transition-all duration-300 ${
                  isToday ? "bg-primary" : count > 0 ? "bg-primary/30" : "bg-muted"
                }`}
                style={{ height: `${height}px` }}
                title={`${count} leads`}
              />
            );
          })}
        </div>
      </div>

      {/* Card 2: Taxa de resposta */}
      <div className="rounded-lg bg-muted/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Taxa de resposta (24h)
          </span>
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-2 py-0.5 ${
            (stats?.responseDelta ?? 0) >= 0
              ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
              : "text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10"
          }`}>
            {(stats?.responseDelta ?? 0) >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {stats?.responseDelta ?? 0}%
          </span>
        </div>
        <div className="text-2xl font-bold tracking-tight mb-3">
          {stats?.responseRate ?? 0}%
        </div>
        {/* Progress bar */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted gap-px">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${stats?.responseRate ?? 0}%` }}
          />
          <div className="h-full rounded-full bg-muted flex-1" />
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            Respondidos
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <div className="h-2 w-2 rounded-full bg-muted" />
            Sem resposta
          </div>
        </div>
      </div>
    </div>
  );
}
