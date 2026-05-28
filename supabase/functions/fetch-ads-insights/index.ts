import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
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

const normalizeAdAccountId = (id?: string | null): string | null => {
  if (!id) return null;
  return id.startsWith('act_') ? id : `act_${id}`;
};

const normalizeAdAccounts = (accounts: AdAccount[]): AdAccount[] =>
  accounts
    .filter((account) => Boolean(account?.id))
    .map((account) => ({
      ...account,
      id: normalizeAdAccountId(account.id) || account.id,
      status: account.status ?? 1,
    }));

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

const fetchCampaignList = async (adAccountId: string, accessToken: string): Promise<any[]> => {
  const campaignStatuses = [
    'ACTIVE',
    'PAUSED',
    'ARCHIVED',
    'DELETED',
    'IN_PROCESS',
    'WITH_ISSUES',
  ];

  const campaignsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?` +
    `fields=id,name,status,effective_status,objective` +
    `&filtering=${encodeURIComponent(JSON.stringify([
      { field: 'effective_status', operator: 'IN', value: campaignStatuses }
    ]))}` +
    `&limit=500` +
    `&access_token=${accessToken}`;

  return fetchAllPages(campaignsUrl);
};

const fetchCampaignIdsForPage = async (
  adAccountId: string,
  accessToken: string,
  pageId?: string | null
): Promise<Set<string> | null> => {
  if (!pageId) return null;

  const effectiveStatuses = [
    'ACTIVE',
    'PAUSED',
    'ARCHIVED',
    'DELETED',
    'IN_PROCESS',
    'WITH_ISSUES',
    'CAMPAIGN_PAUSED',
    'ADSET_PAUSED',
  ];

  const pageCampaignIds = new Set<string>();
  const pagePostPrefix = `${pageId}_`;

  try {
    const adsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/ads?` +
      `fields=campaign_id,creative{object_story_spec,actor_id,object_story_id,effective_object_story_id}` +
      `&filtering=${encodeURIComponent(JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: effectiveStatuses }
      ]))}` +
      `&limit=500` +
      `&access_token=${accessToken}`;

    const ads = await fetchAllPages(adsUrl);
    for (const ad of ads) {
      const creative = ad.creative || {};
      const storySpec = creative.object_story_spec || {};
      const creativePageIds = [
        storySpec.page_id,
        storySpec.link_data?.page_id,
        storySpec.video_data?.page_id,
        storySpec.template_data?.page_id,
        storySpec.photo_data?.page_id,
        creative.actor_id,
      ].filter(Boolean).map(String);
      const storyIds = [
        creative.object_story_id,
        creative.effective_object_story_id,
        storySpec.object_story_id,
        storySpec.effective_object_story_id,
      ].filter(Boolean).map(String);

      const usesConnectedPage = creativePageIds.includes(pageId) ||
        storyIds.some((storyId) => storyId.startsWith(pagePostPrefix));

      if (usesConnectedPage && ad.campaign_id) {
        pageCampaignIds.add(ad.campaign_id);
      }
    }
  } catch (adsError) {
    console.warn('[ADS] Erro ao filtrar campanhas por criativos da página:', adsError);
  }

  try {
    const adsetsUrl = `https://graph.facebook.com/v21.0/${adAccountId}/adsets?` +
      `fields=campaign_id,promoted_object,effective_status` +
      `&filtering=${encodeURIComponent(JSON.stringify([
        { field: 'effective_status', operator: 'IN', value: effectiveStatuses }
      ]))}` +
      `&limit=500` +
      `&access_token=${accessToken}`;

    const adsets = await fetchAllPages(adsetsUrl);
    for (const adset of adsets) {
      const promotedPageId = adset.promoted_object?.page_id;
      if (promotedPageId === pageId && adset.campaign_id) {
        pageCampaignIds.add(adset.campaign_id);
      }
    }
  } catch (adsetsError) {
    console.warn('[ADS] Erro ao filtrar campanhas por conjuntos da página:', adsetsError);
  }

  console.log(`[ADS] Campanhas vinculadas à página ${pageId}: ${pageCampaignIds.size}`);
  return pageCampaignIds;
};

const fetchBusinessAdAccounts = async (businessId: string, accessToken: string): Promise<AdAccount[]> => {
  const accountMap = new Map<string, AdAccount>();

  for (const edge of ['owned_ad_accounts', 'client_ad_accounts']) {
    try {
      const accountsUrl = `https://graph.facebook.com/v21.0/${businessId}/${edge}?fields=id,name,account_status&limit=50&access_token=${accessToken}`;
      const accounts = await fetchAllPages(accountsUrl);
      for (const account of normalizeAdAccounts(accounts.map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.account_status ?? 1,
      })))) {
        accountMap.set(account.id, account);
      }
    } catch (businessAccountsError) {
      console.warn(`[ADS] Erro ao buscar ${edge} da BM ${businessId}:`, businessAccountsError);
    }
  }

  return [...accountMap.values()];
};

const fetchUserAdAccounts = async (accessToken: string): Promise<AdAccount[]> => {
  const adAccountsUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${accessToken}`;
  const accounts = await fetchAllPages(adAccountsUrl);
  return normalizeAdAccounts(accounts.map((a: any) => ({
    id: a.id,
    name: a.name,
    status: a.account_status ?? 1,
  })));
};

const discoverAccountsUsingPage = async (
  accessToken: string,
  pageId: string,
  initialAccounts: AdAccount[] = []
): Promise<{ accounts: AdAccount[]; campaignIdsByAccount: Record<string, string[]> }> => {
  const accountMap = new Map<string, AdAccount>();
  const campaignIdsByAccount: Record<string, string[]> = {};

  for (const account of initialAccounts) {
    accountMap.set(account.id, account);
  }

  try {
    for (const account of await fetchUserAdAccounts(accessToken)) {
      accountMap.set(account.id, account);
    }
  } catch (userAccountsError) {
    console.warn('[ADS] Erro ao listar contas do usuário para prova por página:', userAccountsError);
  }

  try {
    const bizListUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=50&access_token=${accessToken}`;
    const businesses = await fetchAllPages(bizListUrl);
    for (const business of businesses) {
      for (const account of await fetchBusinessAdAccounts(business.id, accessToken)) {
        accountMap.set(account.id, account);
      }
    }
  } catch (businessDiscoveryError) {
    console.warn('[ADS] Erro ao listar BMs para prova por página:', businessDiscoveryError);
  }

  const provenAccounts: AdAccount[] = [];
  for (const account of accountMap.values()) {
    const campaignIds = await fetchCampaignIdsForPage(account.id, accessToken, pageId);
    if (campaignIds && campaignIds.size > 0) {
      provenAccounts.push(account);
      campaignIdsByAccount[account.id] = [...campaignIds];
    }
  }

  console.log(`[ADS] Contas comprovadas usando a página ${pageId}: ${provenAccounts.length}`);
  return { accounts: provenAccounts, campaignIdsByAccount };
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
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

    let access_token: string | null = null;
    let selectedAccountId: string | null = null;
    let availableAccounts: AdAccount[] = [];
    let integrationId: string | null = null;
    let provenCampaignIdsByAccount: Record<string, string[]> = {};

    // Primeiro buscar a integração principal — usar a mais recente se houver múltiplas
    const { data: integrations, error: integrationError } = await supabase
      .from('facebook_integrations')
      .select('id, page_id, page_name, ad_account_id, ad_accounts, business_id')
      .eq('organization_id', organization_id)
      .order('created_at', { ascending: false })
      .limit(1);

    const integration = integrations?.[0] || null;

    if (integrationError || !integration) {
      console.error('Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook integration not found', data: null, needsReconnect: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    integrationId = integration.id;
    selectedAccountId = normalizeAdAccountId(ad_account_id || integration.ad_account_id);

    if (integration.ad_accounts) {
      if (Array.isArray(integration.ad_accounts)) {
        availableAccounts = normalizeAdAccounts(integration.ad_accounts);
      } else if (typeof integration.ad_accounts === 'string') {
        try {
          availableAccounts = normalizeAdAccounts(JSON.parse(integration.ad_accounts));
        } catch (e) {
          console.error('Failed to parse ad_accounts:', e);
        }
      }
    }

    // Buscar token — tenta tabela segura primeiro, depois legado
    const { data: secureTokens } = await supabase.rpc('get_facebook_tokens_secure', {
      p_organization_id: organization_id
    });

    if (secureTokens && secureTokens.length > 0 && secureTokens[0].encrypted_access_token) {
      console.log('Using secure tokens');
      access_token = await decryptToken(secureTokens[0].encrypted_access_token, ENCRYPTION_KEY);
    }

    // Fallback 1: buscar diretamente na tabela de tokens (sem RPC)
    if (!access_token) {
      const { data: directToken } = await supabase
        .from('facebook_integration_tokens')
        .select('encrypted_access_token')
        .eq('integration_id', integrationId)
        .maybeSingle();
      if (directToken?.encrypted_access_token) {
        access_token = await decryptToken(directToken.encrypted_access_token, ENCRYPTION_KEY);
        console.log('Using direct token from facebook_integration_tokens');
      }
    }

    if (!access_token) {
      console.log('No valid access token found - reconnection required');
      return new Response(
        JSON.stringify({
          error: 'Token do Facebook expirado ou não encontrado. Por favor, reconecte sua conta do Facebook nas configurações de integrações.',
          data: null,
          needsReconnect: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let resolvedBusinessId = integration.business_id;
    const hasConnectedPage = Boolean(integration.page_id);

    if (hasConnectedPage && access_token) {
      console.log(`[ADS] Modo restrito por página conectada: ${integration.page_name || integration.page_id}`);
      try {
        const pageInfoUrl = `https://graph.facebook.com/v21.0/${integration.page_id}?fields=id,name,business&access_token=${access_token}`;
        const pageInfoResp = await fetch(pageInfoUrl);
        const pageInfoData = await pageInfoResp.json();
        const pageBusinessId = pageInfoData?.business?.id || null;

        if (pageBusinessId) {
          resolvedBusinessId = pageBusinessId;
          if (resolvedBusinessId !== integration.business_id) {
            await supabase
              .from('facebook_integrations')
              .update({ business_id: resolvedBusinessId })
              .eq('id', integrationId);
          }

          const pageBusinessAccounts = await fetchBusinessAdAccounts(resolvedBusinessId, access_token);
          if (pageBusinessAccounts.length > 0) {
            const businessAccountIds = new Set(pageBusinessAccounts.map(acc => acc.id));
            availableAccounts = pageBusinessAccounts;
            selectedAccountId = selectedAccountId && businessAccountIds.has(selectedAccountId)
              ? selectedAccountId
              : pageBusinessAccounts[0].id;

            await supabase
              .from('facebook_integrations')
              .update({
                ad_account_id: selectedAccountId,
                ad_accounts: JSON.stringify(pageBusinessAccounts)
              })
              .eq('id', integrationId);
            console.log(`[ADS] Conta selecionada restrita à BM da página: ${selectedAccountId}`);
          } else {
            selectedAccountId = null;
            availableAccounts = [];
            console.log('[ADS] BM da página não retornou contas de anúncios');
          }
        } else {
          console.log('[ADS] Página conectada não possui Business Manager visível pelo token; não usando conta pessoal automaticamente');
          selectedAccountId = null;
          availableAccounts = [];
        }
      } catch (pageBusinessError) {
        console.warn('[ADS] Erro ao resolver BM da página conectada; bloqueando fallback pessoal:', pageBusinessError);
        selectedAccountId = null;
        availableAccounts = [];
      }

      if (!selectedAccountId && integration.page_id) {
        console.log('[ADS] BM da página não trouxe conta válida; procurando contas com campanhas que usam a página conectada');
        const proven = await discoverAccountsUsingPage(access_token, integration.page_id, availableAccounts);
        provenCampaignIdsByAccount = proven.campaignIdsByAccount;
        availableAccounts = proven.accounts;
        selectedAccountId = availableAccounts[0]?.id || null;

        if (selectedAccountId) {
          await supabase
            .from('facebook_integrations')
            .update({
              ad_account_id: selectedAccountId,
              ad_accounts: JSON.stringify(availableAccounts)
            })
            .eq('id', integrationId);
          console.log(`[ADS] Conta selecionada por prova de uso da página: ${selectedAccountId}`);
        }
      }
    }

    if (!selectedAccountId && !hasConnectedPage) {
      console.log('[ADS] Nenhuma conta configurada — tentando auto-descoberta...');

      // Se já temos contas salvas no banco, usar a primeira
      if (availableAccounts.length > 0) {
        selectedAccountId = normalizeAdAccountId(availableAccounts[0].id);
        console.log(`[ADS] Usando conta salva no banco: ${selectedAccountId}`);
      } else {
        // Tentar buscar via API — PRIORIZAR BM conectada
        try {
          let accounts: AdAccount[] = [];

          // Tentativa 1: Business Manager salvo na integração (prioridade — contas da BM conectada)
          if (integration.business_id) {
            console.log(`[ADS] Tentativa 1 — Business Manager conectado: ${integration.business_id}`);
            try {
              accounts = await fetchBusinessAdAccounts(integration.business_id, access_token);
              if (accounts.length > 0) {
                console.log(`[ADS] Encontrou ${accounts.length} conta(s) via BM conectado`);
              }
            } catch (bizErr) {
              console.warn('[ADS] Erro ao buscar via BM conectado:', bizErr);
            }
          }

          // Tentativa 2: /me/adaccounts (contas pessoais do usuário)
          if (accounts.length === 0) {
            console.log('[ADS] Tentativa 2 — /me/adaccounts');
            const adAccountsUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${access_token}`;
            const adAccountsResponse = await fetch(adAccountsUrl);
            const adAccountsData = await adAccountsResponse.json();

            if (adAccountsData.error) {
              console.error('[ADS] Erro na auto-descoberta /me/adaccounts:', adAccountsData.error.message);
              if (adAccountsData.error.code === 200 || adAccountsData.error.message?.includes('permission')) {
                return new Response(
                  JSON.stringify({
                    error: 'Sua conta do Facebook não tem permissão para acessar contas de anúncios. Reconecte sua conta autorizando o acesso a anúncios.',
                    data: null,
                    needsReconnect: true
                  }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                );
              }
              return new Response(
                JSON.stringify({
                  error: `Erro ao buscar contas de anúncio: ${adAccountsData.error.message}`,
                  data: null,
                  needsReconnect: true
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            }

            accounts = normalizeAdAccounts((adAccountsData.data || []).map((a: any) => ({
              id: a.id,
              name: a.name,
              status: a.account_status ?? 1
            })));
          }

          // Tentativa 3: Descobrir TODOS os Business Managers do usuário e buscar contas em cada um
          if (accounts.length === 0) {
            console.log('[ADS] Tentativa 3 — Descobrindo Business Managers via /me/businesses');
            try {
              const bizListUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=50&access_token=${access_token}`;
              const bizListResponse = await fetch(bizListUrl);
              const bizListData = await bizListResponse.json();

              if (bizListData.data && bizListData.data.length > 0) {
                console.log(`[ADS] Encontrou ${bizListData.data.length} Business Manager(s)`);
                for (const biz of bizListData.data) {
                  if (accounts.length > 0) break;
                  try {
                    accounts = await fetchBusinessAdAccounts(biz.id, access_token);
                    if (accounts.length > 0) {
                      console.log(`[ADS] Encontrou ${accounts.length} conta(s) no BM "${biz.name}" (${biz.id})`);
                      await supabase
                        .from('facebook_integrations')
                        .update({ business_id: biz.id })
                        .eq('id', integrationId);
                    }
                  } catch (accErr) {
                    console.warn(`[ADS] Erro ao buscar contas no BM ${biz.id}:`, accErr);
                  }
                }
              }
            } catch (bizListErr) {
              console.warn('[ADS] Erro ao listar Business Managers:', bizListErr);
            }
          }

          if (accounts.length === 0) {
            return new Response(
              JSON.stringify({
                error: 'Nenhuma conta de anúncios encontrada. Certifique-se de que sua conta do Facebook tem acesso ao Gerenciador de Anúncios.',
                data: null,
                availableAccounts: []
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            );
          }

          availableAccounts = accounts;
          selectedAccountId = normalizeAdAccountId(accounts[0].id);

          console.log(`[ADS] Auto-descoberta: ${accounts.length} conta(s). Usando: ${selectedAccountId}`);

          // Salvar no banco para próximas chamadas
          await supabase
            .from('facebook_integrations')
            .update({
              ad_account_id: selectedAccountId,
              ad_accounts: JSON.stringify(accounts)
            })
            .eq('id', integrationId);

          console.log('[ADS] Conta salva no banco com sucesso');
        } catch (discoveryError) {
          console.error('[ADS] Falha na auto-descoberta:', discoveryError);
          return new Response(
            JSON.stringify({ error: 'Erro ao descobrir contas de anúncios. Tente novamente.', data: null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }
      }
    }

    // Descobrir business_id se não estiver salvo no banco
    if (!resolvedBusinessId && access_token && !hasConnectedPage) {
      console.log('[ADS] business_id nulo — descobrindo via Facebook API...');
      try {
        // Tentativa 1: business da página conectada no CRM
        const pageInfoUrl = integration.page_id
          ? `https://graph.facebook.com/v21.0/${integration.page_id}?fields=id,name,business&access_token=${access_token}`
          : `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,business&access_token=${access_token}`;
        const pageInfoResp = await fetch(pageInfoUrl);
        const pageInfoData = await pageInfoResp.json();
        if (integration.page_id) {
          const biz = pageInfoData?.business;
          if (biz?.id) {
            resolvedBusinessId = biz.id;
            console.log(`[ADS] Business descoberto pela página conectada (${integration.page_name || integration.page_id}): ${biz.name} (${biz.id})`);
          }
        } else if (pageInfoData.data && pageInfoData.data.length > 0) {
          const biz = pageInfoData.data[0]?.business;
          if (biz?.id) {
            resolvedBusinessId = biz.id;
            console.log(`[ADS] Business descoberto via página: ${biz.name} (${biz.id})`);
          }
        }
      } catch (e) {
        console.warn('[ADS] Erro ao buscar business da página:', e);
      }

      // Tentativa 2: /me/businesses
      if (!resolvedBusinessId) {
        try {
          const bizListUrl = `https://graph.facebook.com/v21.0/me/businesses?fields=id,name&limit=10&access_token=${access_token}`;
          const bizListResp = await fetch(bizListUrl);
          const bizListData = await bizListResp.json();
          if (bizListData.data && bizListData.data.length > 0) {
            // Usar o primeiro BM que tenha a conta selecionada
            for (const biz of bizListData.data) {
              try {
                const checkUrl = `https://graph.facebook.com/v21.0/${biz.id}/owned_ad_accounts?fields=id&limit=50&access_token=${access_token}`;
                const checkResp = await fetch(checkUrl);
                const checkData = await checkResp.json();
                if (checkData.data) {
                  const found = checkData.data.find((a: any) => normalizeAdAccountId(a.id) === selectedAccountId);
                  if (found) {
                    resolvedBusinessId = biz.id;
                    console.log(`[ADS] Business descoberto via /me/businesses: ${biz.name} (${biz.id})`);
                    break;
                  }
                }
              } catch (_) {}
            }
            // Se não encontrou pelo selectedAccountId, usar o primeiro BM
            if (!resolvedBusinessId) {
              resolvedBusinessId = bizListData.data[0].id;
              console.log(`[ADS] Usando primeiro BM: ${bizListData.data[0].name} (${bizListData.data[0].id})`);
            }
          }
        } catch (e) {
          console.warn('[ADS] Erro ao listar businesses:', e);
        }
      }

      // Salvar business_id descoberto no banco
      if (resolvedBusinessId && integrationId) {
        await supabase
          .from('facebook_integrations')
          .update({ business_id: resolvedBusinessId })
          .eq('id', integrationId);
        console.log(`[ADS] business_id salvo no banco: ${resolvedBusinessId}`);
      }
    }

    // Filtrar availableAccounts para conter apenas contas da BM conectada
    if (resolvedBusinessId && availableAccounts.length > 0 && access_token) {
      try {
        const bmAccounts = await fetchBusinessAdAccounts(resolvedBusinessId, access_token);

        if (bmAccounts.length > 0) {
          const bmAccountIds = new Set(bmAccounts.map((a: any) => normalizeAdAccountId(a.id)));
          const filtered = availableAccounts.filter(acc => bmAccountIds.has(acc.id));
          availableAccounts = filtered.length > 0 ? filtered : bmAccounts;
          console.log(`[ADS] Contas restritas à BM da página ${resolvedBusinessId}: ${availableAccounts.length} conta(s)`);
        } else {
          console.log(`[ADS] BM ${resolvedBusinessId} retornou 0 contas via API — substituindo lista pela resposta da BM`);
          // Se o banco tinha contas de outros BMs e a BM conectada tem menos, usar só as da BM
          availableAccounts = [];
        }
      } catch (filterErr) {
        console.warn('[ADS] Erro ao filtrar contas por BM, usando lista completa:', filterErr);
      }
    }

    // Quando já existe ad_account_id salvo, a lista pode estar vazia em integrações antigas.
    // Preencher nome/lista sem pedir nova conexão e sem mexer nos tokens/webhooks.
    if (selectedAccountId && availableAccounts.length === 0 && access_token && !hasConnectedPage) {
      try {
        const accountInfoUrl = `https://graph.facebook.com/v21.0/${selectedAccountId}?fields=id,name,account_status&access_token=${access_token}`;
        const accountInfoResp = await fetch(accountInfoUrl);
        const accountInfoData = await accountInfoResp.json();

        if (accountInfoData?.id && !accountInfoData.error) {
          availableAccounts = normalizeAdAccounts([{
            id: accountInfoData.id,
            name: accountInfoData.name || 'Conta de Anúncios',
            status: accountInfoData.account_status ?? 1,
          }]);
          console.log(`[ADS] Conta salva resolvida via Meta API: ${availableAccounts[0].name}`);
        } else {
          console.warn('[ADS] Conta salva não resolvida, tentando /me/adaccounts:', accountInfoData?.error?.message);
          const adAccountsUrl = `https://graph.facebook.com/v21.0/me/adaccounts?fields=id,name,account_status&limit=50&access_token=${access_token}`;
          const adAccountsData = await (await fetch(adAccountsUrl)).json();
          const discoveredAccounts = normalizeAdAccounts((adAccountsData.data || []).map((a: any) => ({
            id: a.id,
            name: a.name,
            status: a.account_status ?? 1,
          })));

          if (discoveredAccounts.length > 0) {
            availableAccounts = discoveredAccounts;
            const selectedFromDiscovery = availableAccounts.find(acc => acc.id === selectedAccountId);
            if (!selectedFromDiscovery) {
              selectedAccountId = availableAccounts[0].id;
              await supabase
                .from('facebook_integrations')
                .update({ ad_account_id: selectedAccountId })
                .eq('id', integrationId);
              console.log(`[ADS] Conta salva indisponível — usando conta descoberta: ${selectedAccountId}`);
            }
          }
        }

        if (availableAccounts.length > 0) {
          await supabase
            .from('facebook_integrations')
            .update({ ad_accounts: JSON.stringify(availableAccounts) })
            .eq('id', integrationId);
        }
      } catch (accountInfoError) {
        console.warn('[ADS] Erro ao resolver nome/lista da conta salva:', accountInfoError);
      }
    }

    if (hasConnectedPage && !selectedAccountId) {
      return new Response(
        JSON.stringify({
          error: 'Nenhuma conta de anúncios vinculada à página conectada foi encontrada. As métricas não usarão contas pessoais do perfil do Facebook.',
          data: null,
          selectedAccount: null,
          availableAccounts: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Se a conta selecionada não está nas contas filtradas da BM, usar a primeira da BM
    const selectedInFiltered = availableAccounts.find(acc => acc.id === selectedAccountId);
    if (!selectedInFiltered && availableAccounts.length > 0) {
      const oldId = selectedAccountId;
      selectedAccountId = normalizeAdAccountId(availableAccounts[0].id);
      console.log(`[ADS] Conta ${oldId} não pertence à BM — auto-selecionando: ${selectedAccountId}`);
      // Atualizar no banco
      await supabase
        .from('facebook_integrations')
        .update({ ad_account_id: selectedAccountId })
        .eq('id', integrationId);
    }

    let selectedAccount = selectedInFiltered || availableAccounts[0] || {
      id: selectedAccountId,
      name: 'Conta de Anúncios',
      status: 1
    };

    console.log(`Conta de Anúncios: ${selectedAccountId} (${selectedAccount.name})`);
    console.log(`Página conectada: ${integration.page_name || 'sem nome'} (${integration.page_id || 'sem page_id'})`);

    let pageCampaignIds = provenCampaignIdsByAccount[selectedAccountId]
      ? new Set(provenCampaignIdsByAccount[selectedAccountId])
      : await fetchCampaignIdsForPage(selectedAccountId, access_token, integration.page_id);

    if (hasConnectedPage && pageCampaignIds && pageCampaignIds.size === 0 && availableAccounts.length > 1) {
      console.log('[ADS] Conta selecionada não possui campanhas da página; procurando em outras contas da BM da página');
      for (const account of availableAccounts) {
        if (account.id === selectedAccountId) continue;
        const candidateCampaignIds = provenCampaignIdsByAccount[account.id]
          ? new Set(provenCampaignIdsByAccount[account.id])
          : await fetchCampaignIdsForPage(account.id, access_token, integration.page_id);
        if (candidateCampaignIds && candidateCampaignIds.size > 0) {
          selectedAccountId = account.id;
          selectedAccount = account;
          pageCampaignIds = candidateCampaignIds;
          await supabase
            .from('facebook_integrations')
            .update({ ad_account_id: selectedAccountId })
            .eq('id', integrationId);
          console.log(`[ADS] Conta corrigida para campanhas da página conectada: ${selectedAccountId}`);
          break;
        }
      }
    }

    if (hasConnectedPage && pageCampaignIds && pageCampaignIds.size === 0 && integration.page_id) {
      console.log('[ADS] Nenhuma conta atual comprovou uso da página; varrendo contas acessíveis por prova de page_id');
      const proven = await discoverAccountsUsingPage(access_token, integration.page_id, availableAccounts);
      if (proven.accounts.length > 0) {
        provenCampaignIdsByAccount = proven.campaignIdsByAccount;
        availableAccounts = proven.accounts;
        selectedAccountId = availableAccounts[0].id;
        selectedAccount = availableAccounts[0];
        pageCampaignIds = new Set(provenCampaignIdsByAccount[selectedAccountId] || []);
        await supabase
          .from('facebook_integrations')
          .update({
            ad_account_id: selectedAccountId,
            ad_accounts: JSON.stringify(availableAccounts)
          })
          .eq('id', integrationId);
        console.log(`[ADS] Conta corrigida por campanha que usa a página: ${selectedAccountId}`);
      }
    }

    if (hasConnectedPage && pageCampaignIds && pageCampaignIds.size === 0) {
      return new Response(
        JSON.stringify({
          error: 'Nenhuma campanha vinculada à página conectada foi encontrada nesta conta de anúncios. As métricas não usarão campanhas do perfil pessoal.',
          data: null,
          selectedAccount: null,
          availableAccounts: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const insightsFields = [
      'campaign_id', 'campaign_name', 'reach', 'impressions', 'spend', 'clicks',
      'cpc', 'cpm', 'ctr', 'actions', 'cost_per_action_type', 'conversions',
      'action_values', 'conversion_values', 'outbound_clicks', 'inline_link_clicks',
      'frequency', 'quality_ranking', 'engagement_rate_ranking', 'conversion_rate_ranking',
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });

    const aggregatedInsightsUrl = `https://graph.facebook.com/v21.0/${selectedAccountId}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&limit=500` +
      `&access_token=${access_token}`;

    console.log(`\n[STEP 1] Buscando insights agregados por campanha...`);
    const rawAggregatedData = await fetchAllPages(aggregatedInsightsUrl);
    const aggregatedData = pageCampaignIds
      ? rawAggregatedData.filter((record: any) => pageCampaignIds.has(record.campaign_id))
      : rawAggregatedData;

    if (pageCampaignIds && rawAggregatedData.length !== aggregatedData.length) {
      console.log(`[ADS] Filtrado pela página conectada: ${aggregatedData.length}/${rawAggregatedData.length} campanhas com insights`);
    }

    if (!aggregatedData || aggregatedData.length === 0) {
      console.log('Nenhum dado de insights encontrado para o período; buscando lista de campanhas da conta');
      const campaigns = (await fetchCampaignList(selectedAccountId, access_token))
        .filter((campaign: any) => !pageCampaignIds || pageCampaignIds.has(campaign.id));
      const campaignBreakdown = campaigns.map((campaign: any) => {
        const objective = campaign.objective || '';
        return {
          id: campaign.id,
          name: campaign.name || 'Campanha sem nome',
          spend: 0,
          leads: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
          leadType: '',
          leadTypeName: '',
          costPerLead: 0,
          cpl: 0,
          cpc: 0,
          ctr: 0,
          frequency: 0,
          outboundClicks: 0,
          landingPageViews: 0,
          qualityRanking: '',
          engagementRanking: '',
          conversionRanking: '',
          objective,
          objectiveName: objectiveToName[objective] || objective || 'Outro',
          status: campaign.effective_status || campaign.status || '',
        };
      });

      return new Response(
        JSON.stringify({
          data: {
            totalSpend: 0, totalReach: 0, totalImpressions: 0, totalClicks: 0, totalLeads: 0,
            avgCPL: 0, avgCPC: 0, avgCTR: 0, avgFrequency: 0,
            chartData: [], campaignBreakdown, platformBreakdown: [],
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
        const campaignsUrl = `https://graph.facebook.com/v21.0/?ids=${batch.join(',')}&fields=objective,optimization_goal&access_token=${access_token}`;
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
    const dailyInsightsUrl = `https://graph.facebook.com/v21.0/${selectedAccountId}/insights?` +
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
      const daySpend = parseFloat(day.spend || '0');
      const dayLeadsCount = dayLeads ? parseInt(dayLeads.value || '0', 10) : 0;
      return {
        date: day.date_start,
        spend: daySpend,
        leads: dayLeadsCount,
        cpl: dayLeadsCount > 0 ? daySpend / dayLeadsCount : 0,
        impressions: parseInt(day.impressions || '0', 10),
        reach: parseInt(day.reach || '0', 10),
      };
    }).sort((a: any, b: any) => a.date.localeCompare(b.date));

    // Buscar breakdown por plataforma
    const platformInsightsUrl = `https://graph.facebook.com/v21.0/${selectedAccountId}/insights?` +
      `fields=spend,impressions,reach,clicks,actions` +
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
          const pSpend = parseFloat(p.spend || '0');
          const pLeadsCount = pLeads ? parseInt(pLeads.value || '0', 10) : 0;
          const pClicks = parseInt(p.clicks || '0', 10);
          return {
            platform: getPlatformName(p.publisher_platform),
            spend: pSpend,
            leads: pLeadsCount,
            impressions: parseInt(p.impressions || '0', 10),
            reach: parseInt(p.reach || '0', 10),
            clicks: pClicks,
            cpl: pLeadsCount > 0 ? pSpend / pLeadsCount : 0,
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
