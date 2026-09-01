import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import { sendLeadGroupAlert } from '../_shared/lead-group-alert.ts';
import {
  addFacebookDuplicateMetadata,
  findFacebookDuplicateReference,
  findLeadByFacebookLeadId,
} from '../_shared/facebook-lead-policy.ts';
import { decryptMetaToken } from '../_shared/meta-token-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hasValidMetaSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const appSecret = Deno.env.get('FACEBOOK_APP_SECRET');
  if (!appSecret || !signatureHeader?.startsWith('sha256=')) return false;

  const providedHex = signatureHeader.slice('sha256='.length).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(providedHex)) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody),
  ));
  const expectedHex = Array.from(signed, byte => byte.toString(16).padStart(2, '0')).join('');

  let difference = expectedHex.length ^ providedHex.length;
  for (let index = 0; index < expectedHex.length; index += 1) {
    difference |= expectedHex.charCodeAt(index) ^ providedHex.charCodeAt(index);
  }
  return difference === 0;
}

// Tenta obter novo page_access_token usando o user_access_token
async function refreshPageToken(
  userAccessToken: string,
  pageId: string
): Promise<string> {
  try {
    console.log(`🔄 [FB-WEBHOOK] Tentando renovar token da página ${pageId} via user token...`);
    const resp = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userAccessToken}`
    );
    if (!resp.ok) {
      const err = await resp.json();
      console.error('❌ [FB-WEBHOOK] Erro ao renovar token da página:', err);
      return '';
    }
    const data = await resp.json();
    const page = (data.data || []).find((p: any) => p.id === pageId);
    if (page?.access_token) {
      console.log(`✅ [FB-WEBHOOK] Token da página ${pageId} renovado com sucesso`);
      return page.access_token;
    }
    console.warn(`⚠️ [FB-WEBHOOK] Página ${pageId} não encontrada na lista de contas`);
    return '';
  } catch (e) {
    console.error('❌ [FB-WEBHOOK] Exceção ao renovar token da página:', e);
    return '';
  }
}

// Obtém page_access_token e user_access_token com renovação automática se expirado
// Retorna { pageToken, userToken } — pageToken para leadgen/form, userToken para ads/campaign (requer ads_read)
async function getSecureTokens(
  supabase: any,
  integrationId: string,
  pageId: string,
  legacyToken: string | null
): Promise<{ pageToken: string; userToken: string }> {
  // 1. Buscar tokens da tabela segura
  const { data: secureTokens } = await supabase
    .from('facebook_integration_tokens')
    .select('encrypted_page_access_token, encrypted_access_token')
    .eq('integration_id', integrationId)
    .maybeSingle();

  let pageToken = '';
  let userToken = '';

  if (secureTokens) {
    pageToken = await decryptMetaToken(secureTokens.encrypted_page_access_token || '');
    userToken = await decryptMetaToken(secureTokens.encrypted_access_token || '');
  }

  // 2. Se o page token foi decriptado com sucesso, validar rapidamente
  if (pageToken && pageToken.length > 20) {
    console.log('✅ [FB-WEBHOOK] Page token obtido da tabela segura');
    return { pageToken, userToken };
  }

  // 3. Tentar usar o user token para obter um page token fresco
  if (userToken && userToken.length > 20) {
    console.log('🔄 [FB-WEBHOOK] Page token inválido, tentando renovar via user token...');
    const freshPageToken = await refreshPageToken(userToken, pageId);
    if (freshPageToken) return { pageToken: freshPageToken, userToken };
  }

  // 4. Fallback para token legado (se não for sentinela)
  if (legacyToken && legacyToken !== 'ENCRYPTED_IN_TOKENS_TABLE' && legacyToken.length > 20) {
    console.log('⚠️ [FB-WEBHOOK] Usando token legado de page_access_token');
    return { pageToken: legacyToken, userToken };
  }

  console.error('❌ [FB-WEBHOOK] Nenhum token válido encontrado para integrationId:', integrationId);
  return { pageToken: '', userToken };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Webhook verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const VERIFY_TOKEN = Deno.env.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN');

    if (VERIFY_TOKEN && mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ [FB-WEBHOOK] Webhook verificado com sucesso');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const rawBody = await req.text();
      if (!await hasValidMetaSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
        return new Response('Unauthorized', { status: 401 });
      }

      const body = JSON.parse(rawBody);
      console.log('📥 [FB-WEBHOOK] Evento recebido', {
        object: body?.object ?? 'unknown',
        entries: Array.isArray(body?.entry) ? body.entry.length : 0,
      });

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'leadgen') continue;

          const leadgenData = change.value;
          const pageId = String(leadgenData.page_id || entry.id || '').trim();
          const leadgenId = String(leadgenData.leadgen_id || '').trim();
          // CORREÇÃO CRÍTICA: extrair form_id e ad_id do payload do webhook
          // O Facebook envia form_id e ad_id diretamente no payload — usar como fonte primária
          const webhookFormId = leadgenData.form_id || null;
          const webhookAdId = leadgenData.ad_id || leadgenData.adgroup_id || null;

          console.log(`🎯 [FB-WEBHOOK] leadgen_id=${leadgenId} page_id=${pageId} form_id=${webhookFormId} ad_id=${webhookAdId}`);

          if (!pageId || !leadgenId) {
            console.warn('⚠️ [FB-WEBHOOK] page_id ou leadgen_id ausente, pulando');
            continue;
          }

          const { data: integrations, error: integrationsError } = await supabase
            .from('facebook_integrations')
            .select('*')
            .eq('page_id', pageId);

          if (integrationsError || !integrations || integrations.length === 0) {
            console.warn(`⚠️ [FB-WEBHOOK] Nenhuma integração para page_id=${pageId}`);
            continue;
          }

          console.log(`👥 [FB-WEBHOOK] ${integrations.length} integração(ões) encontrada(s) para page_id=${pageId}`);

          for (const integration of integrations) {
            let logId: string | null = null;

            try {
              // Criar log de entrada
              const { data: logEntry } = await supabase
                .from('facebook_webhook_logs')
                .insert({
                  organization_id: integration.organization_id,
                  event_type: 'leadgen',
                  payload: body,
                  status: 'processing',
                  page_id: pageId,
                  facebook_lead_id: leadgenId,
                })
                .select()
                .single();
              logId = logEntry?.id || null;

              // Idempotencia: uma reentrega do MESMO leadgen_id nao deve criar
              // outro card. IDs Meta diferentes seguem o fluxo mesmo quando o
              // telefone ou o email coincidem com um lead existente.
              const alreadyProcessedLead = await findLeadByFacebookLeadId(
                supabase,
                integration.organization_id,
                leadgenId,
              );
              if (alreadyProcessedLead) {
                console.log(`ℹ️ [FB-WEBHOOK] Evento Meta ${leadgenId} ja processado no lead ${alreadyProcessedLead.id}`);
                if (logId) {
                  await supabase
                    .from('facebook_webhook_logs')
                    .update({
                      status: 'duplicate',
                      lead_id: alreadyProcessedLead.id,
                      error_message: 'Evento Meta ja processado; nenhuma nova acao executada',
                    })
                    .eq('id', logId);
                }
                continue;
              }

              // Obter tokens (page token para leadgen/form, user token para ads/campaign)
              const { pageToken: pageAccessToken, userToken: userAccessToken } = await getSecureTokens(
                supabase,
                integration.id,
                pageId,
                integration.page_access_token
              );

              if (!pageAccessToken) {
                const msg = `Token não encontrado para integração ${integration.id}. Reconecte o Facebook.`;
                console.error(`❌ [FB-WEBHOOK] ${msg}`);
                // CORREÇÃO: Marcar integração como precisando reconexão (expires_at = now())
                // para que o frontend mostre o aviso "needs_reconnect = true" ao usuário.
                const { error: expirationError } = await supabase
                  .from('facebook_integrations')
                  .update({ expires_at: new Date().toISOString() })
                  .eq('id', integration.id);
                if (expirationError) {
                  console.warn('⚠️ [FB-WEBHOOK] Erro ao marcar expiração:', expirationError);
                }
                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'error', error_message: msg }).eq('id', logId);
                continue;
              }

              // Buscar dados do lead na Graph API (explicitar campos para garantir form_id)
              // ESTRATÉGIA: tentativa 1 com page token; se falhar com erro 100 (leadgen não encontrado,
              // comum em leads de TESTE da ferramenta Facebook), tentar com user token como fallback.
              console.log(`📡 [FB-WEBHOOK] Buscando lead ${leadgenId} na Graph API...`);
              const LEAD_FIELDS = 'id,form_id,ad_id,ad_name,created_time,field_data';
              let leadResponse = await fetch(
                `https://graph.facebook.com/v21.0/${leadgenId}?fields=${LEAD_FIELDS}&access_token=${pageAccessToken}`
              );

              // Fallback com user token para leads de teste (error 100 = Object does not exist)
              if (!leadResponse.ok) {
                const firstError = await leadResponse.json();
                const firstCode = firstError?.error?.code;
                console.warn(`⚠️ [FB-WEBHOOK] Erro ${firstCode} com page token para lead ${leadgenId}: ${firstError?.error?.message}`);

                if (firstCode === 100) {
                  // Leads de teste às vezes só são acessíveis via user access token
                  // Tentar recuperar user token da tabela de tokens
                  const { data: secureTokens } = await supabase
                    .from('facebook_integration_tokens')
                    .select('encrypted_access_token')
                    .eq('integration_id', integration.id)
                    .maybeSingle();

                  if (secureTokens?.encrypted_access_token) {
                    const userToken = await decryptMetaToken(secureTokens.encrypted_access_token);
                    if (userToken && userToken.length > 20) {
                      console.log(`🔄 [FB-WEBHOOK] Tentando buscar lead ${leadgenId} com user token (fallback para lead de teste)...`);
                      leadResponse = await fetch(
                        `https://graph.facebook.com/v21.0/${leadgenId}?fields=${LEAD_FIELDS}&access_token=${userToken}`
                      );
                      if (leadResponse.ok) {
                        console.log(`✅ [FB-WEBHOOK] Lead ${leadgenId} obtido com user token (era lead de teste)`);
                      } else {
                        const retryErr = await leadResponse.json();
                        console.error(`❌ [FB-WEBHOOK] Fallback com user token também falhou: ${retryErr?.error?.message}`);
                        // Reconstruir Response com o erro original para o handler abaixo
                        leadResponse = new Response(JSON.stringify(firstError), { status: 400 });
                      }
                    } else {
                      leadResponse = new Response(JSON.stringify(firstError), { status: 400 });
                    }
                  } else {
                    leadResponse = new Response(JSON.stringify(firstError), { status: 400 });
                  }
                } else {
                  // Recriar response com os dados do erro original
                  leadResponse = new Response(JSON.stringify(firstError), {
                    status: leadResponse.status || 400
                  });
                }
              }

              if (!leadResponse.ok) {
                const errorData = await leadResponse.json();
                const errorCode = errorData?.error?.code;
                const msg = `Graph API erro ${leadResponse.status} (code ${errorCode}): ${errorData?.error?.message || JSON.stringify(errorData)}`;
                console.error(`❌ [FB-WEBHOOK] ${msg}`);

                // Se for erro de token (190, 102, 104), marcar integração como precisando reconexão
                if ([190, 102, 104].includes(errorCode)) {
                  await supabase
                    .from('facebook_integrations')
                    .update({ expires_at: new Date().toISOString() })
                    .eq('id', integration.id);
                  console.warn(`⚠️ [FB-WEBHOOK] Token expirado para integração ${integration.id}, marcado para reconexão`);
                }

                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'error', error_message: msg }).eq('id', logId);
                continue;
              }

              const leadData = await leadResponse.json();
              // Usar form_id do webhook payload (mais confiável) ou da Graph API como fallback
              const resolvedFormId = webhookFormId || leadData.form_id || null;
              if (!leadData.form_id && resolvedFormId) {
                leadData.form_id = resolvedFormId; // garantir consistência no restante do código
              }
              console.log(`✅ [FB-WEBHOOK] Dados do lead obtidos: form_id=${resolvedFormId} (webhook=${webhookFormId}, graphapi=${leadData.form_id})`);

              // Buscar nome do formulário
              let formName = leadData.form_id || 'Formulário Facebook';
              try {
                if (leadData.form_id) {
                  const formResp = await fetch(`https://graph.facebook.com/v21.0/${leadData.form_id}?fields=name&access_token=${pageAccessToken}`);
                  const formData = await formResp.json();
                  if (formData.name) formName = formData.name;
                }
              } catch { /* não crítico */ }

              // Buscar nome e ID da campanha
              // IMPORTANTE: User token tem ads_read, page token NÃO tem.
              // Sempre usar userAccessToken para queries de ad/campaign.
              const resolvedAdId = leadData.ad_id || webhookAdId || null;
              let campaignName = 'N/A';
              let campaignId: string | null = null;
              try {
                if (resolvedAdId) {
                  // Prefer user token (has ads_read), fallback to page token
                  const adsToken = userAccessToken || pageAccessToken;
                  console.log(`🎯 [FB-WEBHOOK] Buscando campanha para ad_id=${resolvedAdId} (usando ${userAccessToken ? 'user' : 'page'} token)`);
                  const adResp = await fetch(`https://graph.facebook.com/v21.0/${resolvedAdId}?fields=name,campaign{id,name}&access_token=${adsToken}`);
                  const adData = await adResp.json();

                  if (adData.error) {
                    console.warn(`⚠️ [FB-WEBHOOK] Erro ao buscar ad: ${adData.error.message}`);
                  } else {
                    campaignName = adData.campaign?.name || adData.name || 'N/A';
                    campaignId = adData.campaign?.id || null;

                    // Se campaignName parece ser um ID numérico, buscar nome real diretamente
                    if (/^\d{10,}$/.test(campaignName)) {
                      console.log(`🔄 [FB-WEBHOOK] Campaign name parece ID (${campaignName}), buscando nome real...`);
                      const potentialId = campaignId || campaignName;
                      const campResp = await fetch(`https://graph.facebook.com/v21.0/${potentialId}?fields=name&access_token=${adsToken}`);
                      const campData = await campResp.json();
                      if (campData.name) {
                        console.log(`✅ [FB-WEBHOOK] Nome real da campanha: ${campData.name}`);
                        campaignName = campData.name;
                        if (!campaignId) campaignId = potentialId;
                      }
                    }
                    console.log(`✅ [FB-WEBHOOK] Campanha: ${campaignName} (ID: ${campaignId})`);
                  }
                } else {
                  console.log(`⚠️ [FB-WEBHOOK] Sem ad_id disponível para buscar campanha`);
                }
              } catch (e) {
                console.warn(`⚠️ [FB-WEBHOOK] Erro ao buscar campanha: ${e}`);
              }

              // Parsear campos do formulário
              const fieldData = leadData.field_data || [];
              const leadInfo: Record<string, string> = {};
              fieldData.forEach((field: any) => {
                const normalized = field.name.toLowerCase().replace(/\s+/g, '_');
                leadInfo[field.name] = field.values?.[0] || '';
                leadInfo[normalized] = field.values?.[0] || '';
              });

              const structuredFields = fieldData
                .map((f: any) => ({ name: f.name, value: f.values?.[0] || '' }))
                .filter((f: any) => f.value !== '');

              const baseAdditionalData = {
                source: 'facebook',
                form_id: leadData.form_id,
                form_name: formName,
                campaign_name: campaignName,
                campaign_id: campaignId,
                facebook_lead_id: leadgenId,
                fields: structuredFields
              };

              let allFieldsDescription = `Lead capturado via Facebook Ads\n\nFormulário: ${formName}\nCampanha: ${campaignName}${campaignId ? ` (ID: ${campaignId})` : ''}\n\n=== INFORMAÇÕES DO FORMULÁRIO ===\n`;
              fieldData.forEach((field: any) => {
                const v = field.values?.[0] || '';
                if (v) allFieldsDescription += `${field.name}: ${v}\n`;
              });

              // Extrair telefone — cobrir todos os nomes de campo usados pelo Facebook
              // incluindo os campos padrão da ferramenta de teste (phone_number, full_phone_number)
              const phoneNumber = (
                leadInfo.phone_number ||
                leadInfo.full_phone_number ||
                leadInfo.phone ||
                leadInfo.telefone ||
                leadInfo.celular ||
                leadInfo.whatsapp ||
                leadInfo.numero ||
                leadInfo.numero_telefone ||
                // suporte a campos customizados com "whatsapp" ou "telefone" no nome
                Object.entries(leadInfo).find(([k]) => k.includes('whatsapp') || k.includes('celular') || k.includes('fone'))?.[1] ||
                ''
              );
              const email = leadInfo.email || leadInfo.e_mail || leadInfo['e-mail'] || null;

              // Identificar se é lead de teste (para log mais claro)
              const isTestLead = (
                (leadInfo.full_name || leadInfo['full name'] || '').toLowerCase().includes('test lead') ||
                phoneNumber.includes('+1 (800)') ||
                phoneNumber.includes('+1-202-555')
              );
              if (isTestLead) {
                console.log(`🧪 [FB-WEBHOOK] Lead de teste detectado (leadgen_id=${leadgenId})`);
              }

              // Coincidencia de contato agora e apenas informativa. Cada novo
              // facebook_lead_id continua ate o INSERT e dispara o fluxo normal.
              const duplicateReference = await findFacebookDuplicateReference(
                supabase,
                integration.organization_id,
                phoneNumber,
                email,
              );
              const additionalData = addFacebookDuplicateMetadata(
                baseAdditionalData,
                duplicateReference,
              );

              if (duplicateReference) {
                console.log(
                  `ℹ️ [FB-WEBHOOK] Novo card com contato coincidente via ${duplicateReference.matchType}; ` +
                  `referencia=${duplicateReference.id}`,
                );
              }

              // Buscar mapeamento de funil para este formulário
              // CORREÇÃO: usar organization_id diretamente (coluna adicionada na migration 20260318210000)
              // Antes usava .in('funnel_id', funnelIds) que falhava quando o mapeamento era de outra org
              let funnelMapping: any = null;

              // 1. Mapeamento específico por form_id dentro da org
              if (leadData.form_id) {
                const { data: specific } = await supabase
                  .from('funnel_source_mappings')
                  .select('funnel_id, target_stage_id')
                  .eq('source_type', 'facebook')
                  .eq('source_identifier', leadData.form_id)
                  .eq('organization_id', integration.organization_id)
                  .maybeSingle();
                funnelMapping = specific;
              }

              // 2. Mapeamento global do facebook (sem form_id específico) dentro da org
              if (!funnelMapping) {
                const { data: globalMapping } = await supabase
                  .from('funnel_source_mappings')
                  .select('funnel_id, target_stage_id')
                  .eq('source_type', 'facebook')
                  .is('source_identifier', null)
                  .eq('organization_id', integration.organization_id)
                  .maybeSingle();
                funnelMapping = globalMapping;
              }

              let funnelId: string | null = null;
              let funnelStageId: string | null = null;

              if (funnelMapping) {
                funnelId = funnelMapping.funnel_id;
                funnelStageId = funnelMapping.target_stage_id;
                console.log(`✅ [FB-WEBHOOK] Mapeamento encontrado: funil=${funnelId}`);
              } else {
                // Usar funil padrão da organização
                // CORREÇÃO: usar .limit(1) em vez de .maybeSingle() para evitar erro
                // quando há múltiplos funis com is_default = true (bug histórico).
                // O índice único parcial da migration 20260323 previne futuros duplicados,
                // mas esta defesa extra garante robustez para dados legados.
                const { data: defaultFunnels } = await supabase
                  .from('sales_funnels')
                  .select('id')
                  .eq('organization_id', integration.organization_id)
                  .eq('is_default', true)
                  .order('created_at', { ascending: true })
                  .limit(1);

                const defaultFunnel = defaultFunnels && defaultFunnels.length > 0 ? defaultFunnels[0] : null;

                if (defaultFunnel) {
                  funnelId = defaultFunnel.id;
                  const { data: firstStage } = await supabase
                    .from('funnel_stages')
                    .select('id')
                    .eq('funnel_id', defaultFunnel.id)
                    .order('position')
                    .limit(1)
                    .maybeSingle();
                  funnelStageId = firstStage?.id || null;
                  console.log(`ℹ️ [FB-WEBHOOK] Usando funil padrão: ${funnelId}, etapa: ${funnelStageId}`);
                } else {
                  // Fallback: qualquer funil ativo da organização (ordenado por criação)
                  const { data: anyFunnels } = await supabase
                    .from('sales_funnels')
                    .select('id')
                    .eq('organization_id', integration.organization_id)
                    .eq('is_active', true)
                    .order('created_at', { ascending: true })
                    .limit(1);

                  const anyFunnel = anyFunnels && anyFunnels.length > 0 ? anyFunnels[0] : null;
                  if (anyFunnel) {
                    funnelId = anyFunnel.id;
                    const { data: firstStage } = await supabase
                      .from('funnel_stages')
                      .select('id')
                      .eq('funnel_id', anyFunnel.id)
                      .order('position')
                      .limit(1)
                      .maybeSingle();
                    funnelStageId = firstStage?.id || null;
                    console.log(`⚠️ [FB-WEBHOOK] Nenhum funil padrão, usando primeiro funil ativo: ${funnelId}, etapa: ${funnelStageId}`);
                  } else {
                    console.warn(`⚠️ [FB-WEBHOOK] Nenhum funil encontrado para org ${integration.organization_id}`);
                  }
                }
              }

              // Criar lead no banco
              const { data: newLead, error: leadError } = await supabase
                .from('leads')
                .insert({
                  nome_lead: leadInfo.full_name || leadInfo.nome_completo || leadInfo['first name'] || leadInfo.first_name || leadInfo.name || leadInfo.nome || 'Lead do Facebook',
                  telefone_lead: phoneNumber,
                  email,
                  empresa: leadInfo.company_name || leadInfo.company || leadInfo.empresa || null,
                  organization_id: integration.organization_id,
                  facebook_lead_id: leadgenId,
                  source: 'Facebook Leads',
                  stage: 'NOVO',
                  funnel_id: funnelId,
                  funnel_stage_id: funnelStageId,
                  descricao_negocio: allFieldsDescription,
                  additional_data: additionalData,
                })
                .select()
                .single();

              if (leadError) {
                // Duas entregas simultaneas podem passar pelo pre-check. A
                // constraint UNIQUE por org + facebook_lead_id e a autoridade
                // final; nesse caso a segunda entrega e tratada como sucesso
                // idempotente e nao dispara efeitos colaterais novamente.
                const racedLead = leadError.code === '23505'
                  ? await findLeadByFacebookLeadId(
                    supabase,
                    integration.organization_id,
                    leadgenId,
                  )
                  : null;

                if (racedLead) {
                  console.log(`ℹ️ [FB-WEBHOOK] Corrida idempotente para evento Meta ${leadgenId}; lead=${racedLead.id}`);
                  if (logId) {
                    await supabase
                      .from('facebook_webhook_logs')
                      .update({
                        status: 'duplicate',
                        lead_id: racedLead.id,
                        error_message: 'Evento Meta processado por outra entrega concorrente',
                      })
                      .eq('id', logId);
                  }
                } else {
                  const msg = `Erro ao criar lead: ${leadError.message}`;
                  console.error(`❌ [FB-WEBHOOK] ${msg}`);
                  if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'error', error_message: msg }).eq('id', logId);
                }
              } else {
                console.log(`✅ [FB-WEBHOOK] Lead criado: ${newLead.id} | funil=${funnelId} | etapa=${funnelStageId}`);
                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'success', lead_id: newLead.id, form_id: leadData.form_id }).eq('id', logId);

                // Distribuir na roleta
                const distributePromise = supabase.functions.invoke('distribute-lead', {
                  body: { lead_id: newLead.id, organization_id: integration.organization_id, trigger_source: 'facebook' }
                }).catch((err: any) => console.error('⚠️ distribute-lead:', err));

                // Processar automações
                const automationPromise = supabase.functions.invoke('process-automation-rules', {
                  body: { trigger_type: 'LEAD_CREATED_META_FORM', trigger_data: { lead_id: newLead.id, organization_id: integration.organization_id, form_id: leadData.form_id, form_name: formName } }
                }).catch((err: any) => console.error('⚠️ process-automation-rules:', err));

                const groupAlertPromise = sendLeadGroupAlert(supabase, {
                  leadId: newLead.id,
                  organizationId: integration.organization_id,
                  sourceLabel: 'Facebook Leads',
                }).catch((err: any) => console.error('lead-group-alert:', err));

                // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions.
                if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
                  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions.
                  EdgeRuntime.waitUntil(Promise.allSettled([distributePromise, automationPromise, groupAlertPromise]));
                }
              }
            } catch (integrationError: any) {
              console.error(`❌ [FB-WEBHOOK] Erro ao processar integração ${integration.id}:`, integrationError.message);
              if (logId) {
                const { error: logUpdateError } = await supabase
                  .from('facebook_webhook_logs')
                  .update({ status: 'error', error_message: integrationError.message })
                  .eq('id', logId);
                if (logUpdateError) console.error('❌ [FB-WEBHOOK] Falha ao atualizar log:', logUpdateError);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error: any) {
      console.error('❌ [FB-WEBHOOK] Erro geral:', error);
      return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
