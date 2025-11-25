import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { TrendingUp, Users, Facebook, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
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

const LeadMetrics = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [facebookMetrics, setFacebookMetrics] = useState<MetricsData | null>(null);
  const [whatsappMetrics, setWhatsappMetrics] = useState<MetricsData | null>(null);

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
        .eq('source', 'Facebook')
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
      }

      // Processar dados do WhatsApp
      if (whatsappLeads) {
        setWhatsappMetrics(processMetrics(whatsappLeads));
      }
    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
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
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total de Leads (30 dias)"
              value={facebookMetrics?.total || 0}
              icon={Users}
              iconColor="text-blue-500"
            />
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
            <MetricCard
              title="Leads Semana Anterior"
              value={facebookMetrics?.lastWeekTotal || 0}
              icon={Facebook}
              iconColor="text-blue-600"
            />
          </div>

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
                  <Tooltip content={<CustomTooltip />} />
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
        </TabsContent>

        <TabsContent value="whatsapp" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Total de Leads (30 dias)"
              value={whatsappMetrics?.total || 0}
              icon={Users}
              iconColor="text-green-500"
            />
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
            <MetricCard
              title="Leads Semana Anterior"
              value={whatsappMetrics?.lastWeekTotal || 0}
              icon={MessageCircle}
              iconColor="text-green-600"
            />
          </div>

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
                  <Tooltip content={<CustomTooltip />} />
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
