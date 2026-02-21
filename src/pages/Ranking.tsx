import { useState, useCallback } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { supabase } from "@/integrations/supabase/client";
import { TaskLeaderboard, LeaderboardData } from "@/components/dashboard/TaskLeaderboard";
import { AppointmentRaceTab } from "@/components/dashboard/AppointmentRaceTab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Settings2, TrendingUp, CheckSquare, Calendar } from "lucide-react";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, startOfWeek, endOfWeek } from "date-fns";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { TeamSalesMetrics } from "@/components/TeamSalesMetrics";

type PeriodType = "week" | "month" | "quarter" | "year";
type RankingType = "sales" | "tasks" | "appointments";
type SortType = "revenue" | "won_leads" | "percentage" | "task_points";

const getDateRange = (periodType: PeriodType) => {
  const now = new Date();
  switch (periodType) {
    case "week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case "month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "year":
      return { start: startOfYear(now), end: endOfYear(now) };
  }
};

const fetchSalesData = async (organizationId: string, periodType: PeriodType): Promise<LeaderboardData[]> => {
  if (!organizationId) return [];

  const { start, end } = getDateRange(periodType);

  // Fetch won leads with funnel stage info
  const { data: leads } = await supabase
    .from('leads')
    .select(`
      responsavel_user_id,
      valor,
      funnel_stage_id,
      funnel_stages (
        stage_type
      )
    `)
    .eq('organization_id', organizationId)
    .gte('data_conclusao', start.toISOString())
    .lte('data_conclusao', end.toISOString());

  const validData = (leads as any[])?.filter(item => item.funnel_stages?.stage_type === 'won') || [];

  // Get unique user IDs to fetch profiles
  const userIds = [...new Set(validData.map(item => item.responsavel_user_id).filter(Boolean))];
  
  // Fetch profiles for these users
  const profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', userIds);
    profiles?.forEach(p => { profilesMap[p.user_id] = p; });
  }

  // Aggregate sales data by user
  const userSalesMap: { [userId: string]: LeaderboardData } = {};
  validData.forEach(item => {
    const userId = item.responsavel_user_id;
    if (!userId) return;

    if (!userSalesMap[userId]) {
      const profile = profilesMap[userId];
      userSalesMap[userId] = {
        user_id: userId,
        full_name: profile?.full_name || 'Sem nome',
        avatar_url: profile?.avatar_url || null,
        total_revenue: 0,
        won_leads: 0,
        task_points: 0,
      };
    }

    userSalesMap[userId].total_revenue = (userSalesMap[userId].total_revenue || 0) + (item.valor || 0);
    userSalesMap[userId].won_leads = (userSalesMap[userId].won_leads || 0) + 1;
  });

  return Object.values(userSalesMap);
};

const fetchTasksData = async (organizationId: string, periodType: PeriodType): Promise<LeaderboardData[]> => {
  if (!organizationId) return [];

  const { start, end } = getDateRange(periodType);

  // Fetch completed task assignees within the period
  const { data: assignees } = await supabase
    .from('kanban_card_assignees')
    .select('user_id, is_completed, completed_at')
    .eq('is_completed', true)
    .gte('completed_at', start.toISOString())
    .lte('completed_at', end.toISOString());

  // Get unique user IDs
  const userIds = [...new Set((assignees || []).map(a => a.user_id))];
  
  // Fetch profiles
  const profilesMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', userIds);
    profiles?.forEach(p => { profilesMap[p.user_id] = p; });
  }

  // Aggregate tasks data by user
  const userTasksMap: { [userId: string]: LeaderboardData } = {};
  (assignees || []).forEach(item => {
    const userId = item.user_id;
    if (!userId) return;

    if (!userTasksMap[userId]) {
      const profile = profilesMap[userId];
      userTasksMap[userId] = {
        user_id: userId,
        full_name: profile?.full_name || 'Sem nome',
        avatar_url: profile?.avatar_url || null,
        task_points: 0,
        tasks_completed: 0,
      };
    }

    userTasksMap[userId].tasks_completed = (userTasksMap[userId].tasks_completed || 0) + 1;
    userTasksMap[userId].task_points = (userTasksMap[userId].task_points || 0) + 1;
  });

  return Object.values(userTasksMap);
};

const fetchTeamsData = async (organizationId: string) => {
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, avatar_url, color')
    .eq('organization_id', organizationId);

  const teamList = teams || [];
  if (teamList.length === 0) return { teams: [], teamMembers: [] };

  const { data: members } = await supabase
    .from('team_members')
    .select('team_id, user_id')
    .in('team_id', teamList.map(t => t.id));

  return { teams: teamList, teamMembers: (members || []) as Array<{ team_id: string; user_id: string }> };
};

export default function Ranking() {
  const { organizationId, isReady } = useOrganizationReady();
  const [period, setPeriod] = useState<PeriodType>("month");
  const [rankingType, setRankingType] = useState<RankingType>("tasks");
  const [sortBy, setSortBy] = useState<SortType>("task_points");

  const { data: salesData = [], isLoading: salesLoading } = useQuery({
    queryKey: ['ranking-sales', organizationId, period],
    queryFn: () => fetchSalesData(organizationId!, period),
    enabled: !!organizationId && rankingType === 'sales',
    staleTime: 1000 * 60 * 5,
  });

  const { data: tasksData = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['ranking-tasks', organizationId, period],
    queryFn: () => fetchTasksData(organizationId!, period),
    enabled: !!organizationId && rankingType === 'tasks',
    staleTime: 1000 * 60 * 5,
  });

  const { data: teamsData } = useQuery({
    queryKey: ['ranking-teams', organizationId],
    queryFn: () => fetchTeamsData(organizationId!),
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

  const teams = teamsData?.teams ?? [];
  const teamMembers = teamsData?.teamMembers ?? [];

  const data = rankingType === 'sales' ? salesData : tasksData;
  const isLoading = rankingType === 'sales' ? salesLoading : tasksLoading;

  const handleRankingTypeChange = (v: string) => {
    setRankingType(v as RankingType);
    if (v === "tasks") setSortBy("task_points");
    else setSortBy("revenue");
  };

  // Guard: Aguardar inicialização completa (auth + org)
  if (!isReady || !organizationId) {
    return <LoadingAnimation text="Carregando ranking..." />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-center gap-3 py-4 border-b border-border">
        <Trophy className="h-6 w-6 text-yellow-400" />
        <h1 className="text-xl font-bold text-foreground">Ranking</h1>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <div className="p-4 md:p-6">
        {/* Ranking Type Tabs */}
        <Tabs value={rankingType} onValueChange={handleRankingTypeChange} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Tarefas
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Vendas
            </TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Agendamentos
            </TabsTrigger>
          </TabsList>

          {/* Tasks Content */}
          <TabsContent value="tasks" className="mt-0">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>📊</span>
                  <span>Ranking de Tarefas</span>
                </div>
                
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortType)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="task_points">Ord. Pontos</SelectItem>
                    <SelectItem value="revenue">Ord. Faturamento</SelectItem>
                    <SelectItem value="won_leads">Ord. Vendas</SelectItem>
                    <SelectItem value="percentage">Ord. Porcentagem</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Esta Semana</SelectItem>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="quarter">Este Trimestre</SelectItem>
                    <SelectItem value="year">Este Ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TaskLeaderboard 
              data={data} 
              isLoading={isLoading} 
              sortBy={sortBy}
              type="tasks"
              period={period}
            />

            {/* Team Sales Ranking */}
            {teams.length > 0 && (
              <div className="mt-6">
                <TeamSalesMetrics
                  organizationId={organizationId}
                  teams={teams.map(t => ({ id: t.id, name: t.name, color: t.color || '#3B82F6' }))}
                  teamMembers={teamMembers}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="sales" className="mt-0">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>📊</span>
                  <span>Ranking de Vendas</span>
                </div>
                
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortType)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Ordenar por" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="revenue">Ord. Faturamento</SelectItem>
                    <SelectItem value="won_leads">Ord. Vendas</SelectItem>
                    <SelectItem value="percentage">Ord. Porcentagem</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Esta Semana</SelectItem>
                    <SelectItem value="month">Este Mês</SelectItem>
                    <SelectItem value="quarter">Este Trimestre</SelectItem>
                    <SelectItem value="year">Este Ano</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TaskLeaderboard 
              data={data} 
              isLoading={isLoading} 
              sortBy={sortBy}
              type="sales"
              period={period}
            />

            {/* Team Sales Ranking */}
            {teams.length > 0 && (
              <div className="mt-6">
                <TeamSalesMetrics
                  organizationId={organizationId}
                  teams={teams.map(t => ({ id: t.id, name: t.name, color: t.color || '#3B82F6' }))}
                  teamMembers={teamMembers}
                />
              </div>
            )}
          </TabsContent>

          <TabsContent value="appointments" className="mt-0">
            <AppointmentRaceTab organizationId={organizationId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

