import { MetricCard } from "@/components/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, FileText, CheckSquare, List, AlertCircle, Pencil, CheckCircle, XCircle, Target, Package, MessageSquare, Globe, User, Facebook, Calendar, Clock, ExternalLink, Trophy, ArrowRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, PieChart, Pie, Cell, BarChart, Bar, Rectangle } from "recharts";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import goalEmptyState from "@/assets/goal-empty-state.png";
import topSellersEmptyState from "@/assets/top-sellers-empty.gif";

interface LastContribution {
  leadId: string;
  collaboratorName: string;
  collaboratorAvatar?: string;
  saleValue: number;
  saleDate: Date;
  leadCreatedAt: Date;
  daysToSale: number;
  leadName: string;
  leadSource: string;
  productName?: string;
  leadEmail?: string;
  leadPhone?: string;
  leadDescription?: string;
}

// Helper para ícone da fonte
const getSourceIcon = (source: string) => {
  const lowerSource = source?.toLowerCase() || '';
  if (lowerSource.includes('whatsapp')) {
    return <MessageSquare className="w-3 h-3 text-green-600" />;
  }
  if (lowerSource.includes('facebook')) {
    return <Facebook className="w-3 h-3 text-blue-600" />;
  }
  if (lowerSource.includes('webhook') || lowerSource.includes('url')) {
    return <Globe className="w-3 h-3 text-purple-600" />;
  }
  return <User className="w-3 h-3 text-muted-foreground" />;
};

// Helper para label da fonte
const getSourceLabel = (source: string) => {
  const lowerSource = source?.toLowerCase() || '';
  if (lowerSource.includes('whatsapp')) return 'WhatsApp';
  if (lowerSource.includes('facebook')) return 'Facebook';
  if (lowerSource.includes('webhook') || lowerSource.includes('url')) return 'Webhook';
  return 'Manual';
};
// Interfaces
interface TopSeller {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  won_leads: number;
  total_revenue: number;
}

interface ConversionDataPoint {
  month: string;
  rate: number;
}

