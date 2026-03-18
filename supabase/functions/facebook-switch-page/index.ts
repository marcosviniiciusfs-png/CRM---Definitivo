import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Decrypt token using AES-GCM
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
    return '';
  }
}

// Encrypt token using AES-GCM
async function encryptToken(token: string, key: string): Promise<string> {
  if (!token) return '';
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption error:', error);
    return token;
  }
}

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
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    const userAccessToken = await decryptToken(encrypted_access_token, ENCRYPTION_KEY);
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
    const encryptedPageToken = await encryptToken(targetPage.access_token, ENCRYPTION_KEY);
    const encryptedUserToken = await encryptToken(userAccessToken, ENCRYPTION_KEY);

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
    console.error('❌ [FB-SWITCH-PAGE] Error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
