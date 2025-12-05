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
  'onsite_conversion.total_messaging_connection', // PRINCIPAL - "Conversa por mensagem iniciada"
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

// Função para obter nome amigável do tipo de lead
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
  
  // Conversões customizadas
  if (leadType.includes('offsite_conversion.custom.') || leadType.includes('omni_custom')) {
    return 'Personalizada';
  }
  
  // Para outros tipos, retornar versão simplificada
  const simplified = leadType.split('.').pop()?.replace(/_/g, ' ') || leadType;
  return simplified.charAt(0).toUpperCase() + simplified.slice(1);
};

// Função para calcular leads com priorização (evita dupla contagem)
// Também verifica conversões customizadas como fallback
const calculateLeadsFromActions = (actions: any[], conversions?: any[]): { leads: number; leadType: string } => {
  if (!actions || actions.length === 0) {
    // Se não há actions, verificar conversões customizadas
    if (conversions && conversions.length > 0) {
      const customConversion = conversions[0];
      console.log(`Using custom conversion (no actions): ${customConversion.action_type} = ${customConversion.value}`);
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

  // Prioridade 5: Conversões customizadas DENTRO de actions
  // action_type começa com 'offsite_conversion.custom.' ou 'omni_custom'
  for (const action of actions) {
    if (action.action_type.startsWith('offsite_conversion.custom.') || 
        action.action_type.startsWith('omni_custom')) {
      console.log(`Found custom conversion in actions: ${action.action_type} = ${action.value}`);
      return { 
        leads: parseInt(action.value || '0', 10), 
        leadType: action.action_type 
      };
    }
  }

  // Prioridade 6: Conversões customizadas no campo conversions (fallback final)
  if (conversions && conversions.length > 0) {
    const customConversion = conversions[0];
    console.log(`Fallback to conversions field: ${customConversion.action_type} = ${customConversion.value}`);
    return {
      leads: parseInt(customConversion.value || '0', 10),
      leadType: customConversion.action_type
    };
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
      'cost_per_action_type',
      'conversions',           // Conversões customizadas (eventos personalizados)
      'action_values',         // Valores de ações
      'conversion_values'      // Valores de conversões
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
      impressions: number;
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

        // DEBUG: Log detalhado por campanha com TODOS os action_types
        console.log(`\n=== Campaign "${record.campaign_name}" (${record.campaign_id}) ===`);
        console.log(`  Spend: ${spend}, Reach: ${reach}, Impressions: ${impressions}, Clicks: ${clicks}`);
        
        if (record.actions && record.actions.length > 0) {
          console.log(`  ALL Actions (${record.actions.length} total):`);
          record.actions.forEach((a: any) => {
            console.log(`    - ${a.action_type}: ${a.value}`);
          });
        } else {
          console.log(`  No actions found`);
        }
        
        if (record.conversions && record.conversions.length > 0) {
          console.log(`  Custom Conversions:`);
          record.conversions.forEach((c: any) => {
            console.log(`    - ${c.action_type}: ${c.value}`);
          });
        }

        // Calcular leads com priorização (incluindo conversões customizadas como fallback)
        const { leads, leadType } = calculateLeadsFromActions(record.actions, record.conversions);
        totalLeads += leads;

        if (leadType) {
          console.log(`  → SELECTED: ${leadType} = ${leads} (${getLeadTypeName(leadType)})`);
        } else {
          console.log(`  → No lead conversion found`);
        }

        // Obter CPL do Meta para o tipo de lead específico
        const costPerLead = getLeadCostFromActions(record.cost_per_action_type, leadType);

        // Agregar por campaign_id para evitar duplicação
        const campaignId = record.campaign_id || '';
        const campaignName = record.campaign_name || 'Unknown';
        const campaignKey = campaignId || campaignName;
        
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
            costPerLead: 0
          };
        }
        
        campaignData[campaignKey].spend += spend;
        campaignData[campaignKey].leads += leads;
        campaignData[campaignKey].reach += reach;
        campaignData[campaignKey].impressions += impressions;
        campaignData[campaignKey].clicks += clicks;
        // Manter o leadType mais recente (ou o que tem valor)
        if (leadType) {
          campaignData[campaignKey].leadType = leadType;
        }
        // Atualizar CPL do Meta se disponível
        if (costPerLead > 0) {
          campaignData[campaignKey].costPerLead = costPerLead;
        }
      }
    }

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

    console.log(`\n=== TOTALS ===`);
    console.log(`Spend: ${totalSpend}, Leads: ${totalLeads}, Reach: ${totalReach}, Impressions: ${totalImpressions}, CPL: ${avgCPL}, CTR: ${avgCTR}`);

    const chartData = Object.values(dailyChartData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // CORRIGIDO: Filtrar por spend > 0 (mostrar todas campanhas com gasto)
    const campaignBreakdown = Object.values(campaignData)
      .filter(c => c.spend > 0) // Mostrar todas com gasto, mesmo sem leads
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
        // CPL: usar do Meta se disponível, senão calcular
        cpl: c.costPerLead > 0 ? c.costPerLead : (c.leads > 0 ? c.spend / c.leads : 0),
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
