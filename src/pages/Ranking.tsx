import { useState, useEffect } from "react";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { supabase } from "@/integrations/supabase/client";
import { TaskLeaderboard, LeaderboardData } from "@/components/dashboard/TaskLeaderboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Settings2, TrendingUp, CheckSquare } from "lucide-react";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear, startOfWeek, endOfWeek } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PeriodType = "week" | "month" | "quarter" | "year";
type RankingType = "sales" | "tasks";
type SortType = "revenue" | "won_leads" | "percentage" | "task_points";

export default function Ranking() {
  const { organizationId, isReady } = useOrganizationReady();
  const [period, setPeriod] = useState<PeriodType>("month");
  const [rankingType, setRankingType] = useState<RankingType>("tasks");
  const [sortBy, setSortBy] = useState<SortType>("task_points");
  const [data, setData] = useState<LeaderboardData[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const loadSalesData = async () => {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      const { start, end } = getDateRange(period);

      // Buscar membros da organização
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);

      if (membersError) throw membersError;

      const userIds = (members || []).map(m => m.user_id).filter(Boolean);

      if (userIds.length === 0) {
        setData([]);
        setIsLoading(false);
        return;
      }

      // Buscar perfis separadamente
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      // Buscar team_members para associar equipes aos usuários
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('user_id, team_id, teams(id, name, color)')
        .in('user_id', userIds);

      // Agrupar equipes por user_id
      const teamsByUser = new Map<string, Array<{id: string; name: string; color: string | null}>>();
      for (const tm of teamMembers || []) {
        const team = tm.teams as any;
        if (!team) continue;
        const current = teamsByUser.get(tm.user_id) || [];
        current.push({ id: team.id, name: team.name, color: team.color });
        teamsByUser.set(tm.user_id, current);
      }

      // Buscar leads com stages para calcular métricas
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select(`
          id,
          valor,
          responsavel_user_id,
          updated_at,
          funnel_stage_id,
          funnel_stages!leads_funnel_stage_id_fkey (
            stage_type
          )
        `)
        .eq('organization_id', organizationId)
        .in('responsavel_user_id', userIds);

      if (leadsError) throw leadsError;

      // Filtrar leads won pelo período baseado em updated_at
      const wonLeadsInPeriod = (leads || []).filter(l => {
        const stageType = (l.funnel_stages as any)?.stage_type;
        if (stageType !== 'won') return false;
        const updatedAt = new Date(l.updated_at);
        return updatedAt >= start && updatedAt <= end;
      });

      // Buscar metas dos usuários
      const { data: goals, error: goalsError } = await supabase
        .from('goals')
        .select('user_id, target_value')
        .eq('organization_id', organizationId);

      if (goalsError) throw goalsError;

      // Calcular métricas por colaborador
      const salesData: LeaderboardData[] = userIds.map(userId => {
        const profile = (profiles || []).find(p => p.user_id === userId);
        const userTotalLeads = (leads || []).filter(l => l.responsavel_user_id === userId);
        const userWonLeads = wonLeadsInPeriod.filter(l => l.responsavel_user_id === userId);
        const userGoal = (goals || []).find(g => g.user_id === userId);

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

      setData(salesData);
    } catch (error) {
      console.error('Erro ao carregar dados de vendas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTasksData = async () => {
    if (!organizationId) return;
    
    setIsLoading(true);
    try {
      const { start, end } = getDateRange(period);

      // Buscar membros da organização
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', organizationId);

      const userIds = (members || []).map(m => m.user_id).filter(Boolean);

      if (userIds.length === 0) {
        setData([]);
        setIsLoading(false);
        return;
      }

      // Buscar perfis
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      // Buscar team_members para associar equipes aos usuários
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('user_id, team_id, teams(id, name, color)')
        .in('user_id', userIds);

      // Agrupar equipes por user_id
      const teamsByUser = new Map<string, Array<{id: string; name: string; color: string | null}>>();
      for (const tm of teamMembers || []) {
        const team = tm.teams as any;
        if (!team) continue;
        const current = teamsByUser.get(tm.user_id) || [];
        current.push({ id: team.id, name: team.name, color: team.color });
        teamsByUser.set(tm.user_id, current);
      }

      // Buscar logs de pontuação de tarefas
      const { data: taskLogs } = await supabase
        .from('task_completion_logs')
        .select('user_id, total_points, was_on_time_due_date, was_on_time_timer')
        .eq('organization_id', organizationId)
        .gte('completed_at', start.toISOString())
        .lte('completed_at', end.toISOString());

      // Agrupar por user_id
      const tasksByUser = new Map<string, { points: number; completed: number; onTime: number }>();
      
      for (const log of taskLogs || []) {
        const current = tasksByUser.get(log.user_id) || { points: 0, completed: 0, onTime: 0 };
        current.points += log.total_points || 0;
        current.completed += 1;
        if (log.was_on_time_due_date || log.was_on_time_timer) {
          current.onTime += 1;
        }
        tasksByUser.set(log.user_id, current);
      }

      // Calcular dados para ranking
      const tasksData: LeaderboardData[] = userIds.map(userId => {
        const profile = (profiles || []).find(p => p.user_id === userId);
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

      setData(tasksData);
    } catch (error) {
      console.error('Erro ao carregar dados de tarefas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTeams = async () => {
    if (!organizationId) return;
    
    const { data: teamsData } = await supabase
      .from('teams')
      .select('id, name, avatar_url, color')
      .eq('organization_id', organizationId);

    setTeams(teamsData || []);
  };

  useEffect(() => {
    if (rankingType === "sales") {
      loadSalesData();
    } else {
      loadTasksData();
    }
    loadTeams();
  }, [organizationId, period, rankingType]);

  // Atualizar sortBy quando muda o tipo de ranking
  useEffect(() => {
    if (rankingType === "tasks") {
      setSortBy("task_points");
    } else {
      setSortBy("revenue");
    }
  }, [rankingType]);

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
        <Tabs value={rankingType} onValueChange={(v) => setRankingType(v as RankingType)} className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              Tarefas
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Vendas
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {/* Left Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>📊</span>
              <span>{rankingType === "tasks" ? "Ranking de Tarefas" : "Ranking de Vendas"}</span>
            </div>
            
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortType)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Ordenar por" />
              </SelectTrigger>
              <SelectContent>
                {rankingType === "tasks" && (
                  <SelectItem value="task_points">Ord. Pontos</SelectItem>
                )}
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

        {/* Leaderboard */}
        <TaskLeaderboard 
          data={data} 
          isLoading={isLoading} 
          sortBy={sortBy}
          type={rankingType}
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
      </div>
    </div>
  );
}
