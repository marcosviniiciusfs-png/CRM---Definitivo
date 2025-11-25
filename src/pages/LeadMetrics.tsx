import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Users, Facebook, MessageCircle, Target, Trash2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, subDays, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ChartDataPoint {
  date: string;
  count: number;
}

interface MetricsData {
  total: number;
  growthRate: string;
  chartData: ChartDataPoint[];
  lastWeekTotal: number;
  thisWeekTotal: number;
}

interface FacebookAdvancedMetrics {
  mqlConversionRate: number;
  discardRate: number;
  leadsByForm: { formName: string; count: number }[];
}

interface WhatsAppAdvancedMetrics {
  responseRate: number;
  pipelineConversionRate: number;
  avgResponseTimeMinutes: number;
}

const LeadMetrics = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [facebookMetrics, setFacebookMetrics] = useState<MetricsData | null>(null);
  const [whatsappMetrics, setWhatsappMetrics] = useState<MetricsData | null>(null);
  const [facebookAdvanced, setFacebookAdvanced] = useState<FacebookAdvancedMetrics | null>(null);
  const [whatsappAdvanced, setWhatsappAdvanced] = useState<WhatsAppAdvancedMetrics | null>(null);

  useEffect(() => {
    if (user) {
      loadMetrics();
    }
  }, [user]);

  const loadMetrics = async () => {
    try {
      setLoading(true);

      // Buscar organization_id do usuário
      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user!.id)
        .single();

      if (!orgMember) return;

      // Últimos 30 dias
      const thirtyDaysAgo = subDays(new Date(), 30);

      // Buscar leads do Facebook
      const { data: facebookLeads } = await supabase
        .from('leads')
        .select('created_at')
        .eq('organization_id', orgMember.organization_id)
        .eq('source', 'Facebook Leads')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Buscar leads do WhatsApp
      const { data: whatsappLeads } = await supabase
        .from('leads')
        .select('created_at')
        .eq('organization_id', orgMember.organization_id)
        .eq('source', 'WhatsApp')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      // Processar dados do Facebook
      if (facebookLeads) {
        setFacebookMetrics(processMetrics(facebookLeads));
        await loadFacebookAdvancedMetrics(orgMember.organization_id);
      }

      // Processar dados do WhatsApp
      if (whatsappLeads) {
        setWhatsappMetrics(processMetrics(whatsappLeads));
        await loadWhatsAppAdvancedMetrics(orgMember.organization_id);
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFacebookAdvancedMetrics = async (organizationId: string) => {
    try {
      // Buscar todos os leads do Facebook
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, stage')
        .eq('organization_id', organizationId)
        .eq('source', 'Facebook Leads');

      if (!allLeads) return;

      const total = allLeads.length;
      
      // Taxa de Conversão MQL (leads com stage diferente de 'NOVO')
      const qualifiedLeads = allLeads.filter(lead => lead.stage && lead.stage !== 'NOVO');
      const mqlConversionRate = total > 0 ? (qualifiedLeads.length / total) * 100 : 0;

      // Taxa de Descarte (leads com stage 'DESCARTADO' ou 'PERDIDO')
      const discardedLeads = allLeads.filter(lead => 
        lead.stage === 'DESCARTADO' || lead.stage === 'PERDIDO'
      );
      const discardRate = total > 0 ? (discardedLeads.length / total) * 100 : 0;

      // Volume de leads por formulário
      const { data: webhookLogs } = await supabase
        .from('facebook_webhook_logs')
        .select('form_id, lead_id')
        .eq('organization_id', organizationId)
        .not('form_id', 'is', null);

      const formCounts: Record<string, number> = {};
      webhookLogs?.forEach(log => {
        if (log.form_id) {
          formCounts[log.form_id] = (formCounts[log.form_id] || 0) + 1;
        }
      });

      const leadsByForm = Object.entries(formCounts)
        .map(([formName, count]) => ({ 
          formName: formName.substring(0, 20), 
          count 
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      setFacebookAdvanced({
        mqlConversionRate: Number(mqlConversionRate.toFixed(1)),
        discardRate: Number(discardRate.toFixed(1)),
        leadsByForm
      });
    } catch (error) {
      console.error('Erro ao carregar métricas avançadas do Facebook:', error);
    }
  };

  const loadWhatsAppAdvancedMetrics = async (organizationId: string) => {
    try {
      // Buscar todos os leads do WhatsApp nos últimos 30 dias
      const thirtyDaysAgo = subDays(new Date(), 30);
      
      const { data: whatsappLeads } = await supabase
        .from('leads')
        .select('id, stage, created_at')
        .eq('organization_id', organizationId)
        .eq('source', 'WhatsApp')
        .gte('created_at', thirtyDaysAgo.toISOString());

      if (!whatsappLeads) return;

      const total = whatsappLeads.length;

      // Taxa de Resposta Inicial (leads com pelo menos uma mensagem de saída)
      const { data: respondedLeads } = await supabase
        .from('mensagens_chat')
        .select('id_lead')
        .eq('direcao', 'saida')
        .in('id_lead', whatsappLeads.map(l => l.id));

      const uniqueRespondedLeads = new Set(respondedLeads?.map(m => m.id_lead) || []);
      const responseRate = total > 0 ? (uniqueRespondedLeads.size / total) * 100 : 0;

      // Taxa de Conversão para Pipeline (leads com stage diferente de 'NOVO')
      const pipelineLeads = whatsappLeads.filter(lead => lead.stage && lead.stage !== 'NOVO');
      const pipelineConversionRate = total > 0 ? (pipelineLeads.length / total) * 100 : 0;

      // Tempo Médio para Primeira Resposta
      const responseTimes: number[] = [];
      
      for (const lead of whatsappLeads) {
        const { data: firstResponse } = await supabase
          .from('mensagens_chat')
          .select('data_hora')
          .eq('id_lead', lead.id)
          .eq('direcao', 'saida')
          .order('data_hora', { ascending: true })
          .limit(1);

        if (firstResponse && firstResponse.length > 0) {
          const responseTime = differenceInMinutes(
            new Date(firstResponse[0].data_hora),
            new Date(lead.created_at)
          );
          if (responseTime >= 0) {
            responseTimes.push(responseTime);
          }
        }
      }

      const avgResponseTimeMinutes = responseTimes.length > 0
        ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
        : 0;

      setWhatsappAdvanced({
        responseRate: Number(responseRate.toFixed(1)),
        pipelineConversionRate: Number(pipelineConversionRate.toFixed(1)),
        avgResponseTimeMinutes: Number(avgResponseTimeMinutes.toFixed(0))
      });
    } catch (error) {
      console.error('Erro ao carregar métricas avançadas do WhatsApp:', error);
    }
  };

  const processMetrics = (leads: any[]): MetricsData => {
    // Agrupar por dia
    const groupedByDay = leads.reduce((acc, lead) => {
      const date = format(new Date(lead.created_at), 'dd/MMM', { locale: ptBR });
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Criar array de dados para o gráfico (últimos 30 dias)
    const chartData: ChartDataPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dateKey = format(date, 'dd/MMM', { locale: ptBR });
      chartData.push({
        date: dateKey,
        count: groupedByDay[dateKey] || 0
      });
    }

    // Calcular semana atual e anterior
    const sevenDaysAgo = subDays(new Date(), 7);
    const fourteenDaysAgo = subDays(new Date(), 14);

    const thisWeekLeads = leads.filter(lead => 
      new Date(lead.created_at) >= sevenDaysAgo
    );
    
    const lastWeekLeads = leads.filter(lead => {
      const createdAt = new Date(lead.created_at);
      return createdAt >= fourteenDaysAgo && createdAt < sevenDaysAgo;
    });

    const thisWeekTotal = thisWeekLeads.length;
    const lastWeekTotal = lastWeekLeads.length;

    // Calcular taxa de crescimento
    const growthRate = lastWeekTotal > 0
      ? (((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100).toFixed(1)
      : thisWeekTotal > 0 ? '100' : '0';

    return {
      total: leads.length,
      growthRate,
      chartData,
      lastWeekTotal,
      thisWeekTotal
    };
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{payload[0].payload.date}</p>
          <p className="text-sm text-muted-foreground">
            {payload[0].value} leads
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard de Leads</h1>
        <p className="text-muted-foreground mt-2">
          Acompanhe o volume de entrada de leads por canal
        </p>
      </div>

      <Tabs defaultValue="facebook" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="facebook" className="flex items-center gap-2">
            <Facebook className="h-4 w-4" />
            Meta Ads
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facebook" className="space-y-6">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Total de Leads (30 dias)"
                      value={facebookMetrics?.total || 0}
                      icon={Users}
                      iconColor="text-blue-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Contagem total de todos os leads recebidos via Facebook Leads nos últimos 30 dias.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Leads desta Semana"
                      value={facebookMetrics?.thisWeekTotal || 0}
                      icon={TrendingUp}
                      iconColor="text-green-500"
                      trend={{
                        value: `${facebookMetrics?.growthRate || 0}%`,
                        positive: Number(facebookMetrics?.growthRate || 0) >= 0
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos nos últimos 7 dias. A taxa de crescimento compara com a semana anterior: ((Leads esta semana - Leads semana anterior) / Leads semana anterior) × 100</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Leads Semana Anterior"
                      value={facebookMetrics?.lastWeekTotal || 0}
                      icon={Facebook}
                      iconColor="text-blue-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos entre 14 e 7 dias atrás, usado como base de comparação para calcular o crescimento.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Conversão MQL"
                      value={`${facebookAdvanced?.mqlConversionRate || 0}%`}
                      subtitle="Porcentagem de leads que passaram para o primeiro estágio de qualificação"
                      icon={Target}
                      iconColor="text-green-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">(Leads com stage diferente de "NOVO" / Total de Leads) × 100. Indica quantos leads foram qualificados e movidos para etapas do pipeline de vendas.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Descarte"
                      value={`${facebookAdvanced?.discardRate || 0}%`}
                      subtitle="Leads descartados/perdidos"
                      icon={Trash2}
                      iconColor="text-red-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">(Leads com stage "DESCARTADO" ou "PERDIDO" / Total de Leads) × 100. Mede a qualidade dos leads recebidos.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <Card>
            <CardHeader>
              <CardTitle>Tendência de Leads - Meta Ads</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={facebookMetrics?.chartData || []}>
                  <defs>
                    <linearGradient id="facebookGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#facebookGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volume de Leads por Formulário</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={facebookAdvanced?.leadsByForm || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="formName"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Total de Leads (30 dias)"
                      value={whatsappMetrics?.total || 0}
                      icon={Users}
                      iconColor="text-green-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Contagem total de todos os leads recebidos via WhatsApp nos últimos 30 dias.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Leads desta Semana"
                      value={whatsappMetrics?.thisWeekTotal || 0}
                      icon={TrendingUp}
                      iconColor="text-green-500"
                      trend={{
                        value: `${whatsappMetrics?.growthRate || 0}%`,
                        positive: Number(whatsappMetrics?.growthRate || 0) >= 0
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos nos últimos 7 dias. A taxa de crescimento compara com a semana anterior: ((Leads esta semana - Leads semana anterior) / Leads semana anterior) × 100</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Leads Semana Anterior"
                      value={whatsappMetrics?.lastWeekTotal || 0}
                      icon={MessageCircle}
                      iconColor="text-green-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos entre 14 e 7 dias atrás, usado como base de comparação para calcular o crescimento.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Resposta Inicial"
                      value={`${whatsappAdvanced?.responseRate || 0}%`}
                      subtitle="Conversas respondidas pelo agente"
                      icon={MessageCircle}
                      iconColor="text-blue-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">(Leads que receberam pelo menos uma mensagem de saída / Total de Leads) × 100. Mede o engajamento da equipe com novos leads.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Conversão p/ Pipeline"
                      value={`${whatsappAdvanced?.pipelineConversionRate || 0}%`}
                      subtitle="Leads movidos para vendas"
                      icon={Target}
                      iconColor="text-purple-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">(Leads com stage diferente de "NOVO" / Total de Leads) × 100. Indica quantos leads do WhatsApp foram qualificados e movidos para o pipeline de vendas.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Tempo Médio de Resposta"
                      value={`${whatsappAdvanced?.avgResponseTimeMinutes || 0}min`}
                      subtitle="Primeira resposta do agente"
                      icon={Clock}
                      iconColor="text-orange-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Média do tempo (em minutos) entre a criação do lead e a primeira mensagem de saída enviada pelo agente. Quanto menor, melhor o tempo de resposta da equipe.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <Card>
            <CardHeader>
              <CardTitle>Tendência de Leads - WhatsApp</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={whatsappMetrics?.chartData || []}>
                  <defs>
                    <linearGradient id="whatsappGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <YAxis
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#whatsappGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LeadMetrics;
