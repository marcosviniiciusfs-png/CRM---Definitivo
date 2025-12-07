import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line } from "recharts";
import { TrendingUp, Users, Facebook, MessageCircle, Target, Trash2, Clock, CalendarIcon, DollarSign, Eye, MousePointer, Megaphone, Building2, Image, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, subDays, differenceInMinutes, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

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

// ============= INTERFACES EXPANDIDAS =============

interface PlatformBreakdown {
  platform: string;
  spend: number;
  leads: number;
  reach: number;
  impressions: number;
  clicks: number;
  cpl: number;
}

interface CrmValidation {
  metaReportedLeads: number;
  crmReceivedLeads: number;
  captureRate: number;
  discrepancy: number;
}

interface AdsMetrics {
  totalSpend: number;
  totalReach: number;
  totalImpressions: number;
  totalClicks: number;
  totalLeads: number;
  avgCPL: number;
  avgCPC: number;
  avgCTR: number;
  // MELHORIA 5: Campos de qualidade
  avgFrequency?: number;
  totalLandingPageViews?: number;
  totalOutboundClicks?: number;
  chartData: { date: string; spend: number; leads: number; cpl: number }[];
  campaignBreakdown: CampaignBreakdown[];
  // MELHORIA 3: Breakdown por plataforma
  platformBreakdown?: PlatformBreakdown[];
  // MELHORIA 4: Validação CRM
  crmValidation?: CrmValidation;
}

interface CampaignBreakdown {
  id: string;
  name: string;
  spend: number;
  leads: number;
  cpl: number;
  reach: number;
  impressions: number;
  clicks: number;
  ctr: number;
  leadType?: string;
  leadTypeName?: string;
  // MELHORIA 5: Campos de qualidade
  frequency?: number;
  outboundClicks?: number;
  landingPageViews?: number;
  qualityRanking?: string;
  engagementRanking?: string;
  conversionRanking?: string;
  // MELHORIA 6: Objetivo da campanha
  objective?: string;
  objectiveName?: string;
}

interface CampaignAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  creative: {
    id: string;
    name?: string;
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    title?: string;
    call_to_action_type?: string;
  } | null;
}

interface AdAccount {
  id: string;
  name: string;
  status: number;
}

const LeadMetrics = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [facebookMetrics, setFacebookMetrics] = useState<MetricsData | null>(null);
  const [whatsappMetrics, setWhatsappMetrics] = useState<MetricsData | null>(null);
  const [adsMetrics, setAdsMetrics] = useState<AdsMetrics | null>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [facebookAdvanced, setFacebookAdvanced] = useState<FacebookAdvancedMetrics>({
    mqlConversionRate: 0,
    discardRate: 0,
    leadsByForm: []
  });
  const [whatsappAdvanced, setWhatsappAdvanced] = useState<WhatsAppAdvancedMetrics>({
    responseRate: 0,
    pipelineConversionRate: 0,
    avgResponseTimeMinutes: 0
  });
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [shouldLoadMetrics, setShouldLoadMetrics] = useState(true);
  
  // Ad account selection states
  const [selectedAdAccountId, setSelectedAdAccountId] = useState<string | null>(null);
  const [availableAdAccounts, setAvailableAdAccounts] = useState<AdAccount[]>([]);
  const [selectedAdAccountName, setSelectedAdAccountName] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // Campaign ads modal states
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignBreakdown | null>(null);
  const [campaignAds, setCampaignAds] = useState<CampaignAd[]>([]);
  const [loadingAds, setLoadingAds] = useState(false);

  useEffect(() => {
    if (user && dateRange?.from && dateRange?.to && shouldLoadMetrics) {
      loadMetrics();
      setShouldLoadMetrics(false);
    }
  }, [user, shouldLoadMetrics]);

  const getDateRange = () => {
    if (!dateRange?.from || !dateRange?.to) {
      return {
        startDate: subDays(new Date(), 30),
        endDate: new Date(),
        days: 30
      };
    }
    
    return {
      startDate: startOfDay(dateRange.from),
      endDate: endOfDay(dateRange.to),
      days: Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1
    };
  };

  const loadMetrics = async () => {
    try {
      if (!loading) {
        setUpdating(true);
      } else {
        setLoading(true);
      }

      const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user!.id)
        .single();

      if (!orgMember) return;
      
      setOrganizationId(orgMember.organization_id);

      const { startDate, endDate } = getDateRange();

      const [facebookResult, whatsappResult] = await Promise.all([
        supabase
          .from('leads')
          .select('created_at')
          .eq('organization_id', orgMember.organization_id)
          .eq('source', 'Facebook Leads')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true }),
        supabase
          .from('leads')
          .select('created_at')
          .eq('organization_id', orgMember.organization_id)
          .eq('source', 'WhatsApp')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString())
          .order('created_at', { ascending: true })
      ]);

      if (facebookResult.data && facebookResult.data.length > 0) {
        setFacebookMetrics(processMetrics(facebookResult.data));
        await loadFacebookAdvancedMetrics(orgMember.organization_id, startDate, endDate);
      } else {
        setFacebookMetrics({ total: 0, growthRate: '0', chartData: [], lastWeekTotal: 0, thisWeekTotal: 0 });
        setFacebookAdvanced({ mqlConversionRate: 0, discardRate: 0, leadsByForm: [] });
      }

      if (whatsappResult.data && whatsappResult.data.length > 0) {
        setWhatsappMetrics(processMetrics(whatsappResult.data));
        await loadWhatsAppAdvancedMetrics(orgMember.organization_id, startDate, endDate);
      } else {
        setWhatsappMetrics({ total: 0, growthRate: '0', chartData: [], lastWeekTotal: 0, thisWeekTotal: 0 });
        setWhatsappAdvanced({ responseRate: 0, pipelineConversionRate: 0, avgResponseTimeMinutes: 0 });
      }

      // Load ads metrics
      await loadAdsMetrics(orgMember.organization_id, startDate, endDate);

    } catch (error) {
      console.error('Erro ao carregar métricas:', error);
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  };

  const loadAdsMetrics = async (orgId: string, startDate: Date, endDate: Date, adAccountId?: string) => {
    try {
      setAdsLoading(true);
      setAdsError(null);

      const { data, error } = await supabase.functions.invoke('fetch-ads-insights', {
        body: {
          organization_id: orgId,
          start_date: format(startDate, 'yyyy-MM-dd'),
          end_date: format(endDate, 'yyyy-MM-dd'),
          ad_account_id: adAccountId || selectedAdAccountId || undefined
        }
      });

      if (error) {
        console.error('Error fetching ads insights:', error);
        setAdsError('Erro ao carregar métricas de anúncios');
        setAdsMetrics(null);
        return;
      }

      // Update available accounts from response
      if (data?.availableAccounts) {
        setAvailableAdAccounts(data.availableAccounts);
      }

      // Update selected account info
      if (data?.selectedAccount) {
        setSelectedAdAccountId(data.selectedAccount.id);
        setSelectedAdAccountName(data.selectedAccount.name);
      }

      if (data?.error) {
        console.log('Ads insights error:', data.error);
        setAdsError(data.error);
        setAdsMetrics(null);
        return;
      }

      if (data?.data) {
        setAdsMetrics(data.data);
      }
    } catch (error) {
      console.error('Error loading ads metrics:', error);
      setAdsError('Erro ao carregar métricas de anúncios');
      setAdsMetrics(null);
    } finally {
      setAdsLoading(false);
    }
  };

  const handleAdAccountChange = async (accountId: string) => {
    const account = availableAdAccounts.find(a => a.id === accountId);
    setSelectedAdAccountId(accountId);
    setSelectedAdAccountName(account?.name || null);
    
    if (organizationId && dateRange?.from && dateRange?.to) {
      const { startDate, endDate } = getDateRange();
      await loadAdsMetrics(organizationId, startDate, endDate, accountId);
    }
  };

  const fetchCampaignAds = async (campaign: CampaignBreakdown) => {
    if (!organizationId) return;
    
    setSelectedCampaign(campaign);
    setLoadingAds(true);
    setCampaignAds([]);

    try {
      const { data, error } = await supabase.functions.invoke('fetch-campaign-ads', {
        body: {
          organization_id: organizationId,
          campaign_id: campaign.id || undefined,
          campaign_name: campaign.name
        }
      });

      if (error) {
        console.error('Error fetching campaign ads:', error);
        return;
      }

      if (data?.ads) {
        setCampaignAds(data.ads);
      }
    } catch (error) {
      console.error('Error loading campaign ads:', error);
    } finally {
      setLoadingAds(false);
    }
  };

  const handleCampaignClick = (campaign: CampaignBreakdown) => {
    fetchCampaignAds(campaign);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'default';
      case 'PAUSED':
        return 'secondary';
      case 'DELETED':
      case 'ARCHIVED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Ativo';
      case 'PAUSED':
        return 'Pausado';
      case 'DELETED':
        return 'Excluído';
      case 'ARCHIVED':
        return 'Arquivado';
      case 'PENDING_REVIEW':
        return 'Em Revisão';
      case 'DISAPPROVED':
        return 'Reprovado';
      case 'WITH_ISSUES':
        return 'Com Problemas';
      default:
        return status;
    }
  };

  const loadFacebookAdvancedMetrics = async (organizationId: string, startDate: Date, endDate: Date) => {
    try {
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, stage, created_at')
        .eq('organization_id', organizationId)
        .eq('source', 'Facebook Leads')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (!allLeads || allLeads.length === 0) {
        setFacebookAdvanced({
          mqlConversionRate: 0,
          discardRate: 0,
          leadsByForm: []
        });
        return;
      }

      const total = allLeads.length;
      
      const qualifiedLeads = allLeads.filter(lead => lead.stage && lead.stage !== 'NOVO');
      const mqlConversionRate = total > 0 ? (qualifiedLeads.length / total) * 100 : 0;

      const discardedLeads = allLeads.filter(lead => 
        lead.stage === 'DESCARTADO' || lead.stage === 'PERDIDO'
      );
      const discardRate = total > 0 ? (discardedLeads.length / total) * 100 : 0;

      const leadIds = allLeads.map(l => l.id);
      
      const { data: webhookLogs } = await supabase
        .from('facebook_webhook_logs')
        .select('form_id, lead_id, created_at')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .in('lead_id', leadIds)
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

  const loadWhatsAppAdvancedMetrics = async (organizationId: string, startDate: Date, endDate: Date) => {
    try {
      const { data: whatsappLeads } = await supabase
        .from('leads')
        .select('id, stage, created_at')
        .eq('organization_id', organizationId)
        .eq('source', 'WhatsApp')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (!whatsappLeads || whatsappLeads.length === 0) {
        setWhatsappAdvanced({
          responseRate: 0,
          pipelineConversionRate: 0,
          avgResponseTimeMinutes: 0
        });
        return;
      }

      const total = whatsappLeads.length;

      const { data: respondedLeads } = await supabase
        .from('mensagens_chat')
        .select('id_lead')
        .eq('direcao', 'saida')
        .in('id_lead', whatsappLeads.map(l => l.id));

      const uniqueRespondedLeads = new Set(respondedLeads?.map(m => m.id_lead) || []);
      const responseRate = total > 0 ? (uniqueRespondedLeads.size / total) * 100 : 0;

      const pipelineLeads = whatsappLeads.filter(lead => lead.stage && lead.stage !== 'NOVO');
      const pipelineConversionRate = total > 0 ? (pipelineLeads.length / total) * 100 : 0;

      const responseTimes: number[] = [];
      
      const leadIds = whatsappLeads.map(l => l.id);
      const { data: allOutgoingMessages } = await supabase
        .from('mensagens_chat')
        .select('id_lead, data_hora')
        .in('id_lead', leadIds)
        .eq('direcao', 'saida')
        .order('data_hora', { ascending: true });

      const firstResponseByLead = new Map<string, string>();
      allOutgoingMessages?.forEach(msg => {
        if (!firstResponseByLead.has(msg.id_lead)) {
          firstResponseByLead.set(msg.id_lead, msg.data_hora);
        }
      });

      for (const lead of whatsappLeads) {
        const firstResponseTime = firstResponseByLead.get(lead.id);
        if (firstResponseTime) {
          const responseTime = differenceInMinutes(
            new Date(firstResponseTime),
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
    const { startDate, endDate } = getDateRange();
    
    const groupedByDay = leads.reduce((acc, lead) => {
      const date = format(new Date(lead.created_at), 'dd/MMM', { locale: ptBR });
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const chartData: ChartDataPoint[] = [];
    
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dateKey = format(currentDate, 'dd/MMM', { locale: ptBR });
      chartData.push({
        date: dateKey,
        count: groupedByDay[dateKey] || 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const periodMidpoint = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
    
    const thisWeekLeads = leads.filter(lead => 
      new Date(lead.created_at) >= periodMidpoint
    );
    
    const lastWeekLeads = leads.filter(lead => {
      const createdAt = new Date(lead.created_at);
      return createdAt < periodMidpoint;
    });

    const thisWeekTotal = thisWeekLeads.length;
    const lastWeekTotal = lastWeekLeads.length;

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

  const AdsTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="text-sm font-medium">{payload[0].payload.date}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name === 'spend' || entry.name === 'cpl' 
                ? `R$ ${entry.value.toFixed(2)}` 
                : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingAnimation text="Carregando métricas..." />
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
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="facebook" className="flex items-center gap-2">
              <Facebook className="h-4 w-4" />
              Meta Ads
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="campaigns" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
          </TabsList>

          {/* Date Range Selector */}
          <div className="flex gap-2 items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal min-w-[260px]",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "dd 'de' MMM", { locale: ptBR })} - {format(dateRange.to, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
                      </>
                    ) : (
                      format(dateRange.from, "dd 'de' MMM 'de' yyyy", { locale: ptBR })
                    )
                  ) : (
                    <span>Selecione o período</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex flex-col">
                  <div className="flex">
                    <div className="flex flex-col gap-1 border-r p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start font-normal"
                        onClick={() => {
                          setDateRange({
                            from: subDays(new Date(), 7),
                            to: new Date()
                          });
                        }}
                      >
                        Últimos 7 dias
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start font-normal"
                        onClick={() => {
                          setDateRange({
                            from: subDays(new Date(), 30),
                            to: new Date()
                          });
                        }}
                      >
                        Últimos 30 dias
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="justify-start font-normal"
                        onClick={() => {
                          setDateRange({
                            from: subDays(new Date(), 90),
                            to: new Date()
                          });
                        }}
                      >
                        Últimos 90 dias
                      </Button>
                    </div>
                    
                    <Calendar
                      mode="range"
                      selected={dateRange}
                      onSelect={(newDateRange) => {
                        setDateRange(newDateRange);
                      }}
                      numberOfMonths={2}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="pointer-events-auto"
                      locale={ptBR}
                    />
                  </div>
                  
                  <div className="border-t p-3 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDateRange({
                          from: subDays(new Date(), 30),
                          to: new Date()
                        });
                      }}
                    >
                      Resetar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        if (dateRange?.from && dateRange?.to) {
                          setShouldLoadMetrics(true);
                        }
                      }}
                      disabled={!dateRange?.from || !dateRange?.to || updating}
                    >
                      {updating ? 'Atualizando...' : 'Atualizar'}
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Facebook Tab */}
        <TabsContent value="facebook" className="space-y-6">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title={`Total de Leads (${getDateRange().days} dias)`}
                      value={facebookMetrics?.total || 0}
                      icon={Users}
                      iconColor="text-blue-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Contagem total de todos os leads recebidos via Facebook Leads no período selecionado.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Segunda Metade do Período"
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
                  <p className="text-sm">Total de leads recebidos na segunda metade do período selecionado. A taxa de crescimento compara com a primeira metade.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Primeira Metade do Período"
                      value={facebookMetrics?.lastWeekTotal || 0}
                      icon={Facebook}
                      iconColor="text-blue-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos na primeira metade do período selecionado, usado como base de comparação.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid gap-4 md:grid-cols-2 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Conversão MQL"
                      value={`${facebookAdvanced.mqlConversionRate}%`}
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
                      value={`${facebookAdvanced.discardRate}%`}
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
            <CardContent className="transition-all duration-500">
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
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Volume de Leads por Formulário</CardTitle>
            </CardHeader>
            <CardContent className="transition-all duration-500">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={facebookAdvanced.leadsByForm}>
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
                  <Bar 
                    dataKey="count" 
                    fill="#3b82f6" 
                    radius={[8, 8, 0, 0]}
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WhatsApp Tab */}
        <TabsContent value="whatsapp" className="space-y-6">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title={`Total de Leads (${getDateRange().days} dias)`}
                      value={whatsappMetrics?.total || 0}
                      icon={Users}
                      iconColor="text-green-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Contagem total de todos os leads recebidos via WhatsApp no período selecionado.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Segunda Metade do Período"
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
                  <p className="text-sm">Total de leads recebidos na segunda metade do período selecionado. A taxa de crescimento compara com a primeira metade.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Primeira Metade do Período"
                      value={whatsappMetrics?.lastWeekTotal || 0}
                      icon={MessageCircle}
                      iconColor="text-green-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads recebidos na primeira metade do período selecionado, usado como base de comparação.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Resposta Inicial"
                      value={`${whatsappAdvanced.responseRate}%`}
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
                      value={`${whatsappAdvanced.pipelineConversionRate}%`}
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
                      value={`${whatsappAdvanced.avgResponseTimeMinutes}min`}
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
            <CardContent className="transition-all duration-500">
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
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="space-y-6">
          {/* Ad Account Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Conta de Anúncios</p>
                <p className="font-medium">{selectedAdAccountName || 'Não configurada'}</p>
              </div>
            </div>
            
            {availableAdAccounts.length > 1 && (
              <Select value={selectedAdAccountId || undefined} onValueChange={handleAdAccountChange}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {availableAdAccounts.map(account => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {adsLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingAnimation text="Carregando métricas de campanhas..." />
            </div>
          ) : adsError ? (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Métricas de Campanhas Indisponíveis</p>
                  <p className="text-sm">{adsError}</p>
                  <p className="text-xs mt-2">Certifique-se de ter uma conta de anúncios vinculada ao Facebook.</p>
                </div>
              </CardContent>
            </Card>
          ) : adsMetrics ? (
            <>
              <TooltipProvider>
                <div className="grid gap-4 md:grid-cols-4 transition-all duration-500">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Valor Investido"
                          value={formatCurrency(adsMetrics.totalSpend)}
                          icon={DollarSign}
                          iconColor="text-green-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Soma total do valor gasto em todas as campanhas ativas no período selecionado.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Custo por Lead (CPL)"
                          value={formatCurrency(adsMetrics.avgCPL)}
                          icon={Target}
                          iconColor="text-blue-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Valor total investido ÷ Total de leads gerados. Indica quanto custa, em média, adquirir cada lead.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Leads Gerados"
                          value={adsMetrics.totalLeads}
                          icon={Users}
                          iconColor="text-purple-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Total de conversões do tipo "lead" registradas pelo Meta Ads no período.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Alcance"
                          value={adsMetrics.totalReach.toLocaleString('pt-BR')}
                          icon={Eye}
                          iconColor="text-orange-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Número de pessoas únicas que viram seus anúncios pelo menos uma vez.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Impressões"
                          value={adsMetrics.totalImpressions.toLocaleString('pt-BR')}
                          subtitle="Total de visualizações"
                          icon={Eye}
                          iconColor="text-cyan-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Número total de vezes que seus anúncios foram exibidos na tela.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Cliques"
                          value={adsMetrics.totalClicks.toLocaleString('pt-BR')}
                          subtitle={`CTR: ${adsMetrics.avgCTR.toFixed(2)}%`}
                          icon={MousePointer}
                          iconColor="text-indigo-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Total de cliques nos anúncios. CTR = (Cliques ÷ Impressões) × 100.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Custo por Clique (CPC)"
                          value={formatCurrency(adsMetrics.avgCPC)}
                          subtitle="Média por clique"
                          icon={DollarSign}
                          iconColor="text-amber-500"
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold mb-1">Como é calculado:</p>
                      <p className="text-sm">Valor total investido ÷ Total de cliques. Indica o custo médio de cada clique.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              {/* Métricas de Engajamento + Breakdown por Plataforma */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* Card de Métricas de Engajamento */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Métricas de Engajamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <TooltipProvider>
                      {/* Frequência Média */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-help hover:bg-muted/70 transition-colors">
                            <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                              <Eye className="h-4 w-4 text-violet-600" />
                            </div>
                            <div>
                              <div className="text-lg font-semibold">
                                {adsMetrics.avgFrequency?.toFixed(2) || '0'}x
                              </div>
                              <div className="text-xs text-muted-foreground">Frequência Média</div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px]">
                          <p>Número médio de vezes que cada pessoa viu seus anúncios. Frequência alta (acima de 3x) pode indicar fadiga de anúncio e reduzir performance.</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Cliques de Saída */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg cursor-help hover:bg-muted/70 transition-colors">
                            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg">
                              <MousePointer className="h-4 w-4 text-sky-600" />
                            </div>
                            <div>
                              <div className="text-lg font-semibold">
                                {adsMetrics.totalOutboundClicks?.toLocaleString('pt-BR') || '0'}
                              </div>
                              <div className="text-xs text-muted-foreground">Cliques de Saída</div>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px]">
                          <p>Total de cliques que direcionaram pessoas para fora do Facebook/Instagram (ex: para seu site, landing page ou WhatsApp). Indica interesse real no seu produto/serviço.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardContent>
                </Card>

                {/* Card de Breakdown por Plataforma */}
                {adsMetrics.platformBreakdown && adsMetrics.platformBreakdown.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        Desempenho por Plataforma
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TooltipProvider>
                        <div className="space-y-2">
                          {adsMetrics.platformBreakdown.map(p => {
                            const platformExplanations: Record<string, string> = {
                              'Facebook': 'Anúncios exibidos no Feed, Stories, Marketplace e Vídeos do Facebook.',
                              'Instagram': 'Anúncios exibidos no Feed, Stories, Reels e Explore do Instagram.',
                              'Audience Network': 'Anúncios exibidos em sites e aplicativos parceiros da Meta fora do Facebook e Instagram.',
                              'Messenger': 'Anúncios exibidos na caixa de entrada e Stories do Messenger.'
                            };
                            return (
                              <Tooltip key={p.platform}>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm cursor-help hover:bg-muted/70 transition-colors">
                                    <span className="font-medium">{p.platform}</span>
                                    <div className="flex gap-4 text-xs text-muted-foreground">
                                      <span>{p.leads} leads</span>
                                      <span>{formatCurrency(p.cpl)} CPL</span>
                                      <span>{formatCurrency(p.spend)}</span>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-[250px]">{platformExplanations[p.platform] || 'Plataforma de veiculação de anúncios da Meta.'}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </TooltipProvider>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Investment vs Leads Chart */}
              <Card>
                <CardHeader>
                  <CardTitle>Investimento vs Leads ao Longo do Tempo</CardTitle>
                </CardHeader>
                <CardContent className="transition-all duration-500">
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={adsMetrics.chartData}>
                      <defs>
                        <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
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
                        yAxisId="left"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                        axisLine={{ stroke: 'hsl(var(--border))' }}
                      />
                      <RechartsTooltip content={<AdsTooltip />} />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="spend"
                        name="Investimento (R$)"
                        stroke="#10b981"
                        strokeWidth={2}
                        fill="url(#spendGradient)"
                        animationDuration={800}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="leads"
                        name="Leads"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        dot={{ fill: '#8b5cf6', r: 4 }}
                        animationDuration={800}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Campaign Performance Table */}
              {adsMetrics.campaignBreakdown.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      Performance por Campanha
                      <span className="text-sm font-normal text-muted-foreground">(clique para ver anúncios)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <TooltipProvider>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campanha</TableHead>
                            <TableHead className="text-right">Investimento</TableHead>
                            <TableHead className="text-right">Leads</TableHead>
                            <TableHead className="text-right">CPL</TableHead>
                            <TableHead className="text-right">Alcance</TableHead>
                            <TableHead className="text-right">Impressões</TableHead>
                            <TableHead className="text-right">Cliques</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right w-10"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {adsMetrics.campaignBreakdown.map((campaign, index) => (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <TableRow 
                                className="cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => handleCampaignClick(campaign)}
                              >
                                <TableCell className="font-medium max-w-[200px]">
                                  <div className="truncate">{campaign.name}</div>
                                  {/* MELHORIA 6: Badge de Objetivo */}
                                  {campaign.objectiveName && (
                                    <Badge variant="outline" className="text-[9px] mt-1 font-normal">
                                      {campaign.objectiveName}
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(campaign.spend)}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span>{campaign.leads}</span>
                                    {campaign.leadTypeName && (
                                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {campaign.leadTypeName}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
                                  {formatCurrency(campaign.cpl)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {campaign.reach.toLocaleString('pt-BR')}
                                </TableCell>
                                <TableCell className="text-right">
                                  {(campaign.impressions || 0).toLocaleString('pt-BR')}
                                </TableCell>
                                <TableCell className="text-right">
                                  {campaign.clicks.toLocaleString('pt-BR')}
                                </TableCell>
                                <TableCell className="text-right">
                                  {campaign.ctr.toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right">
                                  <Eye className="h-4 w-4 text-muted-foreground" />
                                </TableCell>
                              </TableRow>
                            </TooltipTrigger>
                            {/* MELHORIA 5: Tooltip com métricas de qualidade */}
                            <TooltipContent side="left" className="max-w-xs">
                              <div className="text-xs space-y-1">
                                <p className="font-semibold mb-2">Métricas de Qualidade</p>
                                {campaign.frequency !== undefined && campaign.frequency > 0 && (
                                  <p>Frequência: {campaign.frequency.toFixed(2)}x</p>
                                )}
                                {campaign.landingPageViews !== undefined && campaign.landingPageViews > 0 && (
                                  <p>Visualizações LP: {campaign.landingPageViews.toLocaleString('pt-BR')}</p>
                                )}
                                {campaign.outboundClicks !== undefined && campaign.outboundClicks > 0 && (
                                  <p>Cliques de Saída: {campaign.outboundClicks.toLocaleString('pt-BR')}</p>
                                )}
                                {campaign.qualityRanking && campaign.qualityRanking !== 'N/A' && (
                                  <p>Qualidade: {campaign.qualityRanking}</p>
                                )}
                                {campaign.engagementRanking && campaign.engagementRanking !== 'N/A' && (
                                  <p>Engajamento: {campaign.engagementRanking}</p>
                                )}
                                {campaign.conversionRanking && campaign.conversionRanking !== 'N/A' && (
                                  <p>Conversão: {campaign.conversionRanking}</p>
                                )}
                                {(!campaign.frequency && !campaign.landingPageViews && !campaign.outboundClicks) && (
                                  <p className="text-muted-foreground">Sem dados de qualidade disponíveis</p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                          
                          {/* LINHA DE TOTAIS/MÉDIAS */}
                          {adsMetrics.campaignBreakdown.length > 0 && (
                            <TableRow className="bg-muted/50 font-semibold border-t-2 border-primary/20">
                              <TableCell>
                                <span className="text-primary">TOTAL / MÉDIA</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({adsMetrics.campaignBreakdown.length} campanhas)
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(adsMetrics.totalSpend)}
                              </TableCell>
                              <TableCell className="text-right">
                                {adsMetrics.totalLeads}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(adsMetrics.avgCPL)}
                              </TableCell>
                              <TableCell className="text-right">
                                {adsMetrics.totalReach.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {adsMetrics.totalImpressions.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {adsMetrics.totalClicks.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {adsMetrics.avgCTR.toFixed(2)}%
                              </TableCell>
                              <TableCell></TableCell>
                            </TableRow>
                          )}
                      </TableBody>
                    </Table>
                    </TooltipProvider>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="py-12">
                <div className="text-center text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium mb-2">Nenhum dado de campanha</p>
                  <p className="text-sm">Configure sua integração com o Facebook para ver métricas de campanhas.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Campaign Ads Preview Modal */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              Anúncios: {selectedCampaign?.name}
            </DialogTitle>
          </DialogHeader>
          
          {loadingAds ? (
            <div className="flex items-center justify-center py-12">
              <LoadingAnimation text="Carregando anúncios..." />
            </div>
          ) : campaignAds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campaignAds.map(ad => (
                <Card key={ad.id} className="overflow-hidden">
                  {/* Thumbnail/Preview */}
                  {ad.creative?.thumbnail_url || ad.creative?.image_url ? (
                    <div className="aspect-video bg-muted relative">
                      <img 
                        src={ad.creative.thumbnail_url || ad.creative.image_url} 
                        alt={ad.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-muted flex items-center justify-center">
                      <Image className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  
                  <CardContent className="p-4">
                    <h4 className="font-medium truncate mb-2">{ad.name}</h4>
                    
                    {ad.creative?.title && (
                      <p className="text-sm font-semibold text-foreground mb-1">{ad.creative.title}</p>
                    )}
                    
                    {ad.creative?.body && (
                      <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                        {ad.creative.body}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={getStatusBadgeVariant(ad.effective_status)}>
                        {getStatusLabel(ad.effective_status)}
                      </Badge>
                      {ad.creative?.call_to_action_type && (
                        <Badge variant="outline" className="text-xs">
                          {ad.creative.call_to_action_type.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">Nenhum anúncio encontrado</p>
              <p className="text-sm">Esta campanha não possui anúncios ativos ou os dados não estão disponíveis.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadMetrics;
