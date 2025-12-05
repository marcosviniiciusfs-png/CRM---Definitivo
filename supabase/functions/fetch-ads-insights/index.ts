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

// ============= CORREÇÃO CRÍTICA: Mapear objetivo para tipos de lead esperados =============
const getLeadTypesForObjective = (objective: string): string[] | null => {
  switch (objective) {
    // Campanhas de FORMULÁRIO
    case 'LEAD_GENERATION':
    case 'OUTCOME_LEADS':
      return ['lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped'];
    
    // Campanhas de MENSAGENS (WhatsApp, Messenger, Instagram DM)
    case 'MESSAGES':
      return [
        'onsite_conversion.messaging_conversation_started_7d',
        'messaging_conversation_started_7d',
        'onsite_conversion.total_messaging_connection',
        'messaging_first_reply',
        'onsite_conversion.messaging_first_reply',
        'onsite_conversion.messaging_user_depth_2_message_send',
        'onsite_conversion.messaging_user_depth_3_message_send',
      ];
    
    // Campanhas de CONVERSÕES (Pixel)
    case 'CONVERSIONS':
    case 'OUTCOME_SALES':
      return [
        'offsite_conversion.fb_pixel_lead',
        'omni_lead',
        'offsite_conversion.fb_pixel_purchase',
        'omni_purchase',
        'complete_registration',
        'offsite_conversion.fb_pixel_complete_registration',
      ];
    
    // Campanhas de ENGAJAMENTO podem ter mensagens ou leads
    case 'OUTCOME_ENGAGEMENT':
    case 'POST_ENGAGEMENT':
      return [
        'onsite_conversion.messaging_conversation_started_7d',
        'lead',
        'post_engagement',
        'page_engagement',
      ];
    
    // Campanhas de TRÁFEGO
    case 'OUTCOME_TRAFFIC':
    case 'LINK_CLICKS':
      return ['link_click', 'landing_page_view'];
    
    default:
      return null; // Usar priorização padrão
  }
};

