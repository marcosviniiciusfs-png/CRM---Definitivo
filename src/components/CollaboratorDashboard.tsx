import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TopSalesReps } from "./dashboard/TopSalesReps";
import { ForecastByOwner } from "./dashboard/ForecastByOwner";
import { SalesGauge } from "./dashboard/SalesGauge";
import { SoldThisMonth } from "./dashboard/SoldThisMonth";
import { OpenRequests } from "./dashboard/OpenRequests";
import { WonBySource } from "./dashboard/WonBySource";
import { ForecastChart } from "./dashboard/ForecastChart";
import { TrendingUp, Users, Target, Zap } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, endOfDay, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

type PeriodFilter = "today" | "week" | "month" | "quarter";

interface CollaboratorDashboardProps {
  organizationId?: string;
}

export function CollaboratorDashboard({ organizationId }: CollaboratorDashboardProps) {
  const { organizationId: contextOrgId, permissions } = useOrganization();
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    salesReps: [] as any[],
    forecastByOwner: [] as any[],
    openRequests: [] as any[],
    wonBySource: [] as any[],
    trendData: [] as any[],
    totalSold: 0,
    salesCount: 0,
    pendingActivities: 0,
    totalTarget: 100000,
    leadsToday: 0,
    leadsWeek: 0,
    conversionRate: 0,
  });

  const orgId = organizationId || contextOrgId;

  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    switch (period) {
      case "today":
        start = startOfDay(now);
        break;
      case "week":
        start = startOfWeek(now, { weekStartsOn: 1 });
        break;
      case "quarter":
        start = startOfQuarter(now);
        break;
      case "month":
      default:
        start = startOfMonth(now);
        break;
    }
    return { start, end: endOfDay(now) };
  }, [period]);

  useEffect(() => {
    if (orgId) {
      loadDashboardData();
    }
  }, [orgId, period]);

  const loadDashboardData = async () => {
    if (!orgId) return;
    setIsLoading(true);

    try {
      // Fetch all data in parallel
      const [
        membersResult,
        leadsResult,
        stagesResult,
        tasksResult,
        goalsResult,
      ] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase
          .from('leads')
          .select('id, nome_lead, empresa, valor, source, created_at, updated_at, responsavel_user_id, funnel_stage_id')
          .eq('organization_id', orgId),
        supabase
          .from('funnel_stages')
          .select('id, name, stage_type, funnel_id')
          .in('funnel_id', 
            (await supabase.from('sales_funnels').select('id').eq('organization_id', orgId)).data?.map(f => f.id) || []
          ),
        supabase
          .from('kanban_cards')
          .select('id, column_id')
          .in('column_id',
            (await supabase.from('kanban_columns').select('id').in('board_id',
              (await supabase.from('kanban_boards').select('id').eq('organization_id', orgId)).data?.map(b => b.id) || []
            )).data?.map(c => c.id) || []
          ),
        supabase
          .from('goals')
          .select('target_value, current_value')
          .eq('organization_id', orgId),
      ]);

      const members = membersResult.data || [];
      const leads = leadsResult.data || [];
      const stages = stagesResult.data || [];
      const tasks = tasksResult.data || [];
      const goals = goalsResult.data || [];

      // Get profiles for members
      const userIds = members.filter(m => m.user_id).map(m => m.user_id);
      let profilesMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', userIds);
        
        if (profiles) {
          profilesMap = profiles.reduce((acc, p) => {
            acc[p.user_id] = p;
            return acc;
          }, {} as Record<string, any>);
        }
      }

      // Create stage type map
      const stageTypeMap = stages.reduce((acc, s) => {
        acc[s.id] = s.stage_type;
        return acc;
      }, {} as Record<string, string>);

      // Filter leads by period
      const periodLeads = leads.filter(l => {
        const createdAt = new Date(l.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });

      // Won leads in period
      const wonLeads = leads.filter(l => {
        const updatedAt = new Date(l.updated_at);
        return updatedAt >= dateRange.start && 
               updatedAt <= dateRange.end && 
               stageTypeMap[l.funnel_stage_id] === 'won';
      });

      // Calculate sales reps metrics
      const salesReps = members
        .filter(m => m.user_id)
        .map(m => {
          const profile = profilesMap[m.user_id] || {};
          const userWonLeads = wonLeads.filter(l => l.responsavel_user_id === m.user_id);
          const userAllLeads = periodLeads.filter(l => l.responsavel_user_id === m.user_id);
          const totalRevenue = userWonLeads.reduce((sum, l) => sum + (l.valor || 0), 0);
          const userGoal = goals[0]; // Use first available goal as fallback
          
          return {
            user_id: m.user_id,
            full_name: profile.full_name || m.email,
            avatar_url: profile.avatar_url,
            won_leads: userWonLeads.length,
            total_leads: userAllLeads.length,
            total_revenue: totalRevenue,
            target: userGoal?.target_value || 50000,
          };
        })
        .sort((a, b) => b.total_revenue - a.total_revenue);

      // Forecast by owner (bar chart)
      const forecastByOwner = salesReps.slice(0, 6).map(rep => ({
        name: rep.full_name,
        value: rep.total_revenue,
        color: "",
      }));

      // Open requests (pending leads)
      const pendingLeads = leads
        .filter(l => {
          const stageType = stageTypeMap[l.funnel_stage_id];
          return stageType !== 'won' && stageType !== 'lost' && stageType !== 'discarded';
        })
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .slice(0, 10);

      // Won by source (donut chart)
      const sourceGroups = wonLeads.reduce((acc, l) => {
        const source = l.source || 'Outro';
        if (!acc[source]) {
          acc[source] = 0;
        }
        acc[source] += l.valor || 0;
        return acc;
      }, {} as Record<string, number>);

      const wonBySource = Object.entries(sourceGroups).map(([name, value]) => ({
        name,
        value,
        color: "",
      }));

      const totalWonValue = wonLeads.reduce((sum, l) => sum + (l.valor || 0), 0);

      // Trend data (last 6 months)
      const trendData = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = i === 0 ? new Date() : startOfMonth(subMonths(new Date(), i - 1));
        
        const monthWonLeads = leads.filter(l => {
          const updatedAt = new Date(l.updated_at);
          return updatedAt >= monthStart && 
                 updatedAt < monthEnd && 
                 stageTypeMap[l.funnel_stage_id] === 'won';
        });
        
        const monthValue = monthWonLeads.reduce((sum, l) => sum + (l.valor || 0), 0);
        
        trendData.push({
          month: format(monthDate, "MMM", { locale: ptBR }),
          value: monthValue,
        });
      }

      // Quick stats
      const today = startOfDay(new Date());
      const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      
      const leadsToday = leads.filter(l => new Date(l.created_at) >= today).length;
      const leadsWeek = leads.filter(l => new Date(l.created_at) >= weekStart).length;
      const totalLeads = periodLeads.length;
      const conversionRate = totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;

      // Total target from all goals
      const totalTarget = goals.reduce((sum, g) => sum + (g.target_value || 0), 0) || 100000;

      setDashboardData({
        salesReps,
        forecastByOwner,
        openRequests: pendingLeads,
        wonBySource,
        trendData,
        totalSold: totalWonValue,
        salesCount: wonLeads.length,
        pendingActivities: tasks.length,
        totalTarget,
        leadsToday,
        leadsWeek,
        conversionRate,
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Performance</h2>
          <p className="text-muted-foreground">Acompanhe as métricas de vendas da equipe</p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Esta Semana</SelectItem>
            <SelectItem value="month">Este Mês</SelectItem>
            <SelectItem value="quarter">Este Trimestre</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboardData.leadsToday}</p>
                <p className="text-xs text-muted-foreground">Leads Hoje</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboardData.leadsWeek}</p>
                <p className="text-xs text-muted-foreground">Leads Semana</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboardData.salesCount}</p>
                <p className="text-xs text-muted-foreground">Fechamentos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                <Target className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dashboardData.conversionRate}%</p>
                <p className="text-xs text-muted-foreground">Conversão</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main dashboard grid - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <TopSalesReps reps={dashboardData.salesReps} isLoading={isLoading} />
        <ForecastByOwner data={dashboardData.forecastByOwner} isLoading={isLoading} />
        <SalesGauge 
          current={dashboardData.totalSold} 
          target={dashboardData.totalTarget} 
          isLoading={isLoading} 
        />
        <SoldThisMonth 
          totalSold={dashboardData.totalSold}
          salesCount={dashboardData.salesCount}
          pendingActivities={dashboardData.pendingActivities}
          isLoading={isLoading}
        />
      </div>

      {/* Main dashboard grid - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OpenRequests requests={dashboardData.openRequests} isLoading={isLoading} />
        <WonBySource 
          data={dashboardData.wonBySource} 
          totalValue={dashboardData.totalSold}
          isLoading={isLoading} 
        />
        <div className="lg:col-span-2">
          <ForecastChart data={dashboardData.trendData} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
