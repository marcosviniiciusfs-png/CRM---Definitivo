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

// Função para descriptografar tokens
async function decryptToken(encryptedToken: string, key: string): Promise<string> {
  if (!encryptedToken || encryptedToken === 'ENCRYPTED_IN_TOKENS_TABLE') return '';
  
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    // Se falhar, pode ser token não criptografado (legado)
    return encryptedToken;
  }
}

// ============= CORREÇÃO CRÍTICA: Mapear objetivo para tipos de lead esperados =============
const getLeadTypesForObjective = (objective: string): string[] | null => {
  switch (objective) {
    case 'LEAD_GENERATION':
    case 'OUTCOME_LEADS':
      return ['lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped'];
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
    case 'OUTCOME_ENGAGEMENT':
    case 'POST_ENGAGEMENT':
      return [
        'onsite_conversion.messaging_conversation_started_7d',
        'lead',
        'post_engagement',
        'page_engagement',
      ];
    case 'OUTCOME_TRAFFIC':
    case 'LINK_CLICKS':
      return ['link_click', 'landing_page_view'];
    default:
      return null;
  }
};

const getLeadTypeName = (leadType: string): string => {
  if (!leadType) return '';
  if (leadType.includes('messaging') || leadType.includes('total_messaging_connection')) return 'Mensagem';
  if (leadType === 'lead' || leadType === 'leadgen_grouped' || leadType.includes('lead_grouped')) return 'Formulário';
  if (leadType.includes('fb_pixel_lead') || leadType === 'omni_lead') return 'Pixel';
  if (leadType.includes('registration')) return 'Registro';
  if (leadType.includes('offsite_conversion.custom.') || leadType.includes('omni_custom')) return 'Personalizada';
  if (leadType.includes('instagram')) return 'Instagram';
  if (leadType.includes('contact') || leadType === 'schedule') return 'Contato';
  if (leadType === 'link_click' || leadType === 'landing_page_view') return 'Clique';
  const simplified = leadType.split('.').pop()?.replace(/_/g, ' ') || leadType;
  return simplified.charAt(0).toUpperCase() + simplified.slice(1);
};