// Função para calcular a cor da barra baseada no valor (dinâmico)
const getBarColor = (value: number, data: ConversionDataPoint[]) => {
  const rates = data.map(d => d.rate);
  const minRate = Math.min(...rates, 0);
  const maxRate = Math.max(...rates, 1);
  const range = maxRate - minRate || 1;
  const normalized = Math.max(0, Math.min(1, (value - minRate) / range));
  
  // Verde escuro (#006928) para valores baixos
  // Verde claro/brilhante (#00ff6a) para valores altos
  const darkGreen = { r: 0, g: 105, b: 40 };
  const brightGreen = { r: 0, g: 255, b: 106 };
  
  const r = Math.round(darkGreen.r + (brightGreen.r - darkGreen.r) * normalized);
  const g = Math.round(darkGreen.g + (brightGreen.g - darkGreen.g) * normalized);
  const b = Math.round(darkGreen.b + (brightGreen.b - darkGreen.b) * normalized);
  
  return `rgb(${r}, ${g}, ${b})`;
};
const Dashboard = () => {
  const {
    user
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [currentValue, setCurrentValue] = useState(7580);
  const [totalValue, setTotalValue] = useState(8000);
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [editTotalValue, setEditTotalValue] = useState(totalValue.toString());
  const [editDeadline, setEditDeadline] = useState<string>("");
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [lastContribution, setLastContribution] = useState<LastContribution | null>(null);
  const [contributionKey, setContributionKey] = useState(0);
  const [isContributionDetailOpen, setIsContributionDetailOpen] = useState(false);
  const [salesBeforeDeadline, setSalesBeforeDeadline] = useState(0);
  const [salesAfterDeadline, setSalesAfterDeadline] = useState(0);
  const [goalDurationDays, setGoalDurationDays] = useState(0);
  const [goalCreatedAt, setGoalCreatedAt] = useState<Date | null>(null);
  const navigate = useNavigate();

  // Métricas reais do banco de dados
  const [newLeadsCount, setNewLeadsCount] = useState(0);
  const [newCustomersCount, setNewCustomersCount] = useState(0);
  const [currentTasksCount, setCurrentTasksCount] = useState(0);
  const [overdueTasksCount, setOverdueTasksCount] = useState(0);
  const [lossRate, setLossRate] = useState(0);

  // Taxa de Conversão real
  const [conversionData, setConversionData] = useState<ConversionDataPoint[]>([]);
  const [currentConversionRate, setCurrentConversionRate] = useState(0);
  const [conversionTrend, setConversionTrend] = useState(0);

  // Top 5 Vendedores
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [topSellersLoading, setTopSellersLoading] = useState(true);
  
  // Função para carregar todas as métricas
  const loadMetrics = async () => {
    try {
      if (!user) return;

      // Buscar organization_id do usuário
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!orgMember) return;

      const organizationId = orgMember.organization_id;
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const today = now.toISOString().split('T')[0];

      // Buscar todas as métricas em paralelo
      const [
        leadsResult,
        wonStagesResult,
        boardResult
      ] = await Promise.all([
        // Novos leads do mês
        supabase
          .from('leads')
          .select('id, funnel_stage_id', { count: 'exact' })
          .eq('organization_id', organizationId)
          .gte('created_at', startOfMonth),
        // Estágios do tipo 'won'
        supabase
          .from('funnel_stages')
          .select('id')
          .eq('stage_type', 'won'),
        // Board da organização para filtrar colunas
        supabase
          .from('kanban_boards')
          .select('id')
          .eq('organization_id', organizationId)
          .maybeSingle()
      ]);

      // Novos Leads
      setNewLeadsCount(leadsResult.count || 0);

      // Novos Clientes (leads em estágios 'won' do mês)
      if (wonStagesResult.data && wonStagesResult.data.length > 0) {
        const wonStageIds = wonStagesResult.data.map(s => s.id);
        const { count: customersCount } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('funnel_stage_id', wonStageIds)
          .gte('updated_at', startOfMonth);
        
        setNewCustomersCount(customersCount || 0);
      }

      // Métricas de Kanban - só se tiver board
      if (boardResult.data) {
        const boardId = boardResult.data.id;

        // Buscar colunas do board
        const { data: columns } = await supabase
          .from('kanban_columns')
          .select('id, position')
          .eq('board_id', boardId)
          .order('position', { ascending: true });

        if (columns && columns.length > 0) {
          // Identificar coluna "Concluído" (última posição)
          const completedColumnId = columns[columns.length - 1].id;
          const activeColumnIds = columns.slice(0, -1).map(c => c.id);

          // Buscar todas as cards em paralelo
          const [
            currentTasksResult,
            overdueTasksResult
          ] = await Promise.all([
            // Tarefas atuais (não concluídas)
            supabase
              .from('kanban_cards')
              .select('id', { count: 'exact', head: true })
              .in('column_id', activeColumnIds),
            // Tarefas atrasadas (due_date < hoje e não concluídas)
            supabase
              .from('kanban_cards')
              .select('id', { count: 'exact', head: true })
              .in('column_id', activeColumnIds)
              .lt('due_date', today)
          ]);

          setCurrentTasksCount(currentTasksResult.count || 0);
          setOverdueTasksCount(overdueTasksResult.count || 0);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    }
  };

  // Função para carregar taxa de conversão real - OTIMIZADA com queries paralelas
  const loadConversionData = async () => {
    try {
      if (!user) return;

      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!orgMember) return;

      // Preparar datas dos últimos 6 meses
      const now = new Date();
      const monthRanges = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const nextMonthDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        monthRanges.push({
          start: monthDate.toISOString(),
          end: nextMonthDate.toISOString(),
          name: monthName.charAt(0).toUpperCase() + monthName.slice(1)
        });
      }

      // Buscar estágios won e todos os leads dos últimos 6 meses em paralelo
      const sixMonthsAgo = monthRanges[0].start;
      
      const [wonStagesResult, allLeadsResult] = await Promise.all([
        supabase
          .from('funnel_stages')
          .select('id')
          .eq('stage_type', 'won'),
        supabase
          .from('leads')
          .select('id, created_at, updated_at, funnel_stage_id')
          .eq('organization_id', orgMember.organization_id)
          .gte('created_at', sixMonthsAgo)
      ]);

      const wonStageIds = new Set(wonStagesResult.data?.map(s => s.id) || []);
      const allLeads = allLeadsResult.data || [];

      // Processar dados localmente em vez de múltiplas queries
      const months: ConversionDataPoint[] = monthRanges.map(range => {
        const leadsInMonth = allLeads.filter(lead => 
          lead.created_at >= range.start && lead.created_at < range.end
        );
        
        const convertedInMonth = allLeads.filter(lead => 
          lead.funnel_stage_id && 
          wonStageIds.has(lead.funnel_stage_id) &&
          lead.updated_at >= range.start && 
          lead.updated_at < range.end
        );

        const totalLeads = leadsInMonth.length;
        const convertedLeads = convertedInMonth.length;
        const rate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

        return {
          month: range.name,
          rate: parseFloat(rate.toFixed(1))
        };
      });

      setConversionData(months);

      // Taxa atual (último mês)
      if (months.length > 0) {
        const currentRate = months[months.length - 1].rate;
        setCurrentConversionRate(currentRate);

        // Tendência (comparar com mês anterior)
        if (months.length > 1) {
          const previousRate = months[months.length - 2].rate;
          setConversionTrend(parseFloat((currentRate - previousRate).toFixed(1)));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar taxa de conversão:', error);
    }
  };

  // Função para carregar Top 5 Vendedores
  const loadTopSellers = async () => {
    try {
      setTopSellersLoading(true);
      if (!user) return;

      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!orgMember) return;

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Buscar membros, perfis e estágios won em paralelo
      const [membersResult, wonStagesResult] = await Promise.all([
        supabase.rpc('get_organization_members_masked'),
        supabase
          .from('funnel_stages')
          .select('id')
          .eq('stage_type', 'won')
      ]);

      const members = membersResult.data || [];
      const wonStageIds = wonStagesResult.data?.map(s => s.id) || [];

      if (wonStageIds.length === 0 || members.length === 0) {
        setTopSellers([]);
        return;
      }

      // Buscar perfis dos membros
      const memberUserIds = members.filter(m => m.user_id).map(m => m.user_id);
      
      const [profilesResult, wonLeadsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, full_name, avatar_url')
          .in('user_id', memberUserIds),
        supabase
          .from('leads')
          .select('responsavel_user_id, valor')
          .eq('organization_id', orgMember.organization_id)
          .in('funnel_stage_id', wonStageIds)
          .gte('updated_at', startOfMonth)
      ]);

      const profiles = profilesResult.data || [];
      const wonLeads = wonLeadsResult.data || [];

      // Agrupar vendas por colaborador
      const salesByUser: Record<string, { won_leads: number; total_revenue: number }> = {};
      
      wonLeads.forEach(lead => {
        if (lead.responsavel_user_id) {
          if (!salesByUser[lead.responsavel_user_id]) {
            salesByUser[lead.responsavel_user_id] = { won_leads: 0, total_revenue: 0 };
          }
          salesByUser[lead.responsavel_user_id].won_leads++;
          salesByUser[lead.responsavel_user_id].total_revenue += lead.valor || 0;
        }
      });

      // Montar lista de top sellers (apenas quem tem pelo menos 1 venda)
      const sellers: TopSeller[] = memberUserIds
        .filter(userId => salesByUser[userId]?.won_leads > 0)
        .map(userId => {
          const profile = profiles.find(p => p.user_id === userId);
          const sales = salesByUser[userId];
          return {
            user_id: userId,
            full_name: profile?.full_name || 'Colaborador',
            avatar_url: profile?.avatar_url || null,
            won_leads: sales.won_leads,
            total_revenue: sales.total_revenue
          };
        })
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 5);

      setTopSellers(sellers);
    } catch (error) {
      console.error('Erro ao carregar top vendedores:', error);
    } finally {
      setTopSellersLoading(false);
    }
  };

  // Função para calcular Taxa de Perda de Vendas
  const loadLossRate = async () => {
    try {
      if (!user) return;

      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!orgMember) return;

      // Buscar estágios do tipo 'lost'
      const { data: lostStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'lost');

      const lostStageIds = lostStages?.map(s => s.id) || [];

      // Contar total de leads e leads perdidos em paralelo
      const [totalResult, lostResult] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgMember.organization_id),
        lostStageIds.length > 0
          ? supabase
              .from('leads')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', orgMember.organization_id)
              .in('funnel_stage_id', lostStageIds)
          : Promise.resolve({ count: 0 })
      ]);

      const totalLeads = totalResult.count || 0;
      const lostLeads = lostResult.count || 0;

      // Calcular taxa de perda
      const rate = totalLeads > 0 ? (lostLeads / totalLeads) * 100 : 0;
      setLossRate(parseFloat(rate.toFixed(1)));
    } catch (error) {
      console.error('Erro ao calcular taxa de perda:', error);
    }
  };

  useEffect(() => {
    loadGoal();
    loadLastContribution();
    loadMetrics();
    loadConversionData();
    loadTopSellers();
    loadLossRate();

    // Real-time subscription para atualizar métricas
    const leadsChannel = supabase
      .channel('dashboard-leads-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads'
        },
        () => {
          loadLastContribution();
          loadSalesTotal();
          loadMetrics();
          loadConversionData();
          loadTopSellers();
          loadLossRate();
        }
      )
      .subscribe();

    const kanbanChannel = supabase
      .channel('dashboard-kanban-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'kanban_cards'
        },
        () => {
          loadMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(kanbanChannel);
    };
  }, [user]);

  const loadLastContribution = async () => {
    try {
      if (!user) return;

      // Buscar organization_id do usuário
      const { data: orgMember, error: orgError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (orgError || !orgMember) return;

      // Buscar último lead ganho (won)
      const { data: wonLeads, error: leadsError } = await supabase
        .from('leads')
        .select(`
          id,
          nome_lead,
          valor,
          responsavel,
          responsavel_user_id,
          updated_at,
          created_at,
          funnel_stage_id,
          source,
          email,
          telefone_lead,
          descricao_negocio
        `)
        .eq('organization_id', orgMember.organization_id)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (leadsError || !wonLeads || wonLeads.length === 0) return;

      // Buscar estágios do tipo 'won' para filtrar
      const { data: wonStages, error: stagesError } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');

      if (stagesError || !wonStages) return;

      const wonStageIds = wonStages.map(s => s.id);
      const lastWonLead = wonLeads.find(lead => 
        lead.funnel_stage_id && wonStageIds.includes(lead.funnel_stage_id)
      );

      if (!lastWonLead) return;

      // Buscar dados do colaborador responsável - ATUALIZADO: usar UUID
      let collaboratorName = 'Não atribuído';
      let collaboratorAvatar: string | undefined;

      if (lastWonLead.responsavel_user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('user_id', lastWonLead.responsavel_user_id)
          .single();

        if (profile) {
          collaboratorName = profile.full_name || 'Colaborador';
          collaboratorAvatar = profile.avatar_url || undefined;
        }
      } else if (lastWonLead.responsavel) {
        // Fallback para TEXT (dados antigos)
        collaboratorName = lastWonLead.responsavel;
      }

      // Buscar produtos associados ao lead
      let productName: string | undefined;
      const { data: leadItems } = await supabase
        .from('lead_items')
        .select(`
          items (name)
        `)
        .eq('lead_id', lastWonLead.id)
        .limit(1);

      if (leadItems && leadItems.length > 0 && leadItems[0].items) {
        productName = (leadItems[0].items as any).name;
      }

      // Calcular dias até a venda
      const saleDate = new Date(lastWonLead.updated_at);
      const leadCreatedAt = new Date(lastWonLead.created_at);
      const daysToSale = Math.max(0, Math.floor(
        (saleDate.getTime() - leadCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
      ));

      const newContribution: LastContribution = {
        leadId: lastWonLead.id,
        collaboratorName,
        collaboratorAvatar,
        saleValue: lastWonLead.valor || 0,
        saleDate,
        leadCreatedAt,
        daysToSale,
        leadName: lastWonLead.nome_lead,
        leadSource: lastWonLead.source || 'Manual',
        productName,
        leadEmail: lastWonLead.email || undefined,
        leadPhone: lastWonLead.telefone_lead || undefined,
        leadDescription: lastWonLead.descricao_negocio || undefined
      };

      // Verificar se é uma nova contribuição para animar
      if (!lastContribution || lastContribution.leadName !== newContribution.leadName || 
          lastContribution.saleDate.getTime() !== newContribution.saleDate.getTime()) {
        setContributionKey(prev => prev + 1);
      }
      
      setLastContribution(newContribution);
    } catch (error) {
      console.error('Erro ao carregar última contribuição:', error);
    }
  };
  // Função para calcular total de vendas do período
  const loadSalesTotal = async (deadlineParam?: Date | null, goalCreatedParam?: Date | null) => {
    try {
      if (!user) return;

      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!orgMember) return;

      // Buscar estágios do tipo 'won'
      const { data: wonStages } = await supabase
        .from('funnel_stages')
        .select('id')
        .eq('stage_type', 'won');

      if (!wonStages || wonStages.length === 0) {
        setCurrentValue(0);
        setSalesBeforeDeadline(0);
        setSalesAfterDeadline(0);
        return;
      }

      const wonStageIds = wonStages.map(s => s.id);

      // Usar parâmetro se fornecido, senão usar estado
      const effectiveDeadline = deadlineParam !== undefined ? deadlineParam : deadline;
      const effectiveGoalCreated = goalCreatedParam || goalCreatedAt;

      // Calcular período baseado no deadline
      let startDate: string;
      const now = new Date();
      
      if (effectiveGoalCreated) {
        startDate = effectiveGoalCreated.toISOString();
      } else if (effectiveDeadline) {
        const deadlineDate = new Date(effectiveDeadline);
        if (deadlineDate < now) {
          startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        } else {
          startDate = new Date(deadlineDate.getFullYear(), deadlineDate.getMonth(), 1).toISOString();
        }
      } else {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      }

      // Buscar todas as vendas desde a criação da meta
      const { data: wonLeads, error } = await supabase
        .from('leads')
        .select('valor, updated_at, funnel_stage_id')
        .eq('organization_id', orgMember.organization_id)
        .in('funnel_stage_id', wonStageIds)
        .gte('updated_at', startDate);

      if (error) {
        console.error('Erro ao buscar vendas:', error);
        return;
      }

      // Somar valores das vendas
      const totalSales = wonLeads?.reduce((sum, lead) => sum + (lead.valor || 0), 0) || 0;
      setCurrentValue(totalSales);

      // Separar vendas antes e depois do prazo
      if (effectiveDeadline && wonLeads) {
        const deadlineDate = new Date(effectiveDeadline);
        
        const beforeDeadline = wonLeads.filter(lead => 
          new Date(lead.updated_at) <= deadlineDate
        );
        const salesBefore = beforeDeadline.reduce((sum, lead) => sum + (lead.valor || 0), 0);
        setSalesBeforeDeadline(salesBefore);

        const afterDeadline = wonLeads.filter(lead => 
          new Date(lead.updated_at) > deadlineDate
        );
        const salesAfter = afterDeadline.reduce((sum, lead) => sum + (lead.valor || 0), 0);
        setSalesAfterDeadline(salesAfter);
      } else {
        setSalesBeforeDeadline(totalSales);
        setSalesAfterDeadline(0);
      }

      // Atualizar no banco de dados se houver goalId
      if (goalId) {
        await supabase
          .from('goals')
          .update({ current_value: totalSales })
          .eq('id', goalId);
      }
    } catch (error) {
      console.error('Erro ao calcular vendas:', error);
    }
  };

  const loadGoal = async () => {
    try {
      setLoading(true);
      if (!user) {
        setLoading(false);
        return;
      }

      // Buscar organization_id do usuário
      const { data: orgMember, error: orgError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .maybeSingle();
        
      if (orgError || !orgMember) {
        console.error('Erro ao buscar organização:', orgError);
        setLoading(false);
        return;
      }

      // Buscar meta do usuário
      const { data: goals, error } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (error) throw error;
      
      if (goals && goals.length > 0) {
        // Meta encontrada
        const goal = goals[0];
        setGoalId(goal.id);
        setTotalValue(Number(goal.target_value));
        const goalDeadline = goal.deadline ? new Date(goal.deadline) : null;
        const goalCreated = new Date(goal.created_at);
        setDeadline(goalDeadline);
        setGoalCreatedAt(goalCreated);
        
        // Calcular duração da meta em dias
        if (goalDeadline) {
          const durationMs = goalDeadline.getTime() - goalCreated.getTime();
          const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
          setGoalDurationDays(Math.max(0, days));
        }
        
        // Carregar vendas reais passando o deadline diretamente
        await loadSalesTotal(goalDeadline, goalCreated);
      } else {
        // Criar meta padrão com valor 0
        const { data: newGoal, error: createError } = await supabase
          .from('goals')
          .insert({
            user_id: user.id,
            organization_id: orgMember.organization_id,
            current_value: 0,
            target_value: 10000
          })
          .select()
          .single();
          
        if (createError) throw createError;
        
        if (newGoal) {
          setGoalId(newGoal.id);
          setTotalValue(Number(newGoal.target_value));
          const newDeadline = newGoal.deadline ? new Date(newGoal.deadline) : null;
          setDeadline(newDeadline);
          // Carregar vendas do mês atual
          await loadSalesTotal(newDeadline);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar meta:', error);
      toast.error('Erro ao carregar meta');
    } finally {
      setLoading(false);
    }
  };
  
  // Recarregar vendas quando deadline mudar
  useEffect(() => {
    if (goalId && deadline !== undefined) {
      loadSalesTotal();
    }
  }, [deadline, goalId]);
  const percentage = currentValue / totalValue * 100;
  const remaining = totalValue - currentValue;
  const handleEditGoal = () => {
    setEditTotalValue(totalValue.toString());
    setEditDeadline(deadline ? deadline.toISOString().split('T')[0] : "");
    setIsEditGoalOpen(true);
  };
  const handleSaveGoal = async () => {
    const newTotalValue = parseFloat(editTotalValue);
    if (isNaN(newTotalValue)) {
      toast.error("Por favor, insira um valor válido");
      return;
    }
    if (newTotalValue <= 0) {
      toast.error("O valor da meta deve ser maior que zero");
      return;
    }
    if (!editDeadline) {
      toast.error("Por favor, selecione um prazo");
      return;
    }
    try {
      if (!goalId || !user) {
        toast.error("Meta não encontrada");
        return;
      }
      const {
        error
      } = await supabase.from('goals').update({
        target_value: newTotalValue,
        deadline: editDeadline
      }).eq('id', goalId).eq('user_id', user.id);
      if (error) throw error;
      setTotalValue(newTotalValue);
      const newDeadline = new Date(editDeadline);
      setDeadline(newDeadline);
      
      // Recalcular duração da meta
      if (goalCreatedAt) {
        const durationMs = newDeadline.getTime() - goalCreatedAt.getTime();
        const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
        setGoalDurationDays(Math.max(0, days));
      }
      
      setIsEditGoalOpen(false);
      toast.success("Meta atualizada com sucesso!");
    } catch (error) {
      console.error('Erro ao salvar meta:', error);
      toast.error("Erro ao salvar meta");
    }
  };
  const getDaysRemaining = () => {
    if (!deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };
  const isDeadlineFuture = () => {
    if (!editDeadline) return null;
    const selectedDate = new Date(editDeadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    selectedDate.setHours(0, 0, 0, 0);
    return selectedDate >= today;
  };

  // Limitar o gráfico a 100% mesmo se ultrapassar a meta
  const displayValue = Math.min(currentValue, totalValue);
  const displayRemaining = Math.max(0, totalValue - currentValue);
  const goalData = [{
    name: "Atingido",
    value: displayValue,
    fill: "url(#goalGradient)"
  }, {
    name: "Restante",
    value: displayRemaining,
    fill: "hsl(0, 0%, 90%)"
  }];
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingAnimation text="Carregando dashboard..." />
      </div>
    );
  }
  return <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title="Novos Leads" value={newLeadsCount} icon={TrendingUp} iconColor="text-cyan-500" />
        <MetricCard title="Novos Clientes" value={newCustomersCount} icon={Users} iconColor="text-green-500" />
        <MetricCard title="Tarefas Atuais" value={currentTasksCount} icon={CheckSquare} iconColor="text-purple-500" />
        <MetricCard title="Tarefas Atrasadas" value={overdueTasksCount} icon={AlertCircle} iconColor="text-red-500" />
        <MetricCard title="Taxa de Perda" value={`${lossRate}%`} icon={XCircle} iconColor="text-rose-500" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3 relative">
            <div className="flex items-center justify-between w-full">
              <CardTitle className="text-lg font-semibold">Metas</CardTitle>
              <button onClick={handleEditGoal} className="p-2 hover:bg-accent rounded-md transition-colors">
                <Pencil className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
              </button>
            </div>
            {deadline && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none">
                  <style>{`@keyframes rotate{0%{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
                  <rect width="16" height="16" x="4" y="4" stroke="currentColor" strokeWidth="1.5" rx="8" className="text-muted-foreground" />
                  <path stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" d="M12.021 12l2.325 2.325" className="text-muted-foreground" />
                  <path stroke="hsl(var(--primary))" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12.021 12V6.84" style={{
                animation: 'rotate 2s linear infinite both',
                transformOrigin: 'center'
              }} />
                </svg>
              </div>}
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pb-6 pt-2">
            {!deadline ? (
              // Estado vazio - sem meta definida
              <div className="flex flex-col items-center justify-center py-6 space-y-4 w-full">
                <img 
                  src={goalEmptyState} 
                  alt="Criar meta" 
                  className="w-32 h-32 object-contain opacity-80"
                />
                <div className="text-center">
                  <p className="text-lg font-semibold text-foreground">Crie uma meta agora</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Defina um objetivo e prazo para acompanhar seu progresso
                  </p>
                </div>
                <Button 
                  onClick={handleEditGoal}
                  className="mt-2"
                >
                  <Target className="w-4 h-4 mr-2" />
                  Criar Meta
                </Button>
                
                {/* Última Contribuição - também no estado vazio */}
                {lastContribution && (
                  <div 
                    key={contributionKey}
                    className="mt-4 pt-3 border-t border-border w-full animate-fade-in"
                  >
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Última contribuição
                    </p>
                    <div 
                      onClick={() => setIsContributionDetailOpen(true)}
                      className="bg-muted/50 rounded-md p-2 space-y-1 transition-all duration-200 cursor-pointer hover:bg-muted hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-primary/20"
                    >
                      {/* Linha 1: Avatar + Nome + Dias até venda */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={lastContribution.collaboratorAvatar} />
                          <AvatarFallback className="text-[10px]">{lastContribution.collaboratorName[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{lastContribution.collaboratorName}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground text-xs">
                          <span className="font-medium">Dias até a venda:</span>{' '}
                          {lastContribution.daysToSale === 0 
                            ? 'mesmo dia' 
                            : `${lastContribution.daysToSale} ${lastContribution.daysToSale === 1 ? 'dia' : 'dias'}`}
                        </span>
                      </div>
                      
                      {/* Linha 2: Valor + Lead + Fonte + Produto */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        <span>
                          <span className="font-medium">Valor:</span>{' '}
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            R$ {lastContribution.saleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span>•</span>
                        <span><span className="font-medium">Lead:</span> {lastContribution.leadName}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <span className="font-medium">Fonte:</span> {getSourceIcon(lastContribution.leadSource)}
                        </span>
                        {lastContribution.productName && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                              <Package className="w-3 h-3" />
                              {lastContribution.productName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Meta definida - exibir gráfico e métricas
              <>
                <div className="text-center -mb-8">
                  <p className="text-sm text-muted-foreground">Prazo para bater a meta</p>
                  <p className="text-2xl font-bold">
                    {getDaysRemaining() !== null && getDaysRemaining()! > 0 ? `${getDaysRemaining()} dias restantes` : getDaysRemaining() === 0 ? "Hoje é o prazo!" : "Prazo expirado"}
                  </p>
                </div>
                <div className="relative w-full max-w-[400px] h-[220px]">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <defs>
                        <linearGradient id="goalGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#00aaff" />
                          <stop offset="100%" stopColor="#00ff00" />
                        </linearGradient>
                      </defs>
                      <Pie data={goalData} cx="50%" cy="85%" startAngle={180} endAngle={0} innerRadius={90} outerRadius={110} paddingAngle={0} dataKey="value" strokeWidth={0} cornerRadius={10}>
                        {goalData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  
                  {/* Valor central - posicionado abaixo do arco */}
                  <div className="absolute inset-x-0 bottom-8 flex flex-col items-center">
                    <p className="text-sm sm:text-base font-bold text-center leading-tight">
                      R$ {currentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
                      de R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground">{percentage.toFixed(0)}% concluído</p>
                  </div>
                </div>
                
                {/* Métricas de período - layout horizontal sutil */}
                <div className="flex items-center justify-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                  {/* Vendido até o prazo - Verde com Tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 cursor-help">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0"></span>
                        <span className="text-green-600 dark:text-green-400 font-medium">
                          R$ {salesBeforeDeadline.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total vendido dentro do prazo da meta</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Separador */}
                  <span className="text-muted-foreground/50">•</span>
                  
                  {/* Duração da meta com Tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-muted-foreground cursor-help">
                        {goalDurationDays} dias
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Duração total da meta em dias</p>
                    </TooltipContent>
                  </Tooltip>
                  
                  {/* Separador */}
                  <span className="text-muted-foreground/50">•</span>
                  
                  {/* Vendido após o prazo - Laranja com Tooltip */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex items-center gap-1 cursor-help">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"></span>
                        <span className="text-orange-500 font-medium">
                          R$ {salesAfterDeadline.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Total vendido após o prazo da meta</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                
                {/* Última Contribuição - na branch com meta */}
                {lastContribution && (
                  <div 
                    key={contributionKey}
                    className="mt-2 pt-3 border-t border-border w-full animate-fade-in"
                  >
                    <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> Última contribuição
                    </p>
                    <div 
                      onClick={() => setIsContributionDetailOpen(true)}
                      className="bg-muted/50 rounded-md p-2 space-y-1 transition-all duration-200 cursor-pointer hover:bg-muted hover:shadow-md hover:scale-[1.02] border border-transparent hover:border-primary/20"
                    >
                      {/* Linha 1: Avatar + Nome + Dias até venda */}
                      <div className="flex items-center gap-1.5 text-sm">
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={lastContribution.collaboratorAvatar} />
                          <AvatarFallback className="text-[10px]">{lastContribution.collaboratorName[0]?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{lastContribution.collaboratorName}</span>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground text-xs">
                          <span className="font-medium">Dias até a venda:</span>{' '}
                          {lastContribution.daysToSale === 0 
                            ? 'mesmo dia' 
                            : `${lastContribution.daysToSale} ${lastContribution.daysToSale === 1 ? 'dia' : 'dias'}`}
                        </span>
                      </div>
                      
                      {/* Linha 2: Valor + Lead + Fonte + Produto */}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        <span>
                          <span className="font-medium">Valor:</span>{' '}
                          <span className="text-green-600 dark:text-green-400 font-semibold">
                            R$ {lastContribution.saleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </span>
                        <span>•</span>
                        <span><span className="font-medium">Lead:</span> {lastContribution.leadName}</span>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          <span className="font-medium">Fonte:</span> {getSourceIcon(lastContribution.leadSource)}
                        </span>
                        {lastContribution.productName && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-0.5">
                              <Package className="w-3 h-3" />
                              {lastContribution.productName}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Dialog de Detalhes da Última Contribuição */}
            <Dialog open={isContributionDetailOpen} onOpenChange={setIsContributionDetailOpen}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Detalhes da Venda
                  </DialogTitle>
                </DialogHeader>
                
                {lastContribution && (
                  <div className="space-y-4">
                    {/* Informações do Colaborador */}
                    <div className="flex items-center gap-3 pb-4 border-b">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={lastContribution.collaboratorAvatar} />
                        <AvatarFallback>{lastContribution.collaboratorName[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-semibold">{lastContribution.collaboratorName}</p>
                        <p className="text-sm text-muted-foreground">Responsável pela venda</p>
                      </div>
                    </div>
                    
                    {/* Grid de informações */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Valor da Venda</p>
                        <p className="text-lg font-bold text-green-600">
                          R$ {lastContribution.saleValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tempo até Venda</p>
                        <p className="text-lg font-semibold">
                          {lastContribution.daysToSale === 0 ? 'Mesmo dia' : `${lastContribution.daysToSale} dias`}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Lead</p>
                        <p className="font-medium">{lastContribution.leadName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Fonte</p>
                        <div className="flex items-center gap-1.5">
                          {getSourceIcon(lastContribution.leadSource)}
                          <span className="font-medium">{getSourceLabel(lastContribution.leadSource)}</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> Data da Venda
                        </p>
                        <p className="font-medium">
                          {format(lastContribution.saleDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Entrada no CRM
                        </p>
                        <p className="font-medium">
                          {format(lastContribution.leadCreatedAt, "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    
                    {/* Produto (se houver) */}
                    {lastContribution.productName && (
                      <div className="pt-4 border-t">
                        <p className="text-xs text-muted-foreground">Produto</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Package className="w-4 h-4" />
                          <span className="font-medium">{lastContribution.productName}</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Botão para ver mais detalhes do lead */}
                    <div className="pt-4 flex justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setIsContributionDetailOpen(false);
                          navigate(`/leads/${lastContribution.leadId}`);
                        }}
                        className="flex items-center gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver Lead Completo
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Taxa de Conversão</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg" style={{
                backgroundColor: 'rgba(0, 179, 76, 0.1)'
              }}>
                  <Target className="w-8 h-8" style={{
                  color: '#00b34c'
                }} />
                </div>
                <div>
                  <p className="text-4xl font-bold" style={{
                  color: '#00b34c'
                }}>{currentConversionRate}%</p>
                  <p className="text-xs text-muted-foreground">Leads → Clientes</p>
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded" style={{
              backgroundColor: conversionTrend >= 0 ? 'rgba(0, 179, 76, 0.1)' : 'rgba(239, 68, 68, 0.1)'
            }}>
                <TrendingUp className={`w-3 h-3 ${conversionTrend < 0 ? 'rotate-180' : ''}`} style={{
                color: conversionTrend >= 0 ? '#00b34c' : '#ef4444'
              }} />
                <span className="text-xs font-medium" style={{
                color: conversionTrend >= 0 ? '#00b34c' : '#ef4444'
              }}>{conversionTrend >= 0 ? '+' : ''}{conversionTrend}%</span>
              </div>
            </div>
            
            <div>
              <p className="text-xs text-muted-foreground mb-2">Evolução (últimos 6 meses)</p>
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={conversionData} className="rounded-sm shadow px-0 py-0 pr-0 mx-0 mr-0 mb-0 mt-[100px]">
                  <defs>
                    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  <Bar 
                    dataKey="rate" 
                    radius={[4, 4, 0, 0]}
                    cursor="default"
                    onMouseEnter={(data, index) => {
                      setHoveredBarIndex(index);
                    }}
                    onMouseLeave={() => {
                      setHoveredBarIndex(null);
                    }}
                    activeBar={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      const centerX = x + width / 2;
                      const newWidth = width * 1.1;
                      const newHeight = height * 1.05;
                      const newX = centerX - newWidth / 2;
                      const newY = y - (newHeight - height);
                      
                      return (
                        <Rectangle
                          x={newX}
                          y={newY}
                          width={newWidth}
                          height={newHeight}
                          fill={getBarColor(payload.rate, conversionData)}
                          radius={[4, 4, 0, 0]}
                          filter="url(#glow)"
                          style={{ transition: 'all 0.2s ease' }}
                        />
                      );
                    }}
                    shape={(props: any) => {
                      const { x, y, width, height, payload, index } = props;
                      const isOtherBarHovered = hoveredBarIndex !== null && hoveredBarIndex !== index;
                      const opacity = isOtherBarHovered ? 0.3 : 1;
                      
                      return (
                        <Rectangle
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={getBarColor(payload.rate, conversionData)}
                          radius={[4, 4, 0, 0]}
                          opacity={opacity}
                          style={{ transition: 'opacity 0.2s ease' }}
                        />
                      );
                    }}
                  />
                  <XAxis dataKey="month" tick={{
                  fill: 'hsl(var(--muted-foreground))',
                  fontSize: 10
                }} axisLine={false} tickLine={false} />
                  <RechartsTooltip 
                    cursor={{ fill: 'transparent' }}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                    }} 
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const currentRate = payload[0].value as number;
                        const currentIndex = conversionData.findIndex(d => d.rate === currentRate);
                        const currentMonth = conversionData[currentIndex]?.month;
                        const previousRate = currentIndex > 0 ? conversionData[currentIndex - 1].rate : null;
                        const difference = previousRate ? currentRate - previousRate : null;
                        const percentChange = previousRate ? ((difference! / previousRate) * 100) : null;
                        
                        // Calcular média móvel dos últimos 3 meses
                        const startIndex = Math.max(0, currentIndex - 2);
                        const movingAverageData = conversionData.slice(startIndex, currentIndex + 1);
                        const movingAverage = movingAverageData.reduce((sum, d) => sum + d.rate, 0) / movingAverageData.length;
                        
                        // Calcular tendência (comparar com média)
                        const trend = currentRate - movingAverage;
                        const trendPercent = (trend / movingAverage) * 100;
                        
                        return (
                          <div style={{
                            backgroundColor: 'hsl(var(--popover))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            padding: '12px 14px',
                            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                            minWidth: '200px'
                          }}>
                            {/* Cabeçalho */}
                            <div style={{ borderBottom: '1px solid hsl(var(--border))', paddingBottom: '8px', marginBottom: '8px' }}>
                              <p style={{ margin: 0, fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {currentMonth}
                              </p>
                              <p style={{ margin: '2px 0 0 0', fontWeight: 700, fontSize: '20px', color: '#00b34c' }}>
                                {currentRate}%
                              </p>
                              <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                                Taxa de Conversão
                              </p>
                            </div>
                            
                            {/* Comparação com mês anterior */}
                            {difference !== null && (
                              <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid hsl(var(--border))' }}>
                                <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                  vs. Mês Anterior
                                </p>
                                <p style={{ 
                                  margin: 0, 
                                  fontSize: '13px',
                                  color: difference >= 0 ? '#00b34c' : '#ef4444',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  {difference >= 0 ? '↗' : '↘'} {difference >= 0 ? '+' : ''}{difference.toFixed(1)}% 
                                  <span style={{ opacity: 0.7, fontSize: '11px', fontWeight: 400 }}>
                                    ({percentChange! >= 0 ? '+' : ''}{percentChange!.toFixed(1)}%)
                                  </span>
                                </p>
                              </div>
                            )}
                            
                            {/* Média Móvel (3 meses) */}
                            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid hsl(var(--border))' }}>
                              <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Média Móvel (3 meses)
                              </p>
                              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' }}>
                                {movingAverage.toFixed(2)}%
                              </p>
                            </div>
                            
                            {/* Tendência */}
                            <div>
                              <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Tendência
                              </p>
                              <p style={{ 
                                margin: 0, 
                                fontSize: '13px',
                                color: trend >= 0 ? '#00b34c' : '#ef4444',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}>
                                {trend >= 0 ? '📈' : '📉'} {trend >= 0 ? 'Acima' : 'Abaixo'} da média
                                <span style={{ opacity: 0.7, fontSize: '11px', fontWeight: 400 }}>
                                  ({trendPercent >= 0 ? '+' : ''}{trendPercent.toFixed(1)}%)
                                </span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <CardTitle className="text-lg font-semibold">Top 5 Vendedores</CardTitle>
              </div>
              {topSellers.length > 0 && (
                <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  {topSellers.reduce((sum, s) => sum + s.won_leads, 0)} vendas
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {topSellersLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-4 w-24 mb-1" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : topSellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <img 
                  src={topSellersEmptyState} 
                  alt="Nenhuma venda" 
                  className="w-24 h-24 mb-3"
                />
                <p className="text-sm text-muted-foreground">Nenhuma venda este mês</p>
                <p className="text-xs text-muted-foreground mt-1">Os melhores vendedores aparecerão aqui</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSellers.map((seller, index) => {
                  const maxRevenue = topSellers[0]?.total_revenue || 1;
                  const percentage = (seller.total_revenue / maxRevenue) * 100;
                  
                  const positionColors = [
                    'bg-yellow-500 text-yellow-950',
                    'bg-gray-400 text-gray-950',
                    'bg-amber-600 text-amber-950',
                    'bg-muted text-muted-foreground',
                    'bg-muted text-muted-foreground'
                  ];
                  
                  return (
                    <div 
                      key={seller.user_id}
                      className="group"
                    >
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full shrink-0 ${positionColors[index]}`}>
                          {index + 1}
                        </span>
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={seller.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-muted">
                            {seller.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{seller.full_name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{seller.won_leads} {seller.won_leads === 1 ? 'venda' : 'vendas'}</span>
                            <span>•</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              R$ {seller.total_revenue.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Progress 
                        value={percentage} 
                        className="h-1.5 ml-8"
                      />
                    </div>
                  );
                })}
                
                <button
                  onClick={() => navigate('/ranking')}
                  className="w-full flex items-center justify-center gap-1 pt-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border"
                >
                  Ver ranking completo <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Editar Meta</DialogTitle>
            <DialogDescription>
              Defina sua meta e o prazo para atingi-la.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="total-value">Meta (R$)</Label>
              <Input id="total-value" type="number" value={editTotalValue} onChange={e => setEditTotalValue(e.target.value)} placeholder="0" step="0.01" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="deadline">Prazo para bater a meta</Label>
              <Input id="deadline" type="date" value={editDeadline} onChange={e => setEditDeadline(e.target.value)} className={editDeadline ? isDeadlineFuture() ? "border-green-500" : "border-red-500" : ""} />
              {editDeadline && <div className={`flex items-center gap-2 text-sm ${isDeadlineFuture() ? "text-green-600" : "text-red-600"}`}>
                  {isDeadlineFuture() ? <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Data futura válida</span>
                    </> : <>
                      <XCircle className="w-4 h-4" />
                      <span>Data no passado - selecione uma data futura</span>
                    </>}
                </div>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditGoalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveGoal} disabled={!editDeadline || !isDeadlineFuture()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
};
export default Dashboard;