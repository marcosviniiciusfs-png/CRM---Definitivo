import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdAccount {
  id: string;
  name: string;
  status: number;
}

interface AdsInsightsParams {
  organization_id: string;
  start_date: string;
  end_date: string;
  ad_account_id?: string;
}

// ============= MELHORIA 2: Tipos de Leads Expandidos =============

// Prioridade 1: Formulários Lead Ads
const FORM_LEAD_TYPES = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
];

// Prioridade 2: Conversões de mensagem/WhatsApp (expandido)
const MESSAGING_LEAD_TYPES = [
  'onsite_conversion.total_messaging_connection',
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'messaging_first_reply',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.messaging_user_depth_2_message_send',
  'onsite_conversion.messaging_user_depth_3_message_send',
];

// NOVO: Tipos de mensagens de negócios expandidas
const BUSINESS_MESSAGING_TYPES = [
  'onsite_conversion.post_save',
  'onsite_conversion.messaging_welcome_message_view',
  'onsite_conversion.messaging_business_capability_acquired',
  'instagram_profile_engagement',
  'instagram_direct_message',
];

// Prioridade 3: Pixel de Lead
const PIXEL_LEAD_TYPES = [
  'offsite_conversion.fb_pixel_lead',
  'omni_lead',
];

// Prioridade 4: Conversões de registro
const REGISTRATION_LEAD_TYPES = [
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  'omni_complete_registration',
];

// NOVO: Tipos de contato/agendamento
const CONTACT_LEAD_TYPES = [
  'contact',
  'contact_total',
  'contact_website',
  'contact_mobile_app',
  'schedule',
  'submit_application',
  'find_location',
  'subscribe',
  'subscribe_total',
];

// Função para obter nome amigável do tipo de lead (EXPANDIDA)
const getLeadTypeName = (leadType: string): string => {
  if (!leadType) return '';
  
  // WhatsApp / Mensagens
  if (leadType.includes('messaging') || leadType.includes('total_messaging_connection')) {
    return 'WhatsApp';
  }
  
  // Formulários Lead Ads
  if (leadType === 'lead' || leadType === 'leadgen_grouped' || leadType.includes('lead_grouped')) {
    return 'Formulário';
  }
  
  // Pixel de Lead
  if (leadType.includes('fb_pixel_lead') || leadType === 'omni_lead') {
    return 'Pixel';
  }
  
  // Registro completo
  if (leadType.includes('registration')) {
    return 'Registro';
  }
  
  // Instagram
  if (leadType.includes('instagram')) {
    return 'Instagram';
  }
  
  // Contato/Agendamento
  if (leadType.includes('contact') || leadType === 'schedule') {
    return 'Contato';
  }
  
  // Aplicação/Inscrição
  if (leadType.includes('submit_application') || leadType.includes('subscribe')) {
    return 'Inscrição';
  }
  
  // Conversões customizadas
  if (leadType.includes('offsite_conversion.custom.') || leadType.includes('omni_custom')) {
    return 'Personalizada';
  }
  
  // Para outros tipos, retornar versão simplificada
  const simplified = leadType.split('.').pop()?.replace(/_/g, ' ') || leadType;
  return simplified.charAt(0).toUpperCase() + simplified.slice(1);
};

