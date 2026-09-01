import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import {
  authorizationErrorResponse,
  requireOrganizationMember,
} from '../_shared/organization-auth.ts';
import { decryptMetaToken } from '../_shared/meta-token-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, form_name, integration_id, organization_id } = await req.json();

    // form_id is optional — when omitted, we subscribe at the PAGE level only
    if (!integration_id || !organization_id) {
      throw new Error('Missing required parameters: integration_id, organization_id');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await requireOrganizationMember(req, supabase, organization_id, ['owner', 'admin']);

    const { data: integrationOwner, error: integrationOwnerError } = await supabase
      .from('facebook_integrations')
      .select('id')
      .eq('id', integration_id)
      .eq('organization_id', organization_id)
      .maybeSingle();
    if (integrationOwnerError || !integrationOwner) {
      return new Response(JSON.stringify({ error: 'Integração não pertence à organização' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar tokens de forma segura usando o integration_id específico
    let { data: tokenData, error: tokenError } = await supabase.rpc('get_facebook_token_by_integration', {
      p_integration_id: integration_id
    });

    // Fallback if RPC is missing
    if (tokenError || !tokenData || tokenData.length === 0) {
      console.warn('⚠️ RPC get_facebook_token_by_integration failed or missing, trying fallback...');

      const { data: integrationData, error: intError } = await supabase
        .from('facebook_integrations')
        .select('id, page_id')
        .eq('id', integration_id)
        .maybeSingle();

      if (integrationData) {
        const { data: secureData } = await supabase
          .from('facebook_integration_tokens')
          .select('encrypted_page_access_token')
          .eq('integration_id', integrationData.id)
          .maybeSingle();

        if (secureData) {
          tokenData = [{
            encrypted_page_access_token: secureData.encrypted_page_access_token,
            page_id: integrationData.page_id
          }];
          tokenError = null;
        }
      }
    }

    if (tokenError || !tokenData || tokenData.length === 0) {
      console.error('Error fetching tokens:', tokenError);
      throw new Error('Não foi possível encontrar os tokens de acesso. Por favor, reconecte sua conta do Facebook.');
    }

    // Extrair tokens do primeiro resultado
    const { encrypted_page_access_token, page_id } = tokenData[0];

    // Descriptografar o token
    const pageAccessToken = await decryptMetaToken(encrypted_page_access_token);

    if (!pageAccessToken) {
      throw new Error('Failed to decrypt page access token. Please reconnect Facebook.');
    }

    console.log('Subscribing webhook for page:', page_id, 'form:', form_id);

    // Subscribe to leadgen webhook on the PAGE (not the form)
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${page_id}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: pageAccessToken,
          subscribed_fields: ['leadgen'],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      throw new Error(`Facebook API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Webhook subscribed successfully:', data);

    // Verify the subscription was registered
    try {
      const verifyResponse = await fetch(
        `https://graph.facebook.com/v21.0/${page_id}/subscribed_apps?access_token=${pageAccessToken}`
      );
      const verifyData = await verifyResponse.json();
      console.log('📋 [FB-SUBSCRIBE] Apps atualmente assinados na página:', JSON.stringify(verifyData));
    } catch (verifyErr: any) {
      console.warn('⚠️ [FB-SUBSCRIBE] Falha ao verificar assinaturas:', verifyErr.message);
    }

    // Update integration — only set selected_form_id when a specific form is provided (backwards compat)
    const updatePayload: Record<string, any> = { webhook_verified: true };
    if (form_id) {
      updatePayload.selected_form_id = form_id;
      updatePayload.selected_form_name = form_name || form_id;
    }
    const { error: updateError } = await supabase
      .from('facebook_integrations')
      .update(updatePayload)
      .eq('id', integration_id);

    if (updateError) {
      console.error('Error updating integration:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    const authResponse = authorizationErrorResponse(error, corsHeaders);
    if (authResponse) return authResponse;
    console.error('Error subscribing webhook:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
