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

            // Get the integration for this page
            const { data: integration } = await supabase
              .from('facebook_integrations')
              .select('*')
              .eq('page_id', pageId)
              .single();

            if (!integration) {
              console.log(`No integration found for page ${pageId}`);
              continue;
            }

            // Fetch lead data from Facebook
            const leadResponse = await fetch(
              `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${integration.page_access_token}`
            );
            const leadData = await leadResponse.json();

            // Parse field data
            const fieldData = leadData.field_data || [];
            const leadInfo: any = {};
            
            fieldData.forEach((field: any) => {
              leadInfo[field.name] = field.values?.[0] || '';
            });

            // Create lead in database
            const { error: leadError } = await supabase
              .from('leads')
              .insert({
                nome_lead: leadInfo.full_name || leadInfo.first_name || 'Lead do Facebook',
                telefone_lead: leadInfo.phone_number || leadInfo.phone || '',
                email: leadInfo.email || null,
                organization_id: integration.organization_id,
                source: 'Facebook Leads',
                stage: 'NOVO',
                descricao_negocio: `Lead capturado via Facebook Ads\n\nFormulário: ${leadData.form_id}\nCampanha: ${leadData.ad_id || 'N/A'}`,
              });

            if (leadError) {
              console.error('Error creating lead:', leadError);
            } else {
              console.log('Lead created successfully from Facebook');
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