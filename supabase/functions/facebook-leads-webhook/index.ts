import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

            // 🎯 BUSCAR MAPEAMENTO DE FUNIL PARA FACEBOOK
            console.log('🔍 Buscando mapeamento de funil para Facebook...');
            const { data: funnelMapping } = await supabase
              .from('funnel_source_mappings')
              .select('funnel_id, target_stage_id')
              .eq('source_type', 'facebook')
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
                telefone_lead: leadInfo.phone_number || leadInfo.phone || leadInfo.telefone || '',
                email: leadInfo.email || null,
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