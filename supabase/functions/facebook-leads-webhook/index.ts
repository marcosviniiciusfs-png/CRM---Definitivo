import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para descriptografar tokens
// CORREÇÃO: retorna '' em caso de falha (antes retornava o token cifrado corrompido)
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

    const result = new TextDecoder().decode(decrypted);
    // Validate result looks like a real token (not empty, not the encrypted string)
    if (!result || result.length < 10) return '';
    return result;
  } catch (error) {
    // CRÍTICO: retornar '' para não enviar lixo para a Graph API
    console.error('⚠️ [FB-WEBHOOK] Falha na descriptografia do token:', error);
    return '';
  }
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

// Obtém page_access_token com renovação automática se expirado
async function getSecurePageAccessToken(
  supabase: any,
  integrationId: string,
  pageId: string,
  legacyToken: string | null
): Promise<string> {
  const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

  // 1. Buscar tokens da tabela segura
  const { data: secureTokens } = await supabase
    .from('facebook_integration_tokens')
    .select('encrypted_page_access_token, encrypted_access_token')
    .eq('integration_id', integrationId)
    .maybeSingle();

  let pageToken = '';
  let userToken = '';

  if (secureTokens) {
    pageToken = await decryptToken(secureTokens.encrypted_page_access_token || '', ENCRYPTION_KEY);
    userToken = await decryptToken(secureTokens.encrypted_access_token || '', ENCRYPTION_KEY);
  }

  // 2. Se o page token foi decriptado com sucesso, validar rapidamente
  if (pageToken && pageToken.length > 20) {
    console.log('✅ [FB-WEBHOOK] Page token obtido da tabela segura');
    return pageToken;
  }

  // 3. Tentar usar o user token para obter um page token fresco
  if (userToken && userToken.length > 20) {
    console.log('🔄 [FB-WEBHOOK] Page token inválido, tentando renovar via user token...');
    const freshPageToken = await refreshPageToken(userToken, pageId);
    if (freshPageToken) return freshPageToken;
  }

  // 4. Fallback para token legado (se não for sentinela)
  if (legacyToken && legacyToken !== 'ENCRYPTED_IN_TOKENS_TABLE' && legacyToken.length > 20) {
    console.log('⚠️ [FB-WEBHOOK] Usando token legado de page_access_token');
    return legacyToken;
  }

  console.error('❌ [FB-WEBHOOK] Nenhum token válido encontrado para integrationId:', integrationId);
  return '';
}

// Função para verificar duplicidade de lead
async function checkDuplicateLead(
  supabase: any,
  organizationId: string,
  telefone: string,
  email?: string
): Promise<{
  isDuplicate: boolean;
  existingLead: any | null;
  hasAdvancedInFunnel: boolean;
  matchType: 'phone' | 'email' | null;
}> {
  if (telefone) {
    const { data: leadByPhone } = await supabase
      .from('leads')
      .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history')
      .eq('organization_id', organizationId)
      .eq('telefone_lead', telefone)
      .maybeSingle();

    if (leadByPhone) {
      const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByPhone);
      return { isDuplicate: true, existingLead: leadByPhone, hasAdvancedInFunnel: hasAdvanced, matchType: 'phone' };
    }
  }

  if (email) {
    const { data: leadByEmail } = await supabase
      .from('leads')
      .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle();

    if (leadByEmail) {
      const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByEmail);
      return { isDuplicate: true, existingLead: leadByEmail, hasAdvancedInFunnel: hasAdvanced, matchType: 'email' };
    }
  }

  return { isDuplicate: false, existingLead: null, hasAdvancedInFunnel: false, matchType: null };
}

async function checkIfLeadAdvanced(supabase: any, lead: any): Promise<boolean> {
  if (!lead.funnel_id || !lead.funnel_stage_id) return false;

  const { data: firstStage } = await supabase
    .from('funnel_stages')
    .select('id')
    .eq('funnel_id', lead.funnel_id)
    .order('position')
    .limit(1)
    .maybeSingle();

  return firstStage && firstStage.id !== lead.funnel_stage_id;
}

async function registerDuplicateAttempt(
  supabase: any,
  existingLeadId: string,
  source: string,
  originalPayload: any
) {
  const { data: lead } = await supabase
    .from('leads')
    .select('duplicate_attempts_count, duplicate_attempts_history')
    .eq('id', existingLeadId)
    .single();

  const currentCount = lead?.duplicate_attempts_count || 0;
  const currentHistory = Array.isArray(lead?.duplicate_attempts_history) ? lead.duplicate_attempts_history : [];

  const newEntry = {
    source,
    attempted_at: new Date().toISOString(),
    form_name: originalPayload.formName || null,
    campaign_name: originalPayload.campaignName || null,
    original_data: originalPayload.leadData || null
  };

  await supabase
    .from('leads')
    .update({
      duplicate_attempts_count: currentCount + 1,
      last_duplicate_attempt_at: new Date().toISOString(),
      duplicate_attempts_history: [...currentHistory, newEntry],
      updated_at: new Date().toISOString()
    })
    .eq('id', existingLeadId);

  console.log(`📊 [FB-WEBHOOK] Tentativa de duplicação registrada para lead ${existingLeadId}. Total: ${currentCount + 1}`);
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
    const VERIFY_TOKEN = Deno.env.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN') || 'kairoz_webhook_verify_token';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ [FB-WEBHOOK] Webhook verificado com sucesso');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('📥 [FB-WEBHOOK] Evento recebido:', JSON.stringify(body).slice(0, 500));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field !== 'leadgen') continue;

          const leadgenData = change.value;
          const pageId = leadgenData.page_id || entry.id;
          const leadgenId = leadgenData.leadgen_id;
          // CORREÇÃO CRÍTICA: extrair form_id do payload do webhook
          // O Facebook envia form_id diretamente no payload — usar isso como fonte primária
          const webhookFormId = leadgenData.form_id || null;

          console.log(`🎯 [FB-WEBHOOK] leadgen_id=${leadgenId} page_id=${pageId} form_id=${webhookFormId}`);

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

              // Obter page_access_token com renovação automática
              const pageAccessToken = await getSecurePageAccessToken(
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
                await supabase
                  .from('facebook_integrations')
                  .update({ expires_at: new Date().toISOString() })
                  .eq('id', integration.id)
                  .catch((e: any) => console.warn('⚠️ [FB-WEBHOOK] Erro ao marcar expiração:', e));
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
                  const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';
                  const { data: secureTokens } = await supabase
                    .from('facebook_integration_tokens')
                    .select('encrypted_access_token')
                    .eq('integration_id', integration.id)
                    .maybeSingle();

                  if (secureTokens?.encrypted_access_token) {
                    const userToken = await decryptToken(secureTokens.encrypted_access_token, ENCRYPTION_KEY);
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
              let campaignName = 'N/A';
              let campaignId: string | null = null;
              try {
                if (leadData.ad_id) {
                  const adResp = await fetch(`https://graph.facebook.com/v21.0/${leadData.ad_id}?fields=name,campaign{id,name}&access_token=${pageAccessToken}`);
                  const adData = await adResp.json();
                  campaignName = adData.campaign?.name || adData.name || 'N/A';
                  campaignId = adData.campaign?.id || null;

                  // Se campaignName parece ser um ID numérico, buscar nome real diretamente
                  if (/^\d{10,}$/.test(campaignName)) {
                    console.log(`🔄 [FB-WEBHOOK] Campaign name parece ID (${campaignName}), buscando nome real...`);
                    const potentialId = campaignId || campaignName;
                    const campResp = await fetch(`https://graph.facebook.com/v21.0/${potentialId}?fields=name&access_token=${pageAccessToken}`);
                    const campData = await campResp.json();
                    if (campData.name) {
                      console.log(`✅ [FB-WEBHOOK] Nome real da campanha: ${campData.name}`);
                      campaignName = campData.name;
                      if (!campaignId) campaignId = potentialId;
                    }
                  }
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

              const additionalData = {
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

              // Verificar duplicidade — leads de teste são sempre criados de novo (sem bloqueio)
              const duplicateCheck = isTestLead
                ? { isDuplicate: false, existingLead: null, hasAdvancedInFunnel: false, matchType: null }
                : await checkDuplicateLead(supabase, integration.organization_id, phoneNumber, email || undefined);

              if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
                console.log(`⚠️ [FB-WEBHOOK] Lead duplicado via ${duplicateCheck.matchType}: ${duplicateCheck.existingLead.id}`);
                await registerDuplicateAttempt(supabase, duplicateCheck.existingLead.id, 'Facebook', { leadData, formName, campaignName });

                if (!duplicateCheck.hasAdvancedInFunnel) {
                  const { data: curr } = await supabase.from('leads').select('descricao_negocio').eq('id', duplicateCheck.existingLead.id).single();
                  await supabase.from('leads').update({
                    nome_lead: leadInfo.full_name || leadInfo.nome_completo || leadInfo['first name'] || leadInfo.first_name || leadInfo.name || leadInfo.nome || duplicateCheck.existingLead.nome_lead,
                    email: email || undefined,
                    descricao_negocio: (curr?.descricao_negocio || '') + '\n\n--- NOVA TENTATIVA (' + new Date().toLocaleDateString('pt-BR') + ') ---\n' + allFieldsDescription,
                    additional_data: additionalData,
                    updated_at: new Date().toISOString()
                  }).eq('id', duplicateCheck.existingLead.id);
                }

                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'duplicate', lead_id: duplicateCheck.existingLead.id, error_message: `Lead já existe (match: ${duplicateCheck.matchType})` }).eq('id', logId);
                continue;
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
                const msg = `Erro ao criar lead: ${leadError.message}`;
                console.error(`❌ [FB-WEBHOOK] ${msg}`);
                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'error', error_message: msg }).eq('id', logId);
              } else {
                console.log(`✅ [FB-WEBHOOK] Lead criado: ${newLead.id} | funil=${funnelId} | etapa=${funnelStageId}`);
                if (logId) await supabase.from('facebook_webhook_logs').update({ status: 'success', lead_id: newLead.id, form_id: leadData.form_id }).eq('id', logId);

                // Distribuir na roleta
                supabase.functions.invoke('distribute-lead', {
                  body: { lead_id: newLead.id, organization_id: integration.organization_id, trigger_source: 'facebook' }
                }).catch((err: any) => console.error('⚠️ distribute-lead:', err));

                // Processar automações
                supabase.functions.invoke('process-automation-rules', {
                  body: { trigger_type: 'LEAD_CREATED_META_FORM', trigger_data: { lead_id: newLead.id, organization_id: integration.organization_id, form_id: leadData.form_id, form_name: formName } }
                }).catch((err: any) => console.error('⚠️ process-automation-rules:', err));
              }
            } catch (integrationError: any) {
              console.error(`❌ [FB-WEBHOOK] Erro ao processar integração ${integration.id}:`, integrationError.message);
              if (logId) {
                await supabase.from('facebook_webhook_logs').update({ status: 'error', error_message: integrationError.message }).eq('id', logId).catch(() => {});
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
