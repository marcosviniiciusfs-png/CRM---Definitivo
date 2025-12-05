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

// Lista completa de action_types considerados como "leads"
const LEAD_ACTION_TYPES = [
  // Formulários Lead Ads
  'lead',
  'leadgen_grouped',
  'onsite_conversion.lead_grouped',
  'onsite_conversion.messaging_conversation_started_7d_lead',
  
  // WhatsApp / Mensagens
  'onsite_conversion.messaging_conversation_started_7d',
  'onsite_conversion.messaging_first_reply',
  'messaging_first_reply',
  'messaging_conversation_started_7d',
  'contact_total',
  'contact',
  'onsite_web_app_click_to_call_contact',
  
  // Pixel de Lead
  'offsite_conversion.fb_pixel_lead',
  'omni_lead',
  
  // Conversões gerais que podem ser leads
  'omni_complete_registration',
  'complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
  
  // Outros tipos de conversão
  'onsite_conversion.post_save',
  'onsite_conversion.messaging_block',
  'link_click',
];

// Prefixos para eventos personalizados do pixel
const CUSTOM_EVENT_PREFIXES = [
  'offsite_conversion.custom.',
];

// Função para verificar se um action_type é considerado lead
const isLeadAction = (actionType: string): boolean => {
  // Verifica se está na lista direta
  if (LEAD_ACTION_TYPES.includes(actionType)) return true;
  
  // Verifica se é um evento personalizado
  for (const prefix of CUSTOM_EVENT_PREFIXES) {
    if (actionType.startsWith(prefix)) return true;
  }
  
  return false;
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

    const insightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&access_token=${access_token}`;

    console.log('Fetching insights from Meta API...');
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    if (insightsData.error) {
      console.error('Meta API error:', insightsData.error);
      return new Response(
        JSON.stringify({ 
          error: insightsData.error.message, 
          data: null,
          selectedAccount,
          availableAccounts 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Received ${insightsData.data?.length || 0} insight records`);

    let totalSpend = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalLeadCost = 0;

const dailyData: Record<string, { date: string; spend: number; leads: number; cpl: number }> = {};
    const campaignData: Record<string, { id: string; name: string; spend: number; leads: number; reach: number; clicks: number }> = {};

    if (insightsData.data) {
      for (const record of insightsData.data) {
        const spend = parseFloat(record.spend || '0');
        const reach = parseInt(record.reach || '0', 10);
        const impressions = parseInt(record.impressions || '0', 10);
        const clicks = parseInt(record.clicks || '0', 10);

        totalSpend += spend;
        totalReach += reach;
        totalImpressions += impressions;
        totalClicks += clicks;

        // Extrair leads de TODOS os tipos de ações considerados leads
        let leads = 0;
        let leadCost = 0;
        const foundLeadTypes: string[] = [];
        
        if (record.actions) {
          // Log all action types for debugging
          const allActionTypes = record.actions.map((a: any) => `${a.action_type}:${a.value}`);
          console.log(`Campaign "${record.campaign_name}" actions:`, allActionTypes.join(', '));
          
          // Somar todos os tipos de leads encontrados
          for (const action of record.actions) {
            if (isLeadAction(action.action_type)) {
              const actionLeads = parseInt(action.value || '0', 10);
              leads += actionLeads;
              foundLeadTypes.push(`${action.action_type}=${actionLeads}`);
            }
          }
          
          if (foundLeadTypes.length > 0) {
            console.log(`Campaign "${record.campaign_name}" lead actions found:`, foundLeadTypes.join(', '));
          }
        }

        // Calcular custo por lead baseado em cost_per_action_type
        if (record.cost_per_action_type && leads > 0) {
          let totalCostForLeads = 0;
          let leadActionsWithCost = 0;
          
          for (const costAction of record.cost_per_action_type) {
            if (isLeadAction(costAction.action_type)) {
              // Encontrar a quantidade de ações correspondente
              const matchingAction = record.actions?.find((a: any) => a.action_type === costAction.action_type);
              const actionCount = matchingAction ? parseInt(matchingAction.value || '0', 10) : 0;
              
              if (actionCount > 0) {
                const costPerAction = parseFloat(costAction.value || '0');
                totalCostForLeads += costPerAction * actionCount;
                leadActionsWithCost += actionCount;
                console.log(`Cost for ${costAction.action_type}: ${costPerAction} x ${actionCount} = ${costPerAction * actionCount}`);
              }
            }
          }
          
          // Usar o custo total calculado
          leadCost = leads > 0 ? totalCostForLeads / leads : 0;
        }

        totalLeads += leads;
        totalLeadCost += leadCost * leads;

        // Aggregate by date
        const dateStart = record.date_start;
        if (dateStart) {
          if (!dailyData[dateStart]) {
            dailyData[dateStart] = { date: dateStart, spend: 0, leads: 0, cpl: 0 };
          }
          dailyData[dateStart].spend += spend;
          dailyData[dateStart].leads += leads;
        }

// Aggregate by campaign
        const campaignName = record.campaign_name || 'Unknown';
        const campaignId = record.campaign_id || '';
        if (!campaignData[campaignName]) {
          campaignData[campaignName] = { id: campaignId, name: campaignName, spend: 0, leads: 0, reach: 0, clicks: 0 };
        }
        // Keep the first campaign_id found (they should all be the same for same campaign name)
        if (!campaignData[campaignName].id && campaignId) {
          campaignData[campaignName].id = campaignId;
        }
        campaignData[campaignName].spend += spend;
        campaignData[campaignName].leads += leads;
        campaignData[campaignName].reach += reach;
        campaignData[campaignName].clicks += clicks;
      }
    }

    // Calcular CPL médio corretamente
    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    console.log(`Totals - Spend: ${totalSpend}, Leads: ${totalLeads}, CPL: ${avgCPL}`);

    const chartData = Object.values(dailyData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const campaignBreakdown = Object.values(campaignData)
      .map(c => ({
        ...c,
        cpl: c.leads > 0 ? c.spend / c.leads : 0,
        ctr: c.reach > 0 ? (c.clicks / c.reach) * 100 : 0
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