// Função para calcular leads com priorização EXPANDIDA
const calculateLeadsFromActions = (actions: any[], conversions?: any[]): { leads: number; leadType: string } => {
  if (!actions || actions.length === 0) {
    if (conversions && conversions.length > 0) {
      const customConversion = conversions[0];
      return {
        leads: parseInt(customConversion.value || '0', 10),
        leadType: customConversion.action_type
      };
    }
    return { leads: 0, leadType: '' };
  }

  // Prioridade 1: Formulários Lead Ads
  for (const action of actions) {
    if (FORM_LEAD_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 2: Conversões de mensagem/WhatsApp
  for (const action of actions) {
    if (MESSAGING_LEAD_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 2.5: Mensagens de negócios expandidas (Instagram, etc)
  for (const action of actions) {
    if (BUSINESS_MESSAGING_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 3: Pixel de Lead
  for (const action of actions) {
    if (PIXEL_LEAD_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 4: Conversões de registro
  for (const action of actions) {
    if (REGISTRATION_LEAD_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 5: Contatos/Agendamentos
  for (const action of actions) {
    if (CONTACT_LEAD_TYPES.includes(action.action_type)) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 6: Conversões customizadas DENTRO de actions
  for (const action of actions) {
    if (action.action_type.startsWith('offsite_conversion.custom.') || 
        action.action_type.startsWith('omni_custom')) {
      return { leads: parseInt(action.value || '0', 10), leadType: action.action_type };
    }
  }

  // Prioridade 7: Conversões customizadas no campo conversions
  if (conversions && conversions.length > 0) {
    const customConversion = conversions[0];
    return {
      leads: parseInt(customConversion.value || '0', 10),
      leadType: customConversion.action_type
    };
  }

  return { leads: 0, leadType: '' };
};

// Função para obter custo por lead
const getLeadCostFromActions = (costActions: any[], leadType: string): number => {
  if (!costActions || !leadType) return 0;
  const costAction = costActions.find((c: any) => c.action_type === leadType);
  return costAction ? parseFloat(costAction.value || '0') : 0;
};

// ============= MELHORIA 6: Mapeamento de Objetivos =============
const objectiveToName: Record<string, string> = {
  'LEAD_GENERATION': 'Geração de Leads',
  'MESSAGES': 'Mensagens',
  'CONVERSIONS': 'Conversões',
  'OUTCOME_LEADS': 'Leads',
  'OUTCOME_ENGAGEMENT': 'Engajamento',
  'OUTCOME_TRAFFIC': 'Tráfego',
  'OUTCOME_AWARENESS': 'Reconhecimento',
  'OUTCOME_SALES': 'Vendas',
  'REACH': 'Alcance',
  'BRAND_AWARENESS': 'Reconhecimento de Marca',
  'LINK_CLICKS': 'Cliques no Link',
  'POST_ENGAGEMENT': 'Engajamento com Publicação',
  'PAGE_LIKES': 'Curtidas na Página',
  'VIDEO_VIEWS': 'Visualizações de Vídeo',
  'APP_INSTALLS': 'Instalações de App',
};

// ============= MELHORIA 3: Nome da Plataforma =============
const getPlatformName = (platform: string): string => {
  const names: Record<string, string> = {
    'facebook': 'Facebook',
    'instagram': 'Instagram',
    'audience_network': 'Audience Network',
    'messenger': 'Messenger',
    'unknown': 'Desconhecido',
  };
  return names[platform?.toLowerCase()] || platform || 'Outro';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { organization_id, start_date, end_date, ad_account_id }: AdsInsightsParams = await req.json();

    if (!organization_id || !start_date || !end_date) {
      throw new Error('Missing required parameters: organization_id, start_date, end_date');
    }

    console.log(`Fetching ads insights for org ${organization_id} from ${start_date} to ${end_date}`);

    const { data: integration, error: integrationError } = await supabase
      .from('facebook_integrations')
      .select('access_token, ad_account_id, ad_accounts')
      .eq('organization_id', organization_id)
      .single();

    if (integrationError || !integration) {
      console.error('Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook integration not found', data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let availableAccounts: AdAccount[] = [];
    if (integration.ad_accounts) {
      if (Array.isArray(integration.ad_accounts)) {
        availableAccounts = integration.ad_accounts;
      } else if (typeof integration.ad_accounts === 'string') {
        try {
          availableAccounts = JSON.parse(integration.ad_accounts);
        } catch (e) {
          console.error('Failed to parse ad_accounts:', e);
        }
      }
    }

    const selectedAccountId = ad_account_id || integration.ad_account_id;

    if (!selectedAccountId) {
      console.log('No ad account configured');
      return new Response(
        JSON.stringify({ error: 'No ad account configured', data: null, availableAccounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const selectedAccount = availableAccounts.find(acc => acc.id === selectedAccountId) || {
      id: selectedAccountId,
      name: 'Conta de Anúncios',
      status: 1
    };

    const { access_token } = integration;

    console.log(`Using ad account: ${selectedAccountId} (${selectedAccount.name})`);

    // ============= MELHORIA 5: Campos de Qualidade Expandidos =============
    const insightsFields = [
      'campaign_id',
      'campaign_name',
      'reach',
      'impressions',
      'spend',
      'clicks',
      'cpc',
      'cpm',
      'ctr',
      'actions',
      'cost_per_action_type',
      'conversions',
      'action_values',
      'conversion_values',
      // NOVOS campos de qualidade
      'outbound_clicks',
      'inline_link_clicks',
      'frequency',
      'quality_ranking',
      'engagement_rate_ranking',
      'conversion_rate_ranking',
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });

    // ============= MELHORIA 1: Janela de Atribuição =============
    const attributionWindows = encodeURIComponent('["7d_click","1d_view"]');

    // CHAMADA 1: Com time_increment=1 para dados diários (gráficos)
    const dailyInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&action_attribution_windows=${attributionWindows}` +
      `&access_token=${access_token}`;

    // CHAMADA 2: Sem time_increment para totais agregados corretos
    const aggregatedInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&action_attribution_windows=${attributionWindows}` +
      `&access_token=${access_token}`;

    // ============= MELHORIA 3: Breakdown por Plataforma =============
    const platformBreakdownUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=spend,reach,impressions,clicks,actions,cost_per_action_type` +
      `&level=account` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&breakdowns=publisher_platform` +
      `&action_attribution_windows=${attributionWindows}` +
      `&access_token=${access_token}`;

    console.log('Fetching daily, aggregated, and platform insights from Meta API...');
    
    // Fazer todas as chamadas em paralelo
    const [dailyResponse, aggregatedResponse, platformResponse] = await Promise.all([
      fetch(dailyInsightsUrl),
      fetch(aggregatedInsightsUrl),
      fetch(platformBreakdownUrl)
    ]);

    const [dailyData, aggregatedData, platformData] = await Promise.all([
      dailyResponse.json(),
      aggregatedResponse.json(),
      platformResponse.json()
    ]);

    if (dailyData.error) {
      console.error('Meta API error (daily):', dailyData.error);
      return new Response(
        JSON.stringify({ error: dailyData.error.message, data: null, selectedAccount, availableAccounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (aggregatedData.error) {
      console.error('Meta API error (aggregated):', aggregatedData.error);
      return new Response(
        JSON.stringify({ error: aggregatedData.error.message, data: null, selectedAccount, availableAccounts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Received ${dailyData.data?.length || 0} daily records and ${aggregatedData.data?.length || 0} aggregated records`);

    // ============= MELHORIA 6: Buscar Objetivos das Campanhas =============
    const campaignIds = [...new Set((aggregatedData.data || []).map((r: any) => r.campaign_id).filter(Boolean))];
    const campaignDetails: Record<string, { objective: string; optimization_goal: string }> = {};

    if (campaignIds.length > 0) {
      try {
        const campaignsUrl = `https://graph.facebook.com/v18.0/?ids=${campaignIds.join(',')}&fields=objective,optimization_goal&access_token=${access_token}`;
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();
        
        if (!campaignsData.error) {
          for (const [id, data] of Object.entries(campaignsData)) {
            campaignDetails[id] = {
              objective: (data as any).objective || '',
              optimization_goal: (data as any).optimization_goal || ''
            };
          }
        }
        console.log(`Fetched objectives for ${Object.keys(campaignDetails).length} campaigns`);
      } catch (e) {
        console.error('Error fetching campaign objectives:', e);
      }
    }

    // Processar dados AGREGADOS
    let totalSpend = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalLandingPageViews = 0;
    let totalOutboundClicks = 0;

    const campaignData: Record<string, { 
      id: string; 
      name: string; 
      spend: number; 
      leads: number; 
      reach: number;
      impressions: number;
      clicks: number;
      leadType: string;
      costPerLead: number;
      // MELHORIA 5: Campos de qualidade
      frequency: number;
      outboundClicks: number;
      landingPageViews: number;
      qualityRanking: string;
      engagementRanking: string;
      conversionRanking: string;
      // MELHORIA 6: Objetivo
      objective: string;
      objectiveName: string;
    }> = {};

    if (aggregatedData.data) {
      for (const record of aggregatedData.data) {
        const spend = parseFloat(record.spend || '0');
        const reach = parseInt(record.reach || '0', 10);
        const impressions = parseInt(record.impressions || '0', 10);
        const clicks = parseInt(record.clicks || '0', 10);
        const frequency = parseFloat(record.frequency || '0');

        totalSpend += spend;
        totalReach += reach;
        totalImpressions += impressions;
        totalClicks += clicks;

        // Landing page views from actions
        const lpvAction = record.actions?.find((a: any) => a.action_type === 'landing_page_view');
        const landingPageViews = lpvAction ? parseInt(lpvAction.value || '0', 10) : 0;
        totalLandingPageViews += landingPageViews;

        // Outbound clicks
        const outboundClicks = record.outbound_clicks?.[0]?.value 
          ? parseInt(record.outbound_clicks[0].value, 10) 
          : 0;
        totalOutboundClicks += outboundClicks;

        console.log(`\n=== Campaign "${record.campaign_name}" (${record.campaign_id}) ===`);
        console.log(`  Spend: ${spend}, Reach: ${reach}, Frequency: ${frequency}`);
        
        if (record.actions && record.actions.length > 0) {
          console.log(`  ALL Actions (${record.actions.length} total):`);
          record.actions.slice(0, 10).forEach((a: any) => {
            console.log(`    - ${a.action_type}: ${a.value}`);
          });
        }

        const { leads, leadType } = calculateLeadsFromActions(record.actions, record.conversions);
        totalLeads += leads;

        if (leadType) {
          console.log(`  → SELECTED: ${leadType} = ${leads} (${getLeadTypeName(leadType)})`);
        }

        const costPerLead = getLeadCostFromActions(record.cost_per_action_type, leadType);

        const campaignId = record.campaign_id || '';
        const campaignName = record.campaign_name || 'Unknown';
        const campaignKey = campaignId || campaignName;

        // Obter objetivo da campanha
        const campaignObjective = campaignDetails[campaignId]?.objective || '';
        const objectiveName = objectiveToName[campaignObjective] || campaignObjective || 'Outro';
        
        if (!campaignData[campaignKey]) {
          campaignData[campaignKey] = { 
            id: campaignId, 
            name: campaignName, 
            spend: 0, 
            leads: 0, 
            reach: 0,
            impressions: 0,
            clicks: 0,
            leadType: '',
            costPerLead: 0,
            frequency: 0,
            outboundClicks: 0,
            landingPageViews: 0,
            qualityRanking: record.quality_ranking || 'N/A',
            engagementRanking: record.engagement_rate_ranking || 'N/A',
            conversionRanking: record.conversion_rate_ranking || 'N/A',
            objective: campaignObjective,
            objectiveName: objectiveName,
          };
        }
        
        campaignData[campaignKey].spend += spend;
        campaignData[campaignKey].leads += leads;
        campaignData[campaignKey].reach += reach;
        campaignData[campaignKey].impressions += impressions;
        campaignData[campaignKey].clicks += clicks;
        campaignData[campaignKey].outboundClicks += outboundClicks;
        campaignData[campaignKey].landingPageViews += landingPageViews;
        if (frequency > 0) campaignData[campaignKey].frequency = frequency;
        if (leadType) campaignData[campaignKey].leadType = leadType;
        if (costPerLead > 0) campaignData[campaignKey].costPerLead = costPerLead;
      }
    }

    // ============= MELHORIA 3: Processar Breakdown por Plataforma =============
    interface PlatformBreakdown {
      platform: string;
      spend: number;
      leads: number;
      reach: number;
      impressions: number;
      clicks: number;
      cpl: number;
    }

    const platformBreakdown: PlatformBreakdown[] = [];
    
    if (platformData.data && !platformData.error) {
      for (const record of platformData.data) {
        const platform = record.publisher_platform || 'unknown';
        const spend = parseFloat(record.spend || '0');
        const { leads } = calculateLeadsFromActions(record.actions);
        
        platformBreakdown.push({
          platform: getPlatformName(platform),
          spend,
          leads,
          reach: parseInt(record.reach || '0', 10),
          impressions: parseInt(record.impressions || '0', 10),
          clicks: parseInt(record.clicks || '0', 10),
          cpl: leads > 0 ? spend / leads : 0
        });
      }
      console.log(`Platform breakdown: ${platformBreakdown.length} platforms`);
    }

    // ============= MELHORIA 4: Validação Cruzada com CRM =============
    let crmLeadsCount = 0;
    try {
      const { count, error: crmError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .in('source', ['Facebook Leads', 'facebook', 'Facebook', 'Meta Ads'])
        .gte('created_at', `${start_date}T00:00:00`)
        .lte('created_at', `${end_date}T23:59:59`);

      if (!crmError && count !== null) {
        crmLeadsCount = count;
        console.log(`CRM leads from Facebook in period: ${crmLeadsCount}`);
      }
    } catch (e) {
      console.error('Error fetching CRM leads count:', e);
    }

    const captureRate = totalLeads > 0 ? (crmLeadsCount / totalLeads) * 100 : 0;
    const crmValidation = {
      metaReportedLeads: totalLeads,
      crmReceivedLeads: crmLeadsCount,
      captureRate: captureRate,
      discrepancy: totalLeads - crmLeadsCount
    };

    // Processar dados DIÁRIOS para gráficos
    const dailyChartData: Record<string, { date: string; spend: number; leads: number; cpl: number }> = {};

    if (dailyData.data) {
      for (const record of dailyData.data) {
        const spend = parseFloat(record.spend || '0');
        const { leads } = calculateLeadsFromActions(record.actions, record.conversions);
        const dateStart = record.date_start;

        if (dateStart) {
          if (!dailyChartData[dateStart]) {
            dailyChartData[dateStart] = { date: dateStart, spend: 0, leads: 0, cpl: 0 };
          }
          dailyChartData[dateStart].spend += spend;
          dailyChartData[dateStart].leads += leads;
        }
      }
    }

    // Calcular métricas finais
    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;

    console.log(`\n=== TOTALS ===`);
    console.log(`Spend: ${totalSpend}, Leads: ${totalLeads}, Reach: ${totalReach}, CPL: ${avgCPL}`);
    console.log(`CRM Validation: Meta=${totalLeads}, CRM=${crmLeadsCount}, Rate=${captureRate.toFixed(1)}%`);

    const chartData = Object.values(dailyChartData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const campaignBreakdown = Object.values(campaignData)
      .filter(c => c.spend > 0)
      .map(c => ({
        id: c.id,
        name: c.name,
        spend: c.spend,
        leads: c.leads,
        reach: c.reach,
        impressions: c.impressions,
        clicks: c.clicks,
        leadType: c.leadType,
        leadTypeName: getLeadTypeName(c.leadType),
        cpl: c.costPerLead > 0 ? c.costPerLead : (c.leads > 0 ? c.spend / c.leads : 0),
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        // MELHORIA 5: Métricas de qualidade
        frequency: c.frequency,
        outboundClicks: c.outboundClicks,
        landingPageViews: c.landingPageViews,
        qualityRanking: c.qualityRanking,
        engagementRanking: c.engagementRanking,
        conversionRanking: c.conversionRanking,
        // MELHORIA 6: Objetivo
        objective: c.objective,
        objectiveName: c.objectiveName,
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 15);

    const result = {
      totalSpend,
      totalReach,
      totalImpressions,
      totalClicks,
      totalLeads,
      avgCPL,
      avgCPC,
      avgCTR,
      // MELHORIA 5: Métricas globais de qualidade
      avgFrequency,
      totalLandingPageViews,
      totalOutboundClicks,
      chartData,
      campaignBreakdown,
      // MELHORIA 3: Breakdown por plataforma
      platformBreakdown,
      // MELHORIA 4: Validação CRM
      crmValidation,
    };

    console.log('Processed ads insights successfully');

    return new Response(
      JSON.stringify({ data: result, error: null, selectedAccount, availableAccounts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error fetching ads insights:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, data: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
