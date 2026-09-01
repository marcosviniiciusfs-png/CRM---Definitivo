import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import {
  authorizationErrorResponse,
  requireOrganizationMember,
} from '../_shared/organization-auth.ts';
import {
  decryptMetaToken,
  encryptMetaToken,
} from '../_shared/meta-token-crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const { integration_id, page_id, organization_id } = await req.json();

    if (!integration_id || !page_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: integration_id, page_id, organization_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await requireOrganizationMember(req, supabase, organization_id, ['owner', 'admin']);

    console.log(`🔄 [FB-SWITCH-PAGE] Switching integration ${integration_id} to page ${page_id}`);

    // Verify the integration belongs to the given organization
    const { data: integration, error: intError } = await supabase
      .from('facebook_integrations')
      .select('id, user_id, organization_id, page_id')
      .eq('id', integration_id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (intError || !integration) {
      console.error('❌ [FB-SWITCH-PAGE] Integration not found or access denied:', intError);
      return new Response(
        JSON.stringify({ error: 'Integration not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the stored encrypted user (main) access token to fetch fresh page tokens
    let { data: tokenData, error: tokenError } = await supabase.rpc('get_facebook_token_by_integration', {
      p_integration_id: integration_id
    });

    // Fallback if RPC is missing
    if (tokenError || !tokenData || tokenData.length === 0) {
      console.warn('⚠️ [FB-SWITCH-PAGE] RPC failed, trying direct query...');
      const { data: secureData } = await supabase
        .from('facebook_integration_tokens')
        .select('encrypted_access_token, encrypted_page_access_token')
        .eq('integration_id', integration_id)
        .maybeSingle();

      if (secureData) {
        tokenData = [{
          encrypted_access_token: secureData.encrypted_access_token,
          encrypted_page_access_token: secureData.encrypted_page_access_token,
          page_id: integration.page_id
        }];
        tokenError = null;
      }
    }

    if (tokenError || !tokenData || tokenData.length === 0) {
      throw new Error('No tokens found for this integration. Please reconnect Facebook.');
    }

    const { encrypted_access_token } = tokenData[0];

    if (!encrypted_access_token) {
      throw new Error('User access token not available. Please reconnect Facebook.');
    }

    // Decrypt the user access token
    const userAccessToken = await decryptMetaToken(encrypted_access_token);
    if (!userAccessToken) {
      throw new Error('Failed to decrypt user access token. Please reconnect Facebook.');
    }

    // Fetch all pages managed by this user using the user access token
    console.log('🔄 [FB-SWITCH-PAGE] Fetching pages for user...');
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${userAccessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('No pages found for this user. Please reconnect Facebook.');
    }

    // Find the requested page
    const targetPage = pagesData.data.find((p: any) => p.id === page_id);
    if (!targetPage) {
      return new Response(
        JSON.stringify({ error: `Page ${page_id} not found in this account's managed pages` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ [FB-SWITCH-PAGE] Found target page: ${targetPage.name} (${targetPage.id})`);

    // Encrypt the new page access token
    const encryptedPageToken = await encryptMetaToken(targetPage.access_token);
    const encryptedUserToken = await encryptMetaToken(userAccessToken);

    // Update the integration with the new page
    const { error: updateIntError } = await supabase
      .from('facebook_integrations')
      .update({
        page_id: targetPage.id,
        page_name: targetPage.name,
        webhook_verified: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', integration_id);

    if (updateIntError) throw updateIntError;

    // Update the token with the new page access token
    try {
      await supabase.rpc('update_facebook_tokens_secure', {
        p_integration_id: integration_id,
        p_encrypted_access_token: encryptedUserToken,
        p_encrypted_page_access_token: encryptedPageToken
      });
    } catch (e: any) {
      console.warn(`⚠️ [FB-SWITCH-PAGE] Failed to update token via RPC:`, e.message);
      // Try direct update as fallback
      await supabase
        .from('facebook_integration_tokens')
        .update({
          encrypted_access_token: encryptedUserToken,
          encrypted_page_access_token: encryptedPageToken
        })
        .eq('integration_id', integration_id);
    }

    console.log(`✅ [FB-SWITCH-PAGE] Successfully switched to page: ${targetPage.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        page_id: targetPage.id,
        page_name: targetPage.name
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    const authResponse = authorizationErrorResponse(err, corsHeaders);
    if (authResponse) return authResponse;
    console.error('❌ [FB-SWITCH-PAGE] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
