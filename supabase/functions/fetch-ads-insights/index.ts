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

// Tipos de leads por prioridade (NÃO somar, usar apenas um tipo por campanha)
// Prioridade 1: Formulários Lead Ads
const FORM_LEAD_TYPES = [
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
];

// Prioridade 2: Conversões de mensagem/WhatsApp (expandido)
const MESSAGING_LEAD_TYPES = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'messaging_first_reply',
  'onsite_conversion.messaging_first_reply',
  'onsite_conversion.messaging_user_depth_2_message_send',
  'onsite_conversion.messaging_user_depth_3_message_send',
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

// Função para calcular leads com priorização (evita dupla contagem)
const calculateLeadsFromActions = (actions: any[]): { leads: number; leadType: string } => {
  if (!actions || actions.length === 0) {
    return { leads: 0, leadType: '' };
  }

  // Prioridade 1: Formulários Lead Ads
  for (const action of actions) {
    if (FORM_LEAD_TYPES.includes(action.action_type)) {
      return { 
        leads: parseInt(action.value || '0', 10), 
        leadType: action.action_type 
      };
    }
  }

  // Prioridade 2: Conversões de mensagem/WhatsApp
  for (const action of actions) {
    if (MESSAGING_LEAD_TYPES.includes(action.action_type)) {
      return { 
        leads: parseInt(action.value || '0', 10), 
        leadType: action.action_type 
      };
    }
  }

  // Prioridade 3: Pixel de Lead
  for (const action of actions) {
    if (PIXEL_LEAD_TYPES.includes(action.action_type)) {
      return { 
        leads: parseInt(action.value || '0', 10), 
        leadType: action.action_type 
      };
    }
  }

  // Prioridade 4: Conversões de registro
  for (const action of actions) {
    if (REGISTRATION_LEAD_TYPES.includes(action.action_type)) {
      return { 
        leads: parseInt(action.value || '0', 10), 
        leadType: action.action_type 
      };
    }
  }

  return { leads: 0, leadType: '' };
};

// Função para obter custo por lead do tipo específico (usando cost_per_action_type do Meta)
const getLeadCostFromActions = (costActions: any[], leadType: string): number => {
  if (!costActions || !leadType) return 0;
  
  const costAction = costActions.find((c: any) => c.action_type === leadType);
  return costAction ? parseFloat(costAction.value || '0') : 0;
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
        JSON.stringify({ 
          error: 'No ad account configured', 
          data: null,
          availableAccounts 
        }),
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
      'cost_per_action_type'
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });

    // CHAMADA 1: Com time_increment=1 para dados diários (gráficos)
    const dailyInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&access_token=${access_token}`;

    // CHAMADA 2: Sem time_increment para totais agregados corretos (especialmente reach)
    const aggregatedInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&access_token=${access_token}`;

    console.log('Fetching daily and aggregated insights from Meta API...');
    
    // Fazer ambas chamadas em paralelo
    const [dailyResponse, aggregatedResponse] = await Promise.all([
      fetch(dailyInsightsUrl),
      fetch(aggregatedInsightsUrl)
    ]);

    const [dailyData, aggregatedData] = await Promise.all([
      dailyResponse.json(),
      aggregatedResponse.json()
    ]);

    if (dailyData.error) {
      console.error('Meta API error (daily):', dailyData.error);
      return new Response(
        JSON.stringify({ 
          error: dailyData.error.message, 
          data: null,
          selectedAccount,
          availableAccounts 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (aggregatedData.error) {
      console.error('Meta API error (aggregated):', aggregatedData.error);
      return new Response(
        JSON.stringify({ 
          error: aggregatedData.error.message, 
          data: null,
          selectedAccount,
          availableAccounts 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Received ${dailyData.data?.length || 0} daily records and ${aggregatedData.data?.length || 0} aggregated records`);

    // Processar dados AGREGADOS para totais corretos
    let totalSpend = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;

    const campaignData: Record<string, { 
      id: string; 
      name: string; 
      spend: number; 
      leads: number; 
      reach: number;
      impressions: number; // ADICIONADO
      clicks: number;
      leadType: string;
      costPerLead: number; // CPL do Meta
    }> = {};

    // Processar dados agregados para totais e breakdown de campanhas
    if (aggregatedData.data) {
      for (const record of aggregatedData.data) {
        const spend = parseFloat(record.spend || '0');
        const reach = parseInt(record.reach || '0', 10);
        const impressions = parseInt(record.impressions || '0', 10);
        const clicks = parseInt(record.clicks || '0', 10);

        totalSpend += spend;
        totalReach += reach; // Reach agregado correto (não soma diária)
        totalImpressions += impressions;
        totalClicks += clicks;

        // Calcular leads com priorização
        const { leads, leadType } = calculateLeadsFromActions(record.actions);
        totalLeads += leads;

        // DEBUG: Log detalhado por campanha
        if (record.actions && record.actions.length > 0) {
          console.log(`Campaign "${record.campaign_name}" - Actions:`, JSON.stringify(record.actions.slice(0, 5)));
        }
        if (record.cost_per_action_type && record.cost_per_action_type.length > 0) {
          console.log(`Campaign "${record.campaign_name}" - Cost per action:`, JSON.stringify(record.cost_per_action_type.slice(0, 5)));
        }

        if (leadType) {
          console.log(`Campaign "${record.campaign_name}" - Lead type: ${leadType}, Count: ${leads}`);
        }

        // Obter CPL do Meta para o tipo de lead específico
        const costPerLead = getLeadCostFromActions(record.cost_per_action_type, leadType);

        // Agregar por campanha
        const campaignName = record.campaign_name || 'Unknown';
        const campaignId = record.campaign_id || '';
        
        if (!campaignData[campaignName]) {
          campaignData[campaignName] = { 
            id: campaignId, 
            name: campaignName, 
            spend: 0, 
            leads: 0, 
            reach: 0,
            impressions: 0, // ADICIONADO
            clicks: 0,
            leadType: '',
            costPerLead: 0
          };
        }
        
        if (!campaignData[campaignName].id && campaignId) {
          campaignData[campaignName].id = campaignId;
        }
        
        campaignData[campaignName].spend += spend;
        campaignData[campaignName].leads += leads;
        campaignData[campaignName].reach += reach;
        campaignData[campaignName].impressions += impressions; // ADICIONADO
        campaignData[campaignName].clicks += clicks;
        campaignData[campaignName].leadType = leadType;
        // Atualizar CPL do Meta se disponível
        if (costPerLead > 0) {
          campaignData[campaignName].costPerLead = costPerLead;
        }
      }
    }

    // Processar dados DIÁRIOS para gráficos
    const dailyChartData: Record<string, { date: string; spend: number; leads: number; cpl: number }> = {};

    if (dailyData.data) {
      for (const record of dailyData.data) {
        const spend = parseFloat(record.spend || '0');
        const { leads } = calculateLeadsFromActions(record.actions);
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
    // CORRIGIDO: CTR = cliques / impressões * 100 (não reach)
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    console.log(`Totals - Spend: ${totalSpend}, Leads: ${totalLeads}, Reach: ${totalReach}, Impressions: ${totalImpressions}, CPL: ${avgCPL}, CTR: ${avgCTR}`);

    const chartData = Object.values(dailyChartData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const campaignBreakdown = Object.values(campaignData)
      .map(c => ({
        id: c.id,
        name: c.name,
        spend: c.spend,
        leads: c.leads,
        reach: c.reach,
        impressions: c.impressions, // ADICIONADO
        clicks: c.clicks,
        // CPL: usar do Meta se disponível, senão calcular
        cpl: c.costPerLead > 0 ? c.costPerLead : (c.leads > 0 ? c.spend / c.leads : 0),
        // CORRIGIDO: CTR = cliques / impressões * 100 (não reach)
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    const result = {
      totalSpend,
      totalReach,
      totalImpressions,
      totalClicks,
      totalLeads,
      avgCPL,
      avgCPC,
      avgCTR,
      chartData,
      campaignBreakdown
    };

    console.log('Processed ads insights successfully');

    return new Response(
      JSON.stringify({ 
        data: result, 
        error: null,
        selectedAccount,
        availableAccounts 
      }),
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
