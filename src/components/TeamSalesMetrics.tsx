import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Trophy, TrendingUp, DollarSign, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface TeamSalesData {
  teamId: string;
  teamName: string;
  teamColor: string;
  salesCount: number;
  revenue: number;
  topSeller?: {
    name: string;
    avatar?: string;
    revenue: number;
  };
}

interface TeamSalesMetricsProps {
  organizationId: string;
  teams: Array<{ id: string; name: string; color: string }>;
  teamMembers: Array<{ team_id: string; user_id: string }>;
}

export function TeamSalesMetrics({ organizationId, teams, teamMembers }: TeamSalesMetricsProps) {
  const [salesData, setSalesData] = useState<TeamSalesData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSalesData();
  }, [organizationId, teams, teamMembers]);

  const loadSalesData = async () => {
    if (!organizationId || teams.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Get won stages and won leads in parallel
      const [wonStagesResult, wonLeadsResult, profilesResult] = await Promise.all([
        supabase.from("funnel_stages").select("id").eq("stage_type", "won"),
        supabase
          .from("leads")
          .select("responsavel_user_id, valor")
          .eq("organization_id", organizationId)
          .gte("updated_at", startOfMonth),
        supabase
          .from("profiles")
          .select("user_id, full_name, avatar_url")
          .in(
            "user_id",
            teamMembers.map((tm) => tm.user_id)
          ),
      ]);

      const wonStageIds = new Set(wonStagesResult.data?.map((s) => s.id) || []);
      const profilesMap = new Map(
        (profilesResult.data || []).map((p) => [p.user_id, p])
      );

      // We need to filter won leads - but we don't have funnel_stage_id in this query
      // Let's re-query with the stage filter
      const { data: filteredWonLeads } = await supabase
        .from("leads")
        .select("responsavel_user_id, valor")
        .eq("organization_id", organizationId)
        .in("funnel_stage_id", [...wonStageIds])
        .gte("updated_at", startOfMonth);

      const wonLeads = filteredWonLeads || [];

      // Group sales by team
      const data: TeamSalesData[] = teams.map((team) => {
        const memberIds = new Set(
          teamMembers.filter((tm) => tm.team_id === team.id).map((tm) => tm.user_id)
        );

        const teamWonLeads = wonLeads.filter(
          (l) => l.responsavel_user_id && memberIds.has(l.responsavel_user_id)
        );

        // Find top seller
        const salesByUser: Record<string, number> = {};
        teamWonLeads.forEach((l) => {
          if (l.responsavel_user_id) {
            salesByUser[l.responsavel_user_id] =
              (salesByUser[l.responsavel_user_id] || 0) + (l.valor || 0);
          }
        });

        const topUserId = Object.entries(salesByUser).sort(
          ([, a], [, b]) => b - a
        )[0]?.[0];
        const topProfile = topUserId ? profilesMap.get(topUserId) : null;

        return {
          teamId: team.id,
          teamName: team.name,
          teamColor: team.color,
          salesCount: teamWonLeads.length,
          revenue: teamWonLeads.reduce((sum, l) => sum + (l.valor || 0), 0),
          topSeller: topUserId
            ? {
                name: topProfile?.full_name || "Colaborador",
                avatar: topProfile?.avatar_url || undefined,
                revenue: salesByUser[topUserId],
              }
            : undefined,
        };
      });

      setSalesData(data.sort((a, b) => b.revenue - a.revenue));
    } catch (error) {
      console.error("Error loading team sales:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (salesData.length === 0) return null;

  const maxRevenue = Math.max(...salesData.map((d) => d.revenue), 1);

  return (
    <div className="space-y-6 mb-8">
      {/* Ranking Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-amber-500" />
            Ranking de Equipes — Vendas do Mês
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {salesData.map((team, index) => (
              <div key={team.teamId} className="flex items-center gap-3">
                <span
                  className="text-sm font-bold w-6 text-center"
                  style={{ color: team.teamColor }}
                >
                  {index + 1}º
                </span>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: team.teamColor }}
                />
                <span className="text-sm font-medium flex-shrink-0 w-32 truncate">
                  {team.teamName}
                </span>
                <div className="flex-1">
                  <Progress
                    value={maxRevenue > 0 ? (team.revenue / maxRevenue) * 100 : 0}
                    className="h-2"
                    indicatorClassName="transition-all"
                    style={
                      {
                        "--progress-color": team.teamColor,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {team.salesCount} vendas
                  </span>
                  <span className="text-sm font-semibold text-foreground min-w-[80px] text-right">
                    R$ {team.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Per-team mini cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {salesData.map((team) => (
          <Card
            key={team.teamId}
            className="border-t-4"
            style={{ borderTopColor: team.teamColor }}
          >
            <CardContent className="pt-4 pb-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: team.teamColor }}>
                  {team.teamName}
                </span>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  {team.salesCount} vendas
                </div>
              </div>
              <p className="text-xl font-bold text-foreground">
                R$ {team.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </p>
              {team.topSeller && (
                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Trophy className="h-3 w-3 text-amber-500" />
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={team.topSeller.avatar} />
                    <AvatarFallback className="text-[9px]">
                      {team.topSeller.name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs text-muted-foreground truncate">
                    {team.topSeller.name}
                  </span>
                  <span className="text-xs font-medium text-green-600 ml-auto">
                    R$ {team.topSeller.revenue.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