// Função para obter nome amigável do tipo de lead
const getLeadTypeName = (leadType: string): string => {
  if (!leadType) return '';
  
  // WhatsApp / Mensagens
  if (leadType.includes('messaging') || leadType.includes('total_messaging_connection')) {
    return 'Mensagem';
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
  
  // Conversões customizadas
  if (leadType.includes('offsite_conversion.custom.') || leadType.includes('omni_custom')) {
    return 'Personalizada';
  }
  
  // Instagram
  if (leadType.includes('instagram')) {
    return 'Instagram';
  }
  
  // Contato/Agendamento
  if (leadType.includes('contact') || leadType === 'schedule') {
    return 'Contato';
  }
  
  // Link clicks / traffic
  if (leadType === 'link_click' || leadType === 'landing_page_view') {
    return 'Clique';
  }
  
  // Para outros tipos, retornar versão simplificada
  const simplified = leadType.split('.').pop()?.replace(/_/g, ' ') || leadType;
  return simplified.charAt(0).toUpperCase() + simplified.slice(1);
};

// ============= CORREÇÃO CRÍTICA: Calcular leads BASEADO NO OBJETIVO =============
const calculateLeadsFromActions = (
  actions: any[], 
  conversions: any[],
  objective: string
): { leads: number; leadType: string } => {
  if (!actions || actions.length === 0) {
    // Tentar em conversions se actions vazio
    if (conversions && conversions.length > 0) {
      const conv = conversions[0];
      return {
        leads: parseInt(conv.value || '0', 10),
        leadType: conv.action_type || ''
      };
    }
    return { leads: 0, leadType: '' };
  }

  // Log todas as ações disponíveis
  const actionSummary = actions.slice(0, 15).map((a: any) => `${a.action_type}:${a.value}`).join(', ');
  console.log(`    [ACTIONS] Objetivo=${objective || 'N/A'}, Disponíveis: ${actionSummary}`);

  // ============= PASSO 1: Tentar pelo OBJETIVO da campanha PRIMEIRO =============
  if (objective) {
    const expectedTypes = getLeadTypesForObjective(objective);
    if (expectedTypes) {
      for (const expectedType of expectedTypes) {
        for (const action of actions) {
          // Match exato ou por prefixo (para conversões custom)
          if (action.action_type === expectedType || action.action_type.startsWith(expectedType)) {
            const value = parseInt(action.value || '0', 10);
            if (value > 0) {
              console.log(`    [MATCH] Por objetivo ${objective}: ${action.action_type}=${value}`);
              return { leads: value, leadType: action.action_type };
            }
          }
        }
      }
      console.log(`    [INFO] Nenhum match para objetivo ${objective}, usando fallback...`);
    }
  }

  // ============= PASSO 2: FALLBACK - Priorização padrão =============
  const priorityOrder = [
    // Formulários
    'lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped',
    // Mensagens
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_first_reply',
    'onsite_conversion.messaging_first_reply',
    // Pixel
    'offsite_conversion.fb_pixel_lead',
    'omni_lead',
    // Registro
    'complete_registration',
    'offsite_conversion.fb_pixel_complete_registration',
    // Contato
    'contact', 'contact_total', 'schedule', 'submit_application',
  ];

  for (const actionType of priorityOrder) {
    for (const action of actions) {
      if (action.action_type === actionType) {
        const value = parseInt(action.value || '0', 10);
        if (value > 0) {
          console.log(`    [FALLBACK] ${action.action_type}=${value}`);
          return { leads: value, leadType: action.action_type };
        }
      }
    }
  }

  // ============= PASSO 3: Conversões customizadas =============
  for (const action of actions) {
    if (action.action_type.startsWith('offsite_conversion.custom.') || 
        action.action_type.startsWith('omni_custom')) {
      const value = parseInt(action.value || '0', 10);
      if (value > 0) {
        console.log(`    [CUSTOM] ${action.action_type}=${value}`);
        return { leads: value, leadType: action.action_type };
      }
    }
  }

  // ============= PASSO 4: Tentar em conversions =============
  if (conversions && conversions.length > 0) {
    const conv = conversions[0];
    const value = parseInt(conv.value || '0', 10);
    if (value > 0) {
      console.log(`    [CONVERSIONS] ${conv.action_type}=${value}`);
      return { leads: value, leadType: conv.action_type };
    }
  }

  console.log(`    [NONE] Nenhum lead encontrado`);
  return { leads: 0, leadType: '' };
};

// Função para obter custo por lead
const getLeadCostFromActions = (costActions: any[], leadType: string): number => {
  if (!costActions || !leadType) return 0;
  const costAction = costActions.find((c: any) => c.action_type === leadType);
  return costAction ? parseFloat(costAction.value || '0') : 0;
};

// Mapeamento de Objetivos para nomes amigáveis
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

// Nome da Plataforma
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

// ============= FUNÇÃO DE PAGINAÇÃO COMPLETA =============
const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const allData: any[] = [];
  let url: string | null = baseUrl;
  let pageCount = 0;
  const maxPages = 20; // Limite de segurança

  while (url && pageCount < maxPages) {
    try {
      const fetchResponse: Response = await fetch(url);
      const jsonData: any = await fetchResponse.json();

      if (jsonData.error) {
        console.error(`[PAGINATION] Erro na página ${pageCount + 1}:`, jsonData.error.message);
        break;
      }

      if (jsonData.data && jsonData.data.length > 0) {
        allData.push(...jsonData.data);
        console.log(`[PAGINATION] Página ${pageCount + 1}: ${jsonData.data.length} registros`);
      }

      // Verificar próxima página
      url = jsonData.paging?.next || null;
      pageCount++;
    } catch (err) {
      console.error(`[PAGINATION] Erro ao buscar página ${pageCount + 1}:`, err);
      break;
    }
  }

  console.log(`[PAGINATION] Total: ${allData.length} registros em ${pageCount} página(s)`);
  return allData;
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

    console.log(`\n========== FETCH ADS INSIGHTS ==========`);
    console.log(`Org: ${organization_id}, Período: ${start_date} a ${end_date}`);

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

    console.log(`Conta de Anúncios: ${selectedAccountId} (${selectedAccount.name})`);

    // Campos de insights
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
      'outbound_clicks',
      'inline_link_clicks',
      'frequency',
      'quality_ranking',
      'engagement_rate_ranking',
      'conversion_rate_ranking',
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });

    // Janela de Atribuição padrão do Meta
    const attributionWindows = encodeURIComponent('["7d_click","1d_view"]');

    // ============= PASSO 1: Buscar dados AGREGADOS por campanha (com paginação) =============
    const aggregatedInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&action_attribution_windows=${attributionWindows}` +
      `&limit=500` +
      `&access_token=${access_token}`;

    console.log(`\n[STEP 1] Buscando insights agregados por campanha...`);
    const aggregatedData = await fetchAllPages(aggregatedInsightsUrl);

    if (!aggregatedData || aggregatedData.length === 0) {
      console.log('Nenhum dado encontrado para o período');
      return new Response(
        JSON.stringify({ 
          data: {
            totalSpend: 0, totalReach: 0, totalImpressions: 0, totalClicks: 0, totalLeads: 0,
            avgCPL: 0, avgCPC: 0, avgCTR: 0, avgFrequency: 0,
            chartData: [], campaignBreakdown: [], platformBreakdown: [],
            crmValidation: { metaReportedLeads: 0, crmReceivedLeads: 0, captureRate: 0, discrepancy: 0 }
          },
          error: null, selectedAccount, availableAccounts 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ============= PASSO 2: Extrair IDs de campanhas e buscar OBJETIVOS =============
    const campaignIds = [...new Set(aggregatedData.map((r: any) => r.campaign_id).filter(Boolean))];
    console.log(`\n[STEP 2] Buscando objetivos de ${campaignIds.length} campanhas...`);

    const campaignObjectives: Record<string, { objective: string; optimization_goal: string }> = {};

    // Buscar objetivos em lotes de 50 (limite da API)
    for (let i = 0; i < campaignIds.length; i += 50) {
      const batch = campaignIds.slice(i, i + 50);
      try {
        const campaignsUrl = `https://graph.facebook.com/v18.0/?ids=${batch.join(',')}&fields=objective,optimization_goal&access_token=${access_token}`;
        const campaignsResponse = await fetch(campaignsUrl);
        const campaignsData = await campaignsResponse.json();
        
        if (!campaignsData.error) {
          for (const [id, data] of Object.entries(campaignsData)) {
            campaignObjectives[id] = {
              objective: (data as any).objective || '',
              optimization_goal: (data as any).optimization_goal || ''
            };
          }
        }
      } catch (e) {
        console.error(`Erro ao buscar objetivos (lote ${i}):`, e);
      }
    }

    console.log(`Objetivos obtidos: ${Object.keys(campaignObjectives).length} campanhas`);

    // ============= PASSO 3: Processar dados agregados COM objetivos =============
    console.log(`\n[STEP 3] Processando campanhas...`);

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
      frequency: number;
      outboundClicks: number;
      landingPageViews: number;
      qualityRanking: string;
      engagementRanking: string;
      conversionRanking: string;
      objective: string;
      objectiveName: string;
    }> = {};

    for (const record of aggregatedData) {
      const campaignId = record.campaign_id || '';
      const campaignName = record.campaign_name || 'Unknown';
      const campaignKey = campaignId || campaignName;

      // OBTER OBJETIVO DA CAMPANHA
      const objective = campaignObjectives[campaignId]?.objective || '';
      const objectiveName = objectiveToName[objective] || objective || 'Outro';

      console.log(`\n  === ${campaignName} (${campaignId}) ===`);
      console.log(`    Objetivo: ${objective} (${objectiveName})`);

      const spend = parseFloat(record.spend || '0');
      const reach = parseInt(record.reach || '0', 10);
      const impressions = parseInt(record.impressions || '0', 10);
      const clicks = parseInt(record.clicks || '0', 10);
      const frequency = parseFloat(record.frequency || '0');

      // Landing page views from actions
      const lpvAction = record.actions?.find((a: any) => a.action_type === 'landing_page_view');
      const landingPageViews = lpvAction ? parseInt(lpvAction.value || '0', 10) : 0;

      // Outbound clicks
      const outboundClicks = record.outbound_clicks?.[0]?.value 
        ? parseInt(record.outbound_clicks[0].value, 10) 
        : 0;

      // ============= CALCULAR LEADS USANDO O OBJETIVO =============
      const { leads, leadType } = calculateLeadsFromActions(
        record.actions || [], 
        record.conversions || [],
        objective // <-- PASSANDO O OBJETIVO
      );

      const costPerLead = getLeadCostFromActions(record.cost_per_action_type, leadType);

      // Agregar totais
      totalSpend += spend;
      totalReach += reach;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalLeads += leads;
      totalLandingPageViews += landingPageViews;
      totalOutboundClicks += outboundClicks;

      // Agregar por campanha
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
          objective: objective,
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

    // ============= PASSO 4: Dados DIÁRIOS para gráficos =============
    console.log(`\n[STEP 4] Buscando dados diários para gráficos...`);

    const dailyInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=spend,actions,conversions` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&action_attribution_windows=${attributionWindows}` +
      `&limit=500` +
      `&access_token=${access_token}`;

    const dailyData = await fetchAllPages(dailyInsightsUrl);

    const dailyChartData: Record<string, { date: string; spend: number; leads: number; cpl: number }> = {};

    for (const record of dailyData) {
      const spend = parseFloat(record.spend || '0');
      const dateStart = record.date_start;
      const campaignId = record.campaign_id || '';
      
      // Usar objetivo da campanha para calcular leads
      const objective = campaignObjectives[campaignId]?.objective || '';
      const { leads } = calculateLeadsFromActions(
        record.actions || [], 
        record.conversions || [],
        objective
      );

      if (dateStart) {
        if (!dailyChartData[dateStart]) {
          dailyChartData[dateStart] = { date: dateStart, spend: 0, leads: 0, cpl: 0 };
        }
        dailyChartData[dateStart].spend += spend;
        dailyChartData[dateStart].leads += leads;
      }
    }

    // ============= PASSO 5: Breakdown por Plataforma =============
    console.log(`\n[STEP 5] Buscando breakdown por plataforma...`);

    const platformBreakdownUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=spend,reach,impressions,clicks,actions,cost_per_action_type` +
      `&level=account` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&breakdowns=publisher_platform` +
      `&action_attribution_windows=${attributionWindows}` +
      `&access_token=${access_token}`;

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
    
    try {
      const platformResponse = await fetch(platformBreakdownUrl);
      const platformData = await platformResponse.json();
      
      if (platformData.data && !platformData.error) {
        for (const record of platformData.data) {
          const platform = record.publisher_platform || 'unknown';
          const spend = parseFloat(record.spend || '0');
          const { leads } = calculateLeadsFromActions(record.actions || [], [], '');
          
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
      }
    } catch (e) {
      console.error('Erro ao buscar plataformas:', e);
    }

    // ============= PASSO 6: Validação Cruzada com CRM =============
    console.log(`\n[STEP 6] Validação CRM...`);

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

    console.log(`CRM: Meta=${totalLeads}, CRM=${crmLeadsCount}, Taxa=${captureRate.toFixed(1)}%`);

    // ============= PASSO 7: Montar resposta final =============
    const chartData = Object.values(dailyChartData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Criar campaignBreakdown PRIMEIRO (sem limite de slice)
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
        frequency: c.frequency,
        outboundClicks: c.outboundClicks,
        landingPageViews: c.landingPageViews,
        qualityRanking: c.qualityRanking,
        engagementRanking: c.engagementRanking,
        conversionRanking: c.conversionRanking,
        objective: c.objective,
        objectiveName: c.objectiveName,
      }))
      .sort((a, b) => b.spend - a.spend);

    // ============= RECALCULAR TOTAIS BASEADO NO CAMPAIGN BREAKDOWN =============
    const finalTotalSpend = campaignBreakdown.reduce((sum, c) => sum + c.spend, 0);
    const finalTotalLeads = campaignBreakdown.reduce((sum, c) => sum + c.leads, 0);
    const finalTotalReach = campaignBreakdown.reduce((sum, c) => sum + c.reach, 0);
    const finalTotalImpressions = campaignBreakdown.reduce((sum, c) => sum + c.impressions, 0);
    const finalTotalClicks = campaignBreakdown.reduce((sum, c) => sum + c.clicks, 0);
    const finalTotalLandingPageViews = campaignBreakdown.reduce((sum, c) => sum + (c.landingPageViews || 0), 0);
    const finalTotalOutboundClicks = campaignBreakdown.reduce((sum, c) => sum + (c.outboundClicks || 0), 0);
    
    const finalAvgCPL = finalTotalLeads > 0 ? finalTotalSpend / finalTotalLeads : 0;
    const finalAvgCPC = finalTotalClicks > 0 ? finalTotalSpend / finalTotalClicks : 0;
    const finalAvgCTR = finalTotalImpressions > 0 ? (finalTotalClicks / finalTotalImpressions) * 100 : 0;
    const finalAvgFrequency = finalTotalReach > 0 ? finalTotalImpressions / finalTotalReach : 0;

    console.log(`\n========== TOTAIS (do campaignBreakdown) ==========`);
    console.log(`Campanhas: ${campaignBreakdown.length}`);
    console.log(`Spend: R$ ${finalTotalSpend.toFixed(2)}`);
    console.log(`Leads: ${finalTotalLeads}`);
    console.log(`CPL: R$ ${finalAvgCPL.toFixed(2)}`);
    console.log(`Reach: ${finalTotalReach}`);

    // Atualizar validação CRM com os totais corretos
    const finalCaptureRate = finalTotalLeads > 0 ? (crmLeadsCount / finalTotalLeads) * 100 : 0;
    const finalCrmValidation = {
      metaReportedLeads: finalTotalLeads,
      crmReceivedLeads: crmLeadsCount,
      captureRate: finalCaptureRate,
      discrepancy: finalTotalLeads - crmLeadsCount
    };

    const result = {
      totalSpend: finalTotalSpend,
      totalReach: finalTotalReach,
      totalImpressions: finalTotalImpressions,
      totalClicks: finalTotalClicks,
      totalLeads: finalTotalLeads,
      avgCPL: finalAvgCPL,
      avgCPC: finalAvgCPC,
      avgCTR: finalAvgCTR,
      avgFrequency: finalAvgFrequency,
      totalLandingPageViews: finalTotalLandingPageViews,
      totalOutboundClicks: finalTotalOutboundClicks,
      chartData,
      campaignBreakdown,
      platformBreakdown,
      crmValidation: finalCrmValidation,
    };

    console.log(`\n✓ Processado com sucesso: ${campaignBreakdown.length} campanhas`);

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
