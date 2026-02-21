import { useState, useCallback } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { supabase } from "@/integrations/supabase/client";
import { TaskLeaderboard, LeaderboardData } from "@/components/dashboard/TaskLeaderboard";
import { AppointmentRaceTab } from "@/components/dashboard/AppointmentRaceTab";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Settings2, TrendingUp, CheckSquare, Calendar } from "lucide-react";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, startOfWeek, endOfWeek } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";

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

const fetchSalesData = async (organizationId: string, period: PeriodType): Promise<LeaderboardData[]> => {
  const { start, end } = getDateRange(period);

  const { data: members, error: membersError } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);

  if (membersError) throw membersError;
  const userIds = (members || []).map(m => m.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const [profilesRes, teamMembersRes, leadsRes, goalsRes] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', userIds),
    supabase.from('team_members').select('user_id, team_id, teams(id, name, color)').in('user_id', userIds),
    supabase.from('leads').select(`id, valor, responsavel_user_id, updated_at, funnel_stage_id, funnel_stages!leads_funnel_stage_id_fkey (stage_type)`).eq('organization_id', organizationId).in('responsavel_user_id', userIds),
    supabase.from('goals').select('user_id, target_value').eq('organization_id', organizationId),
  ]);

  const profiles = profilesRes.data || [];
  const leads = leadsRes.data || [];
  const goals = goalsRes.data || [];

  const teamsByUser = new Map<string, Array<{id: string; name: string; color: string | null}>>();
  for (const tm of teamMembersRes.data || []) {
    const team = tm.teams as any;
    if (!team) continue;
    const current = teamsByUser.get(tm.user_id) || [];
    current.push({ id: team.id, name: team.name, color: team.color });
    teamsByUser.set(tm.user_id, current);
  }

  const wonLeadsInPeriod = leads.filter(l => {
    const stageType = (l.funnel_stages as any)?.stage_type;
    if (stageType !== 'won') return false;
    const updatedAt = new Date(l.updated_at);
    return updatedAt >= start && updatedAt <= end;
  });

  return userIds.map(userId => {
    const profile = profiles.find(p => p.user_id === userId);
    const userTotalLeads = leads.filter(l => l.responsavel_user_id === userId);
    const userWonLeads = wonLeadsInPeriod.filter(l => l.responsavel_user_id === userId);
    const userGoal = goals.find(g => g.user_id === userId);

    return {
      user_id: userId,
      full_name: profile?.full_name || 'Colaborador',
      avatar_url: profile?.avatar_url || null,
      won_leads: userWonLeads.length,
      total_leads: userTotalLeads.length,
      total_revenue: userWonLeads.reduce((sum, l) => sum + (l.valor || 0), 0),
      target: userGoal?.target_value || 10,
      task_points: 0,
      tasks_completed: 0,
      tasks_on_time: 0,
      teams: teamsByUser.get(userId) || [],
    };
  });
};

const fetchTasksData = async (organizationId: string, period: PeriodType): Promise<LeaderboardData[]> => {
  const { start, end } = getDateRange(period);

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);

  const userIds = (members || []).map(m => m.user_id).filter(Boolean);
  if (userIds.length === 0) return [];

  const [profilesRes, teamMembersRes, taskLogsRes] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name, avatar_url').in('user_id', userIds),
    supabase.from('team_members').select('user_id, team_id, teams(id, name, color)').in('user_id', userIds),
    supabase.from('task_completion_logs').select('user_id, total_points, was_on_time_due_date, was_on_time_timer').eq('organization_id', organizationId).gte('completed_at', start.toISOString()).lte('completed_at', end.toISOString()),
  ]);

  const profiles = profilesRes.data || [];

  const teamsByUser = new Map<string, Array<{id: string; name: string; color: string | null}>>();
  for (const tm of teamMembersRes.data || []) {
    const team = tm.teams as any;
    if (!team) continue;
    const current = teamsByUser.get(tm.user_id) || [];
    current.push({ id: team.id, name: team.name, color: team.color });
    teamsByUser.set(tm.user_id, current);
  }

  const tasksByUser = new Map<string, { points: number; completed: number; onTime: number }>();
  for (const log of taskLogsRes.data || []) {
    const current = tasksByUser.get(log.user_id) || { points: 0, completed: 0, onTime: 0 };
    current.points += log.total_points || 0;
    current.completed += 1;
    if (log.was_on_time_due_date || log.was_on_time_timer) current.onTime += 1;
    tasksByUser.set(log.user_id, current);
  }

  return userIds.map(userId => {
    const profile = profiles.find(p => p.user_id === userId);
    const userTasks = tasksByUser.get(userId) || { points: 0, completed: 0, onTime: 0 };

    return {
      user_id: userId,
      full_name: profile?.full_name || 'Colaborador',
      avatar_url: profile?.avatar_url || null,
      task_points: userTasks.points,
      tasks_completed: userTasks.completed,
      tasks_on_time: userTasks.onTime,
      won_leads: 0,
      total_leads: 0,
      total_revenue: 0,
      target: 0,
      teams: teamsByUser.get(userId) || [],
    };
  });
};

const fetchTeams = async (organizationId: string) => {
  const { data } = await supabase
    .from('teams')
    .select('id, name, avatar_url, color')
    .eq('organization_id', organizationId);
  return data || [];
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

  const { data: teams = [] } = useQuery({
    queryKey: ['ranking-teams', organizationId],
    queryFn: () => fetchTeams(organizationId!),
    enabled: !!organizationId,
    staleTime: 1000 * 60 * 5,
  });

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

            {/* Teams Footer */}
            {teams.length > 0 && (
              <div className="mt-6 flex items-center gap-4 px-4 py-3 bg-muted/30 rounded-lg border border-border">
                <span className="text-sm text-muted-foreground">Times Ativos:</span>
                <div className="flex items-center gap-2">
                  {teams.map(team => (
                    <div key={team.id} className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border-2" style={{ borderColor: team.color || 'hsl(var(--primary))' }}>
                        <AvatarImage src={team.avatar_url} />
                        <AvatarFallback className="bg-muted text-foreground text-xs">
                          {team.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  ))}
                </div>
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

            {/* Teams Footer */}
            {teams.length > 0 && (
              <div className="mt-6 flex items-center gap-4 px-4 py-3 bg-muted/30 rounded-lg border border-border">
                <span className="text-sm text-muted-foreground">Times Ativos:</span>
                <div className="flex items-center gap-2">
                  {teams.map(team => (
                    <div key={team.id} className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 border-2" style={{ borderColor: team.color || 'hsl(var(--primary))' }}>
                        <AvatarImage src={team.avatar_url} />
                        <AvatarFallback className="bg-muted text-foreground text-xs">
                          {team.name?.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                  ))}
                </div>
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
