import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  // Buscar por telefone (prioridade)
  const { data: leadByPhone } = await supabase
    .from('leads')
    .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history')
    .eq('organization_id', organizationId)
    .eq('telefone_lead', telefone)
    .maybeSingle();

  if (leadByPhone) {
    // Verificar se lead avançou no funil
    const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByPhone);
    return {
      isDuplicate: true,
      existingLead: leadByPhone,
      hasAdvancedInFunnel: hasAdvanced,
      matchType: 'phone'
    };
  }

  // Buscar por email como fallback
  if (email) {
    const { data: leadByEmail } = await supabase
      .from('leads')
      .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle();

    if (leadByEmail) {
      const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByEmail);
      return {
        isDuplicate: true,
        existingLead: leadByEmail,
        hasAdvancedInFunnel: hasAdvanced,
        matchType: 'email'
      };
    }
  }

  return {
    isDuplicate: false,
    existingLead: null,
    hasAdvancedInFunnel: false,
    matchType: null
  };
}

// Verificar se o lead avançou da primeira etapa do funil
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

// Registrar tentativa de duplicação
async function registerDuplicateAttempt(
  supabase: any,
  existingLeadId: string,
  source: string,
  originalPayload: any
) {
  // Buscar dados atuais
  const { data: lead } = await supabase
    .from('leads')
    .select('duplicate_attempts_count, duplicate_attempts_history')
    .eq('id', existingLeadId)
    .single();

  const currentCount = lead?.duplicate_attempts_count || 0;
  const currentHistory = Array.isArray(lead?.duplicate_attempts_history) ? lead.duplicate_attempts_history : [];

  // Adicionar nova entrada no histórico
  const newEntry = {
    source,
    attempted_at: new Date().toISOString(),
    form_name: originalPayload.formName || null,
    campaign_name: originalPayload.campaignName || null,
    original_data: originalPayload.leadData || null
  };

  const updatedHistory = [...currentHistory, newEntry];

  // Atualizar lead
  await supabase
    .from('leads')
    .update({
      duplicate_attempts_count: currentCount + 1,
      last_duplicate_attempt_at: new Date().toISOString(),
      duplicate_attempts_history: updatedHistory,
      updated_at: new Date().toISOString()
    })
    .eq('id', existingLeadId);

  console.log(`📊 Tentativa de duplicação registrada para lead ${existingLeadId}. Total: ${currentCount + 1}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Webhook verification (GET request from Facebook)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    const VERIFY_TOKEN = Deno.env.get('FACEBOOK_WEBHOOK_VERIFY_TOKEN') || 'kairoz_webhook_verify_token';

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return new Response(challenge, { status: 200 });
    }

    return new Response('Forbidden', { status: 403 });
  }

  // Handle webhook events (POST request from Facebook)
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Facebook webhook received:', JSON.stringify(body, null, 2));

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      // Process each entry in the webhook
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'leadgen') {
            const leadgenData = change.value;
            const pageId = leadgenData.page_id;
            const leadgenId = leadgenData.leadgen_id;
            let logId: string | null = null;

            // Get the integration for this page
            const { data: integration } = await supabase
              .from('facebook_integrations')
              .select('*')
              .eq('page_id', pageId)
              .single();

            if (!integration) {
              console.log(`No integration found for page ${pageId}`);

              // Try to find any organization to attach the log to so it appears in the UI
              let fallbackOrgId: string | null = null;
              const { data: anyIntegration } = await supabase
                .from('facebook_integrations')
                .select('organization_id')
                .limit(1)
                .single();

              if (anyIntegration?.organization_id) {
                fallbackOrgId = anyIntegration.organization_id;
              }

              // Log the failed webhook (using a fallback org if available)
              await supabase.from('facebook_webhook_logs').insert({
                event_type: 'leadgen',
                payload: body,
                status: 'error',
                error_message: `No integration found for page ${pageId}`,
                page_id: pageId,
                facebook_lead_id: leadgenId,
                organization_id: fallbackOrgId || '00000000-0000-0000-0000-000000000000',
              });
              
              continue;
            }

            // Create initial log entry
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

            // Fetch lead data from Facebook
            const leadResponse = await fetch(
              `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${integration.page_access_token}`
            );
            const leadData = await leadResponse.json();

            // Fetch form name
            let formName = leadData.form_id;
            try {
              const formResponse = await fetch(
                `https://graph.facebook.com/v18.0/${leadData.form_id}?fields=name&access_token=${integration.page_access_token}`
              );
              const formData = await formResponse.json();
              if (formData.name) {
                formName = formData.name;
              }
            } catch (error) {
              console.log('Could not fetch form name:', error);
            }

            // Fetch ad/campaign name
            let campaignName = leadData.ad_id || 'N/A';
            try {
              if (leadData.ad_id) {
                const adResponse = await fetch(
                  `https://graph.facebook.com/v18.0/${leadData.ad_id}?fields=name,campaign{name}&access_token=${integration.page_access_token}`
                );
                const adData = await adResponse.json();
                if (adData.campaign?.name) {
                  campaignName = adData.campaign.name;
                } else if (adData.name) {
                  campaignName = adData.name;
                }
              }
            } catch (error) {
              console.log('Could not fetch campaign name:', error);
            }

            // Parse field data
            const fieldData = leadData.field_data || [];
            const leadInfo: any = {};
            
            fieldData.forEach((field: any) => {
              leadInfo[field.name] = field.values?.[0] || '';
            });

            // Build description with ALL form fields
            let allFieldsDescription = 'Lead capturado via Facebook Ads\n\n';
            allFieldsDescription += `Formulário: ${formName}\n`;
            allFieldsDescription += `Campanha: ${campaignName}\n\n`;
            allFieldsDescription += '=== INFORMAÇÕES DO FORMULÁRIO ===\n';
            
            // Add all fields to description
            fieldData.forEach((field: any) => {
              const fieldName = field.name;
              const fieldValue = field.values?.[0] || '';
              if (fieldValue) {
                allFieldsDescription += `${fieldName}: ${fieldValue}\n`;
              }
            });

            // Extrair telefone e email para verificação de duplicidade
            const phoneNumber = leadInfo.phone_number || leadInfo.phone || leadInfo.telefone || '';
            const email = leadInfo.email || null;

            // ⚡ VERIFICAR DUPLICIDADE
            console.log('🔍 Verificando duplicidade do lead Facebook...');
            const duplicateCheck = await checkDuplicateLead(
              supabase,
              integration.organization_id,
              phoneNumber,
              email
            );

            if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
              console.log(`⚠️ Lead duplicado detectado via ${duplicateCheck.matchType}:`, duplicateCheck.existingLead.id);

              // Registrar tentativa de duplicação
              await registerDuplicateAttempt(
                supabase,
                duplicateCheck.existingLead.id,
                'Facebook',
                { leadData, formName, campaignName }
              );

              // Se lead NÃO avançou no funil, atualizar dados
              if (!duplicateCheck.hasAdvancedInFunnel) {
                console.log('📝 Atualizando dados do lead existente (não avançou no funil)');
                
                // Buscar descrição atual
                const { data: currentLead } = await supabase
                  .from('leads')
                  .select('descricao_negocio')
                  .eq('id', duplicateCheck.existingLead.id)
                  .single();

                const updatedDescription = (currentLead?.descricao_negocio || '') + 
                  '\n\n--- NOVA TENTATIVA (' + new Date().toLocaleDateString('pt-BR') + ') ---\n' + 
                  allFieldsDescription;

                await supabase
                  .from('leads')
                  .update({
                    nome_lead: leadInfo.full_name || leadInfo.first_name || leadInfo.name || duplicateCheck.existingLead.nome_lead,
                    email: email || undefined,
                    descricao_negocio: updatedDescription,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', duplicateCheck.existingLead.id);
              }

              // Atualizar log com status 'duplicate'
              if (logId) {
                await supabase
                  .from('facebook_webhook_logs')
                  .update({
                    status: 'duplicate',
                    lead_id: duplicateCheck.existingLead.id,
                    error_message: `Lead já existe no CRM (match: ${duplicateCheck.matchType})`
                  })
                  .eq('id', logId);
              }

              // NÃO criar novo lead, NÃO distribuir na roleta
              continue;
            }

            // 🎯 BUSCAR MAPEAMENTO DE FUNIL PARA FACEBOOK
            console.log('🔍 Buscando mapeamento de funil para Facebook...');
            
            // Primeiro, buscar os funis da organização
            const { data: orgFunnels } = await supabase
              .from('sales_funnels')
              .select('id')
              .eq('organization_id', integration.organization_id);
            
            const funnelIds = orgFunnels?.map(f => f.id) || [];
            console.log('🎯 Funis da organização:', funnelIds);
            
            // Depois, buscar o mapeamento para esses funis
            const { data: funnelMapping } = await supabase
              .from('funnel_source_mappings')
              .select('funnel_id, target_stage_id')
              .eq('source_type', 'facebook')
              .in('funnel_id', funnelIds)
              .maybeSingle();
            
            let funnelId: string | null = null;
            let funnelStageId: string | null = null;
            
            if (funnelMapping) {
              console.log('✅ Mapeamento encontrado:', funnelMapping);
              funnelId = funnelMapping.funnel_id;
              funnelStageId = funnelMapping.target_stage_id;
            } else {
              console.log('⚠️ Nenhum mapeamento encontrado, usando funil padrão');
              // Buscar funil padrão da organização
              const { data: defaultFunnel } = await supabase
                .from('sales_funnels')
                .select('id')
                .eq('organization_id', integration.organization_id)
                .eq('is_default', true)
                .maybeSingle();
              
              if (defaultFunnel) {
                funnelId = defaultFunnel.id;
                
                // Buscar primeira etapa do funil padrão
                const { data: firstStage } = await supabase
                  .from('funnel_stages')
                  .select('id')
                  .eq('funnel_id', defaultFunnel.id)
                  .order('position')
                  .limit(1)
                  .maybeSingle();
                
                if (firstStage) {
                  funnelStageId = firstStage.id;
                }
              }
            }

            // Create lead in database with all available information
            const { data: newLead, error: leadError } = await supabase
              .from('leads')
              .insert({
                nome_lead: leadInfo.full_name || leadInfo.first_name || leadInfo.name || 'Lead do Facebook',
                telefone_lead: phoneNumber,
                email: email,
                empresa: leadInfo.company_name || leadInfo.company || leadInfo.empresa || null,
                organization_id: integration.organization_id,
                source: 'Facebook Leads',
                stage: 'NOVO',
                funnel_id: funnelId,
                funnel_stage_id: funnelStageId,
                descricao_negocio: allFieldsDescription,
              })
              .select()
              .single();

            if (leadError) {
              console.error('Error creating lead:', leadError);
              
              // Update log with error
              if (logId) {
                await supabase
                  .from('facebook_webhook_logs')
                  .update({
                    status: 'error',
                    error_message: leadError.message,
                  })
                  .eq('id', logId);
              }
            } else {
              console.log('Lead created successfully from Facebook');
              
              // Update log with success
              if (logId) {
                await supabase
                  .from('facebook_webhook_logs')
                  .update({
                    status: 'success',
                    lead_id: newLead?.id,
                    form_id: leadData.form_id,
                  })
                  .eq('id', logId);
              }

              // ✅ DISTRIBUIR LEAD NA ROLETA
              supabase.functions.invoke('distribute-lead', {
                body: {
                  lead_id: newLead.id,
                  organization_id: integration.organization_id,
                  trigger_source: 'facebook',
                },
              }).then(({ data, error }) => {
                if (error) {
                  console.error('⚠️ Erro ao distribuir lead:', error);
                } else {
                  console.log('✅ Lead distribuído:', data);
                }
              }).catch(err => {
                console.error('⚠️ Falha ao invocar distribute-lead:', err);
              });

              // Processar automações (não bloqueia o retorno)
              supabase.functions.invoke('process-automation-rules', {
                body: {
                  trigger_type: 'LEAD_CREATED_META_FORM',
                  trigger_data: {
                    lead_id: newLead.id,
                    organization_id: integration.organization_id,
                    form_id: leadData.form_id,
                    form_name: formName,
                  },
                },
              }).then(({ data, error }) => {
                if (error) {
                  console.error('⚠️ Erro ao processar automações:', error);
                } else {
                  console.log('✅ Automações processadas:', data);
                }
              }).catch(err => {
                console.error('⚠️ Falha ao invocar process-automation-rules:', err);
              });
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

  } catch (error) {
    console.error('Webhook processing error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
  }

  return new Response('Method not allowed', { status: 405 });
});