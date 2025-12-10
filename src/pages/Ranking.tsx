import { useState, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { supabase } from "@/integrations/supabase/client";
import { SalesLeaderboard, SalesRepData } from "@/components/dashboard/SalesLeaderboard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";

type PeriodType = "month" | "quarter" | "year";

export default function Ranking() {
  const { organizationId } = useOrganization();
  const [period, setPeriod] = useState<PeriodType>("month");
  const [reps, setReps] = useState<SalesRepData[]>([]);
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

      // Buscar membros da organização com seus perfis
      const { data: members, error: membersError } = await supabase
        .from('organization_members')
        .select(`
          user_id,
          profiles!inner (
            full_name,
            avatar_url
          )
        `)
        .eq('organization_id', organizationId);

      if (membersError) throw membersError;

      // Buscar leads com stages para calcular métricas
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select(`
          id,
          valor,
          responsavel_user_id,
          created_at,
          updated_at,
          funnel_stage_id,
          funnel_stages!leads_funnel_stage_id_fkey (
            stage_type
          )
        `)
        .eq('organization_id', organizationId)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      if (leadsError) throw leadsError;

      // Buscar metas dos usuários
      const { data: goals, error: goalsError } = await supabase
        .from('goals')
        .select('user_id, target_value')
        .eq('organization_id', organizationId);

      if (goalsError) throw goalsError;

      // Calcular métricas por colaborador
      const salesData: SalesRepData[] = (members || [])
        .filter((m: any) => m.user_id)
        .map((member: any) => {
          const userLeads = (leads || []).filter(l => l.responsavel_user_id === member.user_id);
          const wonLeads = userLeads.filter(l => (l.funnel_stages as any)?.stage_type === 'won');
          const userGoal = (goals || []).find(g => g.user_id === member.user_id);

          return {
            user_id: member.user_id,
            full_name: member.profiles?.full_name || 'Colaborador',
            avatar_url: member.profiles?.avatar_url || null,
            won_leads: wonLeads.length,
            total_leads: userLeads.length,
            total_revenue: wonLeads.reduce((sum, l) => sum + (l.valor || 0), 0),
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
    <div className="min-h-screen p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ranking de Vendas</h1>
          <p className="text-muted-foreground text-sm">Acompanhe o desempenho da equipe</p>
        </div>
        
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Este Mês</SelectItem>
            <SelectItem value="quarter">Este Trimestre</SelectItem>
            <SelectItem value="year">Este Ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Leaderboard */}
      <SalesLeaderboard reps={reps} isLoading={isLoading} />
    </div>
  );
}
