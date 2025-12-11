import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { SalesLeaderboard, SalesRepData } from "@/components/dashboard/SalesLeaderboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Trophy, Settings2 } from "lucide-react";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type PeriodType = "month" | "quarter" | "year";
type SortType = "revenue" | "won_leads" | "percentage";

export default function Ranking() {
  const { organizationId } = useOrganization();
  const [period, setPeriod] = useState<PeriodType>("month");
  const [sortBy, setSortBy] = useState<SortType>("revenue");
  const [reps, setReps] = useState<SalesRepData[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const getDateRange = (periodType: PeriodType) => {
    const now = new Date();
    switch (periodType) {
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
        setReps([]);
        setIsLoading(false);
        return;
      }

      // Buscar perfis separadamente
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name, avatar_url')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

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

      // Buscar times
      const { data: teamsData } = await supabase
        .from('teams')
        .select('id, name, avatar_url, color')
        .eq('organization_id', organizationId);

      setTeams(teamsData || []);

      // Calcular métricas por colaborador
      const salesData: SalesRepData[] = userIds.map(userId => {
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
        };
      });

      setReps(salesData);
    } catch (error) {
      console.error('Erro ao carregar dados de vendas:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSalesData();
  }, [organizationId, period]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center justify-center gap-3 py-4 border-b border-border">
        <Trophy className="h-6 w-6 text-yellow-400" />
        <h1 className="text-xl font-bold text-foreground">Ranking de vendas</h1>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Settings2 className="h-5 w-5" />
        </Button>
      </div>

      <div className="p-4 md:p-6">
        {/* Filters Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          {/* Left Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>📊</span>
              <span>Nome do Ranking</span>
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
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="quarter">Este Trimestre</SelectItem>
                <SelectItem value="year">Este Ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Leaderboard */}
        <SalesLeaderboard 
          reps={reps} 
          isLoading={isLoading} 
          sortBy={sortBy}
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
