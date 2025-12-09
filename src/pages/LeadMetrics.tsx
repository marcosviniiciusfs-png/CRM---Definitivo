import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/MetricCard";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Line } from "recharts";
import { TrendingUp, Users, Facebook, MessageCircle, Target, Trash2, Clock, CalendarIcon, DollarSign, Eye, MousePointer, Megaphone, Building2, Image, ExternalLink, ChevronDown, ChevronUp, Search, Filter, Check, UserPlus, FileSpreadsheet } from "lucide-react";
import { AdCard } from "@/components/AdCard";
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
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

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

interface ManualAdvancedMetrics {
  totalManual: number;
  totalImported: number;
  conversionRate: number;
  leadsByType: { type: string; count: number }[];
}

interface AgeDistribution {
  range: string;
  count: number;
  percentage: number;
}

interface AgeMetrics {
  predominantAgeRange: string;
  averageAge: number;
  totalWithAge: number;
  ageDistribution: AgeDistribution[];
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
    object_type?: string;
  } | null;
  preview_html?: string;
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
  const [manualMetrics, setManualMetrics] = useState<MetricsData | null>(null);
  const [manualAdvanced, setManualAdvanced] = useState<ManualAdvancedMetrics>({
    totalManual: 0,
    totalImported: 0,
    conversionRate: 0,
    leadsByType: []
  });
  const [manualAgeMetrics, setManualAgeMetrics] = useState<AgeMetrics | null>(null);
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
  const [platformExpanded, setPlatformExpanded] = useState(false);
  
  // Campaign filter states
  const [campaignSearchQuery, setCampaignSearchQuery] = useState("");
  const [selectedLeadTypeFilter, setSelectedLeadTypeFilter] = useState<string>("all");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [campaignSelectorOpen, setCampaignSelectorOpen] = useState(false);

  // Get unique lead types for filter dropdown
  const availableLeadTypes = useMemo(() => {
    if (!adsMetrics?.campaignBreakdown) return [];
    const types = new Set<string>();
    adsMetrics.campaignBreakdown.forEach(c => {
      if (c.leadTypeName) types.add(c.leadTypeName);
    });
    return Array.from(types);
  }, [adsMetrics?.campaignBreakdown]);

  // Filter campaigns based on search, lead type, and selection
  const filteredCampaigns = useMemo(() => {
    if (!adsMetrics?.campaignBreakdown) return [];
    
    return adsMetrics.campaignBreakdown.filter(campaign => {
      const matchesSearch = campaign.name.toLowerCase().includes(campaignSearchQuery.toLowerCase());
      const matchesLeadType = selectedLeadTypeFilter === "all" || campaign.leadTypeName === selectedLeadTypeFilter;
      const matchesSelection = selectedCampaignIds.length === 0 || selectedCampaignIds.includes(campaign.id);
      
      return matchesSearch && matchesLeadType && matchesSelection;
    });
  }, [adsMetrics?.campaignBreakdown, campaignSearchQuery, selectedLeadTypeFilter, selectedCampaignIds]);

  // Calculate totals for filtered campaigns
  const filteredTotals = useMemo(() => {
    if (filteredCampaigns.length === 0) return null;
    
    const totals = filteredCampaigns.reduce((acc, c) => ({
      spend: acc.spend + c.spend,
      leads: acc.leads + c.leads,
      reach: acc.reach + c.reach,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
    }), { spend: 0, leads: 0, reach: 0, impressions: 0, clicks: 0 });
    
    return {
      ...totals,
      cpl: totals.leads > 0 ? totals.spend / totals.leads : 0,
      ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    };
  }, [filteredCampaigns]);

  const toggleCampaignSelection = (campaignId: string) => {
    setSelectedCampaignIds(prev => 
      prev.includes(campaignId) 
        ? prev.filter(id => id !== campaignId)
        : [...prev, campaignId]
    );
  };

  const toggleAllCampaigns = () => {
    if (!adsMetrics?.campaignBreakdown) return;
    if (selectedCampaignIds.length === adsMetrics.campaignBreakdown.length) {
      setSelectedCampaignIds([]);
    } else {
      setSelectedCampaignIds(adsMetrics.campaignBreakdown.map(c => c.id));
    }
  };

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

      const [facebookResult, whatsappResult, manualResult] = await Promise.all([
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
          .order('created_at', { ascending: true }),
        supabase
          .from('leads')
          .select('created_at, source')
          .eq('organization_id', orgMember.organization_id)
          .in('source', ['Manual', 'Importação'])
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

      if (manualResult.data && manualResult.data.length > 0) {
        setManualMetrics(processMetrics(manualResult.data));
        await loadManualAdvancedMetrics(orgMember.organization_id, startDate, endDate);
        await loadManualAgeMetrics(orgMember.organization_id, startDate, endDate);
      } else {
        setManualMetrics({ total: 0, growthRate: '0', chartData: [], lastWeekTotal: 0, thisWeekTotal: 0 });
        setManualAdvanced({ totalManual: 0, totalImported: 0, conversionRate: 0, leadsByType: [] });
        setManualAgeMetrics(null);
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

  const loadManualAdvancedMetrics = async (organizationId: string, startDate: Date, endDate: Date) => {
    try {
      const { data: allLeads } = await supabase
        .from('leads')
        .select('id, stage, source, created_at')
        .eq('organization_id', organizationId)
        .in('source', ['Manual', 'Importação'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (!allLeads || allLeads.length === 0) {
        setManualAdvanced({
          totalManual: 0,
          totalImported: 0,
          conversionRate: 0,
          leadsByType: []
        });
        return;
      }

      const totalManual = allLeads.filter(l => l.source === 'Manual').length;
      const totalImported = allLeads.filter(l => l.source === 'Importação').length;

      const qualifiedLeads = allLeads.filter(lead => lead.stage && lead.stage !== 'NOVO');
      const conversionRate = allLeads.length > 0 ? (qualifiedLeads.length / allLeads.length) * 100 : 0;

      const leadsByType = [
        { type: 'Manual', count: totalManual },
        { type: 'Importação', count: totalImported }
      ].filter(t => t.count > 0);

      setManualAdvanced({
        totalManual,
        totalImported,
        conversionRate: Number(conversionRate.toFixed(1)),
        leadsByType
      });
    } catch (error) {
      console.error('Erro ao carregar métricas avançadas de cadastro manual:', error);
    }
  };

  const loadManualAgeMetrics = async (organizationId: string, startDate: Date, endDate: Date) => {
    try {
      const { data } = await supabase
        .from('leads')
        .select('idade')
        .eq('organization_id', organizationId)
        .in('source', ['Manual', 'Importação'])
        .not('idade', 'is', null)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (!data || data.length === 0) {
        setManualAgeMetrics(null);
        return;
      }

      const ranges = [
        { range: '18-25', min: 18, max: 25 },
        { range: '26-35', min: 26, max: 35 },
        { range: '36-45', min: 36, max: 45 },
        { range: '46-55', min: 46, max: 55 },
        { range: '55+', min: 56, max: 200 }
      ];

      const distribution = ranges.map(r => ({
        range: r.range,
        count: data.filter(l => l.idade !== null && l.idade >= r.min && l.idade <= r.max).length,
        percentage: 0
      }));

      const total = data.length;
      distribution.forEach(d => d.percentage = Math.round((d.count / total) * 100));

      const predominant = distribution.reduce((a, b) => a.count > b.count ? a : b);
      const validAges = data.filter(l => l.idade !== null).map(l => l.idade as number);
      const avg = validAges.length > 0 ? Math.round(validAges.reduce((sum, age) => sum + age, 0) / validAges.length) : 0;

      setManualAgeMetrics({
        predominantAgeRange: predominant.range,
        averageAge: avg,
        totalWithAge: total,
        ageDistribution: distribution
      });
    } catch (error) {
      console.error('Erro ao carregar métricas de idade:', error);
      setManualAgeMetrics(null);
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
                ? `R$ ${Number(entry.value).toFixed(2)}` 
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
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="facebook" className="flex items-center gap-2">
              <Facebook className="h-4 w-4" />
              Meta Ads
            </TabsTrigger>
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Cadastro Manual
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

        {/* Manual Registration Tab */}
        <TabsContent value="manual" className="space-y-6">
          <TooltipProvider>
            <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title={`Total de Leads (${getDateRange().days} dias)`}
                      value={manualMetrics?.total || 0}
                      icon={Users}
                      iconColor="text-orange-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Contagem total de leads cadastrados manualmente ou importados no período selecionado.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Cadastros Manuais"
                      value={manualAdvanced.totalManual}
                      icon={UserPlus}
                      iconColor="text-orange-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads criados manualmente através do formulário de cadastro do CRM.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Leads Importados"
                      value={manualAdvanced.totalImported}
                      icon={FileSpreadsheet}
                      iconColor="text-blue-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads importados via planilha Excel/CSV para o CRM.</p>
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="grid gap-4 md:grid-cols-3 transition-all duration-500">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Taxa de Conversão p/ Pipeline"
                      value={`${manualAdvanced.conversionRate}%`}
                      subtitle="Leads movidos para vendas"
                      icon={Target}
                      iconColor="text-purple-500"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">(Leads com stage diferente de "NOVO" / Total de Leads) × 100. Indica quantos leads manuais/importados foram qualificados.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Segunda Metade do Período"
                      value={manualMetrics?.thisWeekTotal || 0}
                      icon={TrendingUp}
                      iconColor="text-green-500"
                      trend={{
                        value: `${manualMetrics?.growthRate || 0}%`,
                        positive: Number(manualMetrics?.growthRate || 0) >= 0
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads cadastrados/importados na segunda metade do período. A taxa compara com a primeira metade.</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <MetricCard
                      title="Primeira Metade do Período"
                      value={manualMetrics?.lastWeekTotal || 0}
                      icon={UserPlus}
                      iconColor="text-orange-600"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="font-semibold mb-1">Como é calculado:</p>
                  <p className="text-sm">Total de leads cadastrados/importados na primeira metade do período, usado como base de comparação.</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>

          <Card>
            <CardHeader>
              <CardTitle>Tendência de Leads - Cadastro Manual</CardTitle>
            </CardHeader>
            <CardContent className="transition-all duration-500">
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={manualMetrics?.chartData || []}>
                  <defs>
                    <linearGradient id="manualGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
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
                    stroke="#f97316"
                    strokeWidth={2}
                    fill="url(#manualGradient)"
                    animationDuration={800}
                    animationEasing="ease-in-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Card de Faixa Etária */}
          {manualAgeMetrics && manualAgeMetrics.totalWithAge > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-orange-500" />
                  Faixa Etária dos Leads
                  <Badge variant="secondary" className="ml-2">
                    {manualAgeMetrics.totalWithAge} leads com idade
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Info cards */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Faixa Predominante</span>
                      <span className="font-semibold text-lg text-primary">{manualAgeMetrics.predominantAgeRange} anos</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm text-muted-foreground">Idade Média</span>
                      <span className="font-semibold text-lg">{manualAgeMetrics.averageAge} anos</span>
                    </div>
                  </div>
                  
                  {/* Distribution bars */}
                  <div className="space-y-2">
                    {manualAgeMetrics.ageDistribution.map(item => (
                      <div key={item.range} className="flex items-center gap-2">
                        <span className="text-xs w-12 text-muted-foreground">{item.range}</span>
                        <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-orange-500 rounded-full transition-all duration-500"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                        <span className="text-xs w-12 text-right font-medium">{item.percentage}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4 transition-all duration-500">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Investido"
                          value={formatCurrency(adsMetrics.totalSpend)}
                          icon={DollarSign}
                          iconColor="text-green-500"
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Soma total do valor gasto em todas as campanhas ativas no período.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Custo por Lead"
                          value={formatCurrency(adsMetrics.avgCPL)}
                          icon={Target}
                          iconColor="text-blue-500"
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Custo por Lead: Valor investido ÷ Leads gerados.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Leads"
                          value={adsMetrics.totalLeads}
                          icon={Users}
                          iconColor="text-purple-500"
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Total de conversões do tipo "lead" no período.</p>
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
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Pessoas únicas que viram seus anúncios.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <div className="grid gap-2 grid-cols-2 md:grid-cols-3 transition-all duration-500">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="Impressões"
                          value={adsMetrics.totalImpressions.toLocaleString('pt-BR')}
                          icon={Eye}
                          iconColor="text-cyan-500"
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Total de vezes que seus anúncios foram exibidos.</p>
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
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Cliques nos anúncios. CTR = Cliques ÷ Impressões.</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <MetricCard
                          title="CPC"
                          value={formatCurrency(adsMetrics.avgCPC)}
                          icon={DollarSign}
                          iconColor="text-amber-500"
                          compact
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-sm">Custo por Clique: Valor investido ÷ Cliques.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </TooltipProvider>

              {/* Métricas de Engajamento + Breakdown por Plataforma */}
              <div className="grid gap-3 md:grid-cols-2">
                {/* Card de Métricas de Engajamento - Compacto */}
                <Card>
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
                      <Eye className="h-3.5 w-3.5" />
                      Engajamento
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 pt-1 space-y-2">
                    <TooltipProvider>
                      {/* Frequência Média */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg cursor-help hover:bg-muted/70 transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-violet-100 dark:bg-violet-900/30 rounded">
                                <Eye className="h-3.5 w-3.5 text-violet-600" />
                              </div>
                              <span className="text-xs text-muted-foreground">Frequência Média</span>
                            </div>
                            <span className="text-sm font-semibold">
                              {adsMetrics.avgFrequency?.toFixed(2) || '0'}x
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px]">
                          <p>Número médio de vezes que cada pessoa viu seus anúncios. Frequência alta (acima de 3x) pode indicar fadiga de anúncio e reduzir performance.</p>
                        </TooltipContent>
                      </Tooltip>

                      {/* Cliques de Saída */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center justify-between p-2 bg-muted/50 rounded-lg cursor-help hover:bg-muted/70 transition-colors">
                            <div className="flex items-center gap-2">
                              <div className="p-1.5 bg-sky-100 dark:bg-sky-900/30 rounded">
                                <MousePointer className="h-3.5 w-3.5 text-sky-600" />
                              </div>
                              <span className="text-xs text-muted-foreground">Cliques de Saída</span>
                            </div>
                            <span className="text-sm font-semibold">
                              {adsMetrics.totalOutboundClicks?.toLocaleString('pt-BR') || '0'}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-[280px]">
                          <p>Total de cliques que direcionaram pessoas para fora do Facebook/Instagram (ex: para seu site, landing page ou WhatsApp). Indica interesse real no seu produto/serviço.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </CardContent>
                </Card>

                {/* Card de Breakdown por Plataforma - Com expansão */}
                {adsMetrics.platformBreakdown && adsMetrics.platformBreakdown.length > 0 && (
                  <Card>
                    <CardHeader className="pb-1 pt-3 px-3">
                      <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground">
                        <Building2 className="h-3.5 w-3.5" />
                        Desempenho por Plataforma
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-3 pt-1">
                      <TooltipProvider>
                        <div className="space-y-1.5">
                          {(platformExpanded ? adsMetrics.platformBreakdown : adsMetrics.platformBreakdown.slice(0, 2)).map(p => {
                            const platformExplanations: Record<string, string> = {
                              'Facebook': 'Anúncios no Feed, Stories, Marketplace e Vídeos do Facebook.',
                              'Instagram': 'Anúncios no Feed, Stories, Reels e Explore do Instagram.',
                              'Audience Network': 'Anúncios em sites e apps parceiros da Meta.',
                              'Messenger': 'Anúncios na caixa de entrada e Stories do Messenger.'
                            };
                            return (
                              <Tooltip key={p.platform}>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs cursor-help hover:bg-muted/70 transition-colors">
                                    <span className="font-medium">{p.platform}</span>
                                    <div className="flex gap-3 text-muted-foreground">
                                      <span>{p.leads} leads</span>
                                      <span>{formatCurrency(p.cpl)}</span>
                                    </div>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="max-w-[220px]">{platformExplanations[p.platform] || 'Plataforma de veiculação da Meta.'}</p>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                        
                        {adsMetrics.platformBreakdown.length > 2 && (
                          <button
                            onClick={() => setPlatformExpanded(!platformExpanded)}
                            className="w-full mt-2 flex items-center justify-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors py-1 hover:bg-muted/30 rounded"
                          >
                            {platformExpanded ? (
                              <>
                                <ChevronUp className="h-3 w-3" />
                                Ver menos
                              </>
                            ) : (
                              <>
                                <ChevronDown className="h-3 w-3" />
                                Ver mais ({adsMetrics.platformBreakdown.length - 2})
                              </>
                            )}
                          </button>
                        )}
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
                  <CardHeader className="pb-4">
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <CardTitle className="flex items-center gap-2">
                        Performance por Campanha
                        <span className="text-sm font-normal text-muted-foreground">(clique para ver anúncios)</span>
                      </CardTitle>
                      
                      {/* Filters - Right side, minimalist */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Search by name */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar..."
                            value={campaignSearchQuery}
                            onChange={(e) => setCampaignSearchQuery(e.target.value)}
                            className="h-8 w-36 pl-8 text-sm bg-muted/30 border-muted focus:bg-background"
                          />
                        </div>
                        
                        {/* Filter by lead source */}
                        {availableLeadTypes.length > 0 && (
                          <Select value={selectedLeadTypeFilter} onValueChange={setSelectedLeadTypeFilter}>
                            <SelectTrigger className="h-8 w-[130px] text-sm bg-muted/30 border-muted">
                              <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                              <SelectValue placeholder="Fonte" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Todas fontes</SelectItem>
                              {availableLeadTypes.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {/* Campaign selector */}
                        <Popover open={campaignSelectorOpen} onOpenChange={setCampaignSelectorOpen}>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-8 text-sm bg-muted/30 border-muted hover:bg-muted/50"
                            >
                              <Check className="h-3.5 w-3.5 mr-1.5" />
                              {selectedCampaignIds.length > 0 
                                ? `${selectedCampaignIds.length} selecionadas` 
                                : "Campanhas"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-64 p-2" align="end">
                            <div className="space-y-2">
                              <div 
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer border-b pb-2"
                                onClick={toggleAllCampaigns}
                              >
                                <Checkbox 
                                  checked={selectedCampaignIds.length === adsMetrics.campaignBreakdown.length}
                                  className="h-3.5 w-3.5"
                                />
                                <span className="text-sm font-medium">
                                  {selectedCampaignIds.length === adsMetrics.campaignBreakdown.length 
                                    ? "Desmarcar todas" 
                                    : "Selecionar todas"}
                                </span>
                              </div>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {adsMetrics.campaignBreakdown.map(campaign => (
                                  <div 
                                    key={campaign.id}
                                    className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted cursor-pointer"
                                    onClick={() => toggleCampaignSelection(campaign.id)}
                                  >
                                    <Checkbox 
                                      checked={selectedCampaignIds.includes(campaign.id)}
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className="text-xs truncate" title={campaign.name}>
                                      {campaign.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {selectedCampaignIds.length > 0 && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="w-full h-7 text-xs"
                                  onClick={() => setSelectedCampaignIds([])}
                                >
                                  Limpar seleção
                                </Button>
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
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
                          {filteredCampaigns.map((campaign, index) => (
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
                                    {campaign.leadTypeName && (
                                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                        {campaign.leadTypeName}
                                      </span>
                                    )}
                                    <span className="min-w-[40px] text-right tabular-nums">{campaign.leads}</span>
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
                          {filteredCampaigns.length > 0 && filteredTotals && (
                            <TableRow className="bg-muted/50 font-semibold border-t-2 border-primary/20">
                              <TableCell>
                                <span className="text-primary">TOTAL / MÉDIA</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({filteredCampaigns.length} campanha{filteredCampaigns.length !== 1 ? 's' : ''})
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(filteredTotals.spend)}
                              </TableCell>
                              <TableCell className="text-right">
                                {filteredTotals.leads}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(filteredTotals.cpl)}
                              </TableCell>
                              <TableCell className="text-right">
                                {filteredTotals.reach.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {filteredTotals.impressions.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {filteredTotals.clicks.toLocaleString('pt-BR')}
                              </TableCell>
                              <TableCell className="text-right">
                                {filteredTotals.ctr.toFixed(2)}%
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

      {/* Campaign Ads Preview Modal - Enhanced with Video Support */}
      <Dialog open={!!selectedCampaign} onOpenChange={() => setSelectedCampaign(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-primary" />
              <span>Anúncios da Campanha</span>
              <Badge variant="secondary" className="ml-2">
                {campaignAds.length} {campaignAds.length === 1 ? 'anúncio' : 'anúncios'}
              </Badge>
            </DialogTitle>
            {selectedCampaign && (
              <p className="text-sm text-muted-foreground truncate">{selectedCampaign.name}</p>
            )}
          </DialogHeader>
          
          {loadingAds ? (
            <div className="flex items-center justify-center py-16">
              <LoadingAnimation text="Carregando anúncios..." />
            </div>
          ) : campaignAds.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {campaignAds.map(ad => (
                <AdCard
                  key={ad.id}
                  ad={ad}
                  getStatusBadgeVariant={getStatusBadgeVariant}
                  getStatusLabel={getStatusLabel}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Image className="h-8 w-8 opacity-50" />
              </div>
              <p className="text-lg font-medium mb-2">Nenhum anúncio encontrado</p>
              <p className="text-sm max-w-md mx-auto">
                Esta campanha não possui anúncios ativos ou os dados não estão disponíveis na API do Meta.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LeadMetrics;