const calculateLeadsFromActions = (
  actions: any[], 
  conversions: any[],
  objective: string
): { leads: number; leadType: string } => {
  if (!actions || actions.length === 0) {
    if (conversions && conversions.length > 0) {
      const conv = conversions[0];
      return { leads: parseInt(conv.value || '0', 10), leadType: conv.action_type || '' };
    }
    return { leads: 0, leadType: '' };
  }

  const actionSummary = actions.slice(0, 15).map((a: any) => `${a.action_type}:${a.value}`).join(', ');
  console.log(`    [ACTIONS] Objetivo=${objective || 'N/A'}, Disponíveis: ${actionSummary}`);

  if (objective) {
    const expectedTypes = getLeadTypesForObjective(objective);
    if (expectedTypes) {
      for (const expectedType of expectedTypes) {
        for (const action of actions) {
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

  const priorityOrder = [
    'lead', 'leadgen_grouped', 'onsite_conversion.lead_grouped',
    'onsite_conversion.messaging_conversation_started_7d',
    'messaging_conversation_started_7d',
    'onsite_conversion.total_messaging_connection',
    'messaging_first_reply',
    'onsite_conversion.messaging_first_reply',
    'offsite_conversion.fb_pixel_lead',
    'omni_lead',
    'complete_registration',
    'offsite_conversion.fb_pixel_complete_registration',
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

const getLeadCostFromActions = (costActions: any[], leadType: string): number => {
  if (!costActions || !leadType) return 0;
  const costAction = costActions.find((c: any) => c.action_type === leadType);
  return costAction ? parseFloat(costAction.value || '0') : 0;
};

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

const fetchAllPages = async (baseUrl: string): Promise<any[]> => {
  const allData: any[] = [];
  let url: string | null = baseUrl;
  let pageCount = 0;
  const maxPages = 20;

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

    // Buscar tokens de forma segura
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';
    
    // Primeiro tentar a tabela segura de tokens
    const { data: secureTokens, error: secureError } = await supabase
      .from('facebook_integration_tokens')
      .select(`
        encrypted_access_token,
        integration:facebook_integrations!inner(
          id,
          organization_id,
          ad_account_id,
          ad_accounts
        )
      `)
      .eq('integration.organization_id', organization_id)
      .single();

    let access_token: string | null = null;
    let selectedAccountId: string | null = null;
    let availableAccounts: AdAccount[] = [];

    if (secureTokens && !secureError) {
      // Descriptografar token
      access_token = await decryptToken(secureTokens.encrypted_access_token, ENCRYPTION_KEY);
      const integration = secureTokens.integration as any;
      selectedAccountId = ad_account_id || integration?.ad_account_id;
      
      if (integration?.ad_accounts) {
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
    } else {
      // Fallback para tabela antiga (tokens legado)
      console.log('Fallback to legacy tokens table');
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

      // Verificar se é token criptografado ou legado
      if (integration.access_token && integration.access_token !== 'ENCRYPTED_IN_TOKENS_TABLE') {
        access_token = integration.access_token;
      }
      
      selectedAccountId = ad_account_id || integration.ad_account_id;
      
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
    }

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not found or expired', data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

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

    console.log(`Conta de Anúncios: ${selectedAccountId} (${selectedAccount.name})`);

    const insightsFields = [
      'campaign_id', 'campaign_name', 'reach', 'impressions', 'spend', 'clicks',
      'cpc', 'cpm', 'ctr', 'actions', 'cost_per_action_type', 'conversions',
      'action_values', 'conversion_values', 'outbound_clicks', 'inline_link_clicks',
      'frequency', 'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });
    const attributionWindows = encodeURIComponent('["7d_click","1d_view"]');

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

    const campaignIds = [...new Set(aggregatedData.map((r: any) => r.campaign_id).filter(Boolean))];
    console.log(`\n[STEP 2] Buscando objetivos de ${campaignIds.length} campanhas...`);

    const campaignObjectives: Record<string, { objective: string; optimization_goal: string }> = {};

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
    console.log(`\n[STEP 3] Processando campanhas...`);

    let totalSpend = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalLandingPageViews = 0;
    let totalOutboundClicks = 0;

    const campaignData: Record<string, any> = {};

    for (const record of aggregatedData) {
      const campaignId = record.campaign_id || '';
      const campaignName = record.campaign_name || 'Unknown';
      const campaignKey = campaignId || campaignName;

      const objective = campaignObjectives[campaignId]?.objective || '';
      const objectiveName = objectiveToName[objective] || objective || 'Outro';

      console.log(`\n  === ${campaignName} (${campaignId}) ===`);
      console.log(`    Objetivo: ${objective} (${objectiveName})`);

      const spend = parseFloat(record.spend || '0');
      const reach = parseInt(record.reach || '0', 10);
      const impressions = parseInt(record.impressions || '0', 10);
      const clicks = parseInt(record.clicks || '0', 10);
      const frequency = parseFloat(record.frequency || '0');

      const lpvAction = record.actions?.find((a: any) => a.action_type === 'landing_page_view');
      const landingPageViews = lpvAction ? parseInt(lpvAction.value || '0', 10) : 0;

      const outboundAction = record.outbound_clicks?.find((a: any) => a.action_type === 'outbound_click');
      const outboundClicks = outboundAction ? parseInt(outboundAction.value || '0', 10) : 0;

      const { leads, leadType } = calculateLeadsFromActions(record.actions, record.conversions, objective);
      const costPerLead = getLeadCostFromActions(record.cost_per_action_type, leadType);

      if (!campaignData[campaignKey]) {
        campaignData[campaignKey] = {
          id: campaignId, name: campaignName, spend: 0, leads: 0, reach: 0,
          impressions: 0, clicks: 0, leadType: '', costPerLead: 0, frequency: 0,
          outboundClicks: 0, landingPageViews: 0, qualityRanking: '',
          engagementRanking: '', conversionRanking: '', objective, objectiveName,
        };
      }

      campaignData[campaignKey].spend += spend;
      campaignData[campaignKey].leads += leads;
      campaignData[campaignKey].reach += reach;
      campaignData[campaignKey].impressions += impressions;
      campaignData[campaignKey].clicks += clicks;
      campaignData[campaignKey].outboundClicks += outboundClicks;
      campaignData[campaignKey].landingPageViews += landingPageViews;
      campaignData[campaignKey].leadType = leadType || campaignData[campaignKey].leadType;
      campaignData[campaignKey].costPerLead = costPerLead || campaignData[campaignKey].costPerLead;
      campaignData[campaignKey].frequency = frequency || campaignData[campaignKey].frequency;
      campaignData[campaignKey].qualityRanking = record.quality_ranking || '';
      campaignData[campaignKey].engagementRanking = record.engagement_rate_ranking || '';
      campaignData[campaignKey].conversionRanking = record.conversion_rate_ranking || '';

      totalSpend += spend;
      totalReach += reach;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalLeads += leads;
      totalLandingPageViews += landingPageViews;
      totalOutboundClicks += outboundClicks;
    }

    const campaignBreakdown = Object.values(campaignData)
      .map((c: any) => ({
        ...c,
        leadTypeName: getLeadTypeName(c.leadType),
        cpl: c.leads > 0 ? c.spend / c.leads : 0,
        cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);

    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;

    console.log(`\n========== TOTAIS ==========`);
    console.log(`Spend: ${totalSpend}, Leads: ${totalLeads}, CPL: ${avgCPL}`);

    // Buscar dados diários para o gráfico
    const dailyInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=spend,impressions,reach,actions` +
      `&level=account` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&limit=500` +
      `&access_token=${access_token}`;

    const dailyData = await fetchAllPages(dailyInsightsUrl);

    const chartData = dailyData.map((day: any) => {
      const dayLeads = day.actions?.find((a: any) => 
        a.action_type === 'lead' || a.action_type === 'leadgen_grouped' ||
        a.action_type.includes('messaging_conversation_started')
      );
      return {
        date: day.date_start,
        spend: parseFloat(day.spend || '0'),
        leads: dayLeads ? parseInt(dayLeads.value || '0', 10) : 0,
        impressions: parseInt(day.impressions || '0', 10),
        reach: parseInt(day.reach || '0', 10),
      };
    }).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Buscar breakdown por plataforma
    const platformInsightsUrl = `https://graph.facebook.com/v18.0/${selectedAccountId}/insights?` +
      `fields=spend,impressions,reach,actions` +
      `&level=account` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&breakdowns=publisher_platform` +
      `&limit=100` +
      `&access_token=${access_token}`;

    let platformBreakdown: any[] = [];
    try {
      const platformResponse = await fetch(platformInsightsUrl);
      const platformData = await platformResponse.json();
      
      if (platformData.data && !platformData.error) {
        platformBreakdown = platformData.data.map((p: any) => {
          const pLeads = p.actions?.find((a: any) => 
            a.action_type === 'lead' || a.action_type === 'leadgen_grouped'
          );
          return {
            platform: getPlatformName(p.publisher_platform),
            spend: parseFloat(p.spend || '0'),
            leads: pLeads ? parseInt(pLeads.value || '0', 10) : 0,
            impressions: parseInt(p.impressions || '0', 10),
            reach: parseInt(p.reach || '0', 10),
          };
        });
      }
    } catch (e) {
      console.error('Erro ao buscar breakdown por plataforma:', e);
    }

    // Validação CRM
    const { count: crmLeadsCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .eq('source', 'Facebook Leads')
      .gte('created_at', start_date)
      .lte('created_at', end_date);

    const crmValidation = {
      metaReportedLeads: totalLeads,
      crmReceivedLeads: crmLeadsCount || 0,
      captureRate: totalLeads > 0 ? ((crmLeadsCount || 0) / totalLeads) * 100 : 0,
      discrepancy: totalLeads - (crmLeadsCount || 0),
    };

    return new Response(
      JSON.stringify({
        data: {
          totalSpend, totalReach, totalImpressions, totalClicks, totalLeads,
          totalLandingPageViews, totalOutboundClicks,
          avgCPL, avgCPC, avgCTR, avgFrequency,
          chartData, campaignBreakdown, platformBreakdown, crmValidation,
        },
        error: null,
        selectedAccount,
        availableAccounts,
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