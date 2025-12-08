import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TopSalesReps } from "./dashboard/TopSalesReps";
import { ForecastByOwner } from "./dashboard/ForecastByOwner";
import { SalesGauge } from "./dashboard/SalesGauge";
import { SoldThisMonth } from "./dashboard/SoldThisMonth";
import { OpenRequests } from "./dashboard/OpenRequests";
import { WonBySource } from "./dashboard/WonBySource";
import { ForecastChart } from "./dashboard/ForecastChart";
import { CollaboratorMetrics } from "./dashboard/CollaboratorMetrics";
import { TrendingUp, Users, Target, Zap } from "lucide-react";
import { startOfDay, startOfWeek, startOfMonth, startOfQuarter, endOfDay, format, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

type PeriodFilter = "today" | "week" | "month" | "quarter";

interface CollaboratorDashboardProps {
  organizationId?: string;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
  avatar_url?: string;
  role?: string;
}

interface CollaboratorMetricsData {
  leadsAssigned: number;
  salesMade: number;
  conversionRate: number;
  avgResponseTime: number;
  pendingLeads: number;
  revenueGenerated: number;
}

export function CollaboratorDashboard({ organizationId }: CollaboratorDashboardProps) {
  const { organizationId: contextOrgId, permissions } = useOrganization();
  const [period, setPeriod] = useState<PeriodFilter>("month");
  const [isLoading, setIsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selectedCollaborator, setSelectedCollaborator] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<CollaboratorMetricsData | null>(null);
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

  // Verificar permissões - admin e owner podem selecionar colaboradores
  const canSelectCollaborator = !permissions.loading && (permissions.role === 'owner' || permissions.role === 'admin');

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
  }, [orgId, period, selectedCollaborator]);

  // Calcular tempo médio de resposta para um colaborador
  const calculateAvgResponseTime = async (userId: string, leadIds: string[]): Promise<number> => {
    if (leadIds.length === 0) return 0;

    const { data: messages } = await supabase
      .from('mensagens_chat')
      .select('id_lead, direcao, data_hora')
      .in('id_lead', leadIds)
      .order('data_hora', { ascending: true });

    if (!messages || messages.length === 0) return 0;

    // Agrupar mensagens por lead
    const messagesByLead: Record<string, typeof messages> = {};
    messages.forEach(msg => {
      if (!messagesByLead[msg.id_lead]) {
        messagesByLead[msg.id_lead] = [];
      }
      messagesByLead[msg.id_lead].push(msg);
    });

    // Calcular tempo de resposta para cada lead
    const responseTimes: number[] = [];
    Object.values(messagesByLead).forEach(leadMessages => {
      const firstIncoming = leadMessages.find(m => m.direcao === 'ENTRADA');
      const firstOutgoing = leadMessages.find(m => m.direcao === 'SAIDA');

      if (firstIncoming && firstOutgoing) {
        const inTime = new Date(firstIncoming.data_hora).getTime();
        const outTime = new Date(firstOutgoing.data_hora).getTime();
        if (outTime > inTime) {
          const diffMinutes = (outTime - inTime) / (1000 * 60);
          responseTimes.push(diffMinutes);
        }
      }
    });

    if (responseTimes.length === 0) return 0;
    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  };

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

      const membersData = membersResult.data || [];
      const leads = leadsResult.data || [];
      const stages = stagesResult.data || [];
      const tasks = tasksResult.data || [];
      const goals = goalsResult.data || [];

      // Get profiles for members
      const userIds = membersData.filter(m => m.user_id).map(m => m.user_id);
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

      // Atualizar lista de membros para o seletor
      const membersList: MemberInfo[] = membersData
        .filter(m => m.user_id)
        .map(m => ({
          user_id: m.user_id,
          full_name: profilesMap[m.user_id]?.full_name || m.email || 'Sem nome',
          avatar_url: profilesMap[m.user_id]?.avatar_url,
          role: m.role,
        }));
      setMembers(membersList);
      setMembersLoading(false);

      // Create stage type map
      const stageTypeMap = stages.reduce((acc, s) => {
        acc[s.id] = s.stage_type;
        return acc;
      }, {} as Record<string, string>);

      // Aplicar filtro de colaborador se selecionado
      const filterByCollaborator = (leadsList: typeof leads) => {
        if (!selectedCollaborator) return leadsList;
        return leadsList.filter(l => l.responsavel_user_id === selectedCollaborator);
      };

      // Filter leads by period
      const allPeriodLeads = leads.filter(l => {
        const createdAt = new Date(l.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
      const periodLeads = filterByCollaborator(allPeriodLeads);

      // Won leads in period
      const allWonLeads = leads.filter(l => {
        const updatedAt = new Date(l.updated_at);
        return updatedAt >= dateRange.start && 
               updatedAt <= dateRange.end && 
               stageTypeMap[l.funnel_stage_id] === 'won';
      });
      const wonLeads = filterByCollaborator(allWonLeads);

      // Se um colaborador está selecionado, calcular métricas individuais
      if (selectedCollaborator) {
        const collabLeads = leads.filter(l => l.responsavel_user_id === selectedCollaborator);
        const collabWonLeads = collabLeads.filter(l => stageTypeMap[l.funnel_stage_id] === 'won');
        const collabPendingLeads = collabLeads.filter(l => {
          const stageType = stageTypeMap[l.funnel_stage_id];
          return stageType !== 'won' && stageType !== 'lost' && stageType !== 'discarded';
        });
        
        const avgResponseTime = await calculateAvgResponseTime(
          selectedCollaborator, 
          collabLeads.map(l => l.id)
        );

        const totalLeads = collabLeads.length;
        const totalSales = collabWonLeads.length;
        const conversionRateVal = totalLeads > 0 ? Math.round((totalSales / totalLeads) * 100) : 0;

        setSelectedMetrics({
          leadsAssigned: totalLeads,
          salesMade: totalSales,
          conversionRate: conversionRateVal,
          avgResponseTime,
          pendingLeads: collabPendingLeads.length,
          revenueGenerated: collabWonLeads.reduce((sum, l) => sum + (l.valor || 0), 0),
        });
      } else {
        setSelectedMetrics(null);
      }

      // Calculate sales reps metrics
      const salesReps = membersData
        .filter(m => m.user_id)
        .map(m => {
          const profile = profilesMap[m.user_id] || {};
          const userWonLeads = allWonLeads.filter(l => l.responsavel_user_id === m.user_id);
          const userAllLeads = allPeriodLeads.filter(l => l.responsavel_user_id === m.user_id);
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

  const selectedMember = members.find(m => m.user_id === selectedCollaborator);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="space-y-6">
      {/* Header with selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Performance</h2>
          <p className="text-muted-foreground">Acompanhe as métricas de vendas da equipe</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Seletor de Colaborador (apenas para admins/owners) */}
          {canSelectCollaborator && (
            <Select 
              value={selectedCollaborator || "all"} 
              onValueChange={(v) => setSelectedCollaborator(v === "all" ? null : v)}
              disabled={membersLoading}
            >
              <SelectTrigger className="w-[250px] bg-background border-border">
                <SelectValue placeholder="Selecionar colaborador">
                  {membersLoading ? (
                    <span className="text-muted-foreground">Carregando...</span>
                  ) : selectedCollaborator && selectedMember ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={selectedMember.avatar_url} />
                        <AvatarFallback className="text-[10px] bg-primary/10">
                          {getInitials(selectedMember.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{selectedMember.full_name}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span>Todos os colaboradores</span>
                    </div>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[300px] bg-popover border-border">
                <SelectItem value="all">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>Todos os colaboradores</span>
                  </div>
                </SelectItem>
                {members.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={member.avatar_url} />
                        <AvatarFallback className="text-[10px] bg-primary/10">
                          {getInitials(member.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span>{member.full_name}</span>
                      {member.role && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({member.role === 'owner' ? 'Dono' : member.role === 'admin' ? 'Admin' : 'Membro'})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* Mostrar loading enquanto permissões carregam */}
          {permissions.loading && (
            <div className="w-[250px] h-10 bg-muted/50 rounded-md animate-pulse" />
          )}

          {/* Seletor de Período */}
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
      </div>

      {/* Card de Métricas do Colaborador Selecionado */}
      {selectedCollaborator && selectedMember && selectedMetrics && (
        <CollaboratorMetrics
          collaborator={selectedMember}
          metrics={selectedMetrics}
          isLoading={isLoading}
        />
      )}

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
