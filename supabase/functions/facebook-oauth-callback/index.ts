import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para criptografar tokens usando AES-256
async function encryptToken(token: string, key: string): Promise<string> {
  if (!token) return '';
  
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  
  // Derivar chave de 256 bits do key string
  const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Gerar IV aleatório
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Criptografar
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    data
  );
  
  // Combinar IV + encrypted data e converter para base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    // Parse state to get user_id, organization_id and origin
    const stateData = JSON.parse(atob(state));
    const { user_id, organization_id, origin } = stateData;

    const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
    const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/facebook-oauth-callback`;

    // Exchange code for access token
    const tokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&code=${code}`
    );

    const tokenData = await tokenResponse.json();
    
    if (!tokenData.access_token) {
      throw new Error('Failed to get access token from Facebook');
    }

    // Exchange short-lived token for long-lived token
    const longLivedTokenResponse = await fetch(
      `https://graph.facebook.com/v18.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${FACEBOOK_APP_ID}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&fb_exchange_token=${tokenData.access_token}`
    );

    const longLivedTokenData = await longLivedTokenResponse.json();

    // Get user's pages WITH business information
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,business&access_token=${longLivedTokenData.access_token}`
    );
    const pagesData = await pagesResponse.json();
    
    console.log('Facebook pages response:', JSON.stringify(pagesData, null, 2));

    // Check if user has pages
    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('No Facebook pages found for user');
      throw new Error('Nenhuma página do Facebook encontrada. Você precisa ter uma página do Facebook para usar esta integração.');
    }

    // Get the selected page and its Business Manager
    const selectedPage = pagesData.data[0];
    const businessId = selectedPage?.business?.id || null;
    const businessName = selectedPage?.business?.name || null;

    console.log(`Selected page: ${selectedPage?.name}, Business ID: ${businessId}, Business Name: ${businessName}`);

    // Fetch ad accounts based on Business Manager association
    let adAccountsData: { data?: any[] } = { data: [] };

    if (businessId) {
      // Page has a Business Manager - fetch ad accounts owned by that BM
      console.log(`Fetching ad accounts for Business Manager ${businessId}...`);
      
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v18.0/${businessId}/owned_ad_accounts?fields=id,name,account_status&access_token=${longLivedTokenData.access_token}`
      );
      adAccountsData = await adAccountsResponse.json();
      
      console.log(`Business ${businessId} owned ad accounts response:`, JSON.stringify(adAccountsData, null, 2));
      
      // If no owned accounts, try client ad accounts
      if (!adAccountsData.data || adAccountsData.data.length === 0) {
        console.log(`No owned ad accounts found, trying client ad accounts...`);
        const clientAdAccountsResponse = await fetch(
          `https://graph.facebook.com/v18.0/${businessId}/client_ad_accounts?fields=id,name,account_status&access_token=${longLivedTokenData.access_token}`
        );
        const clientAdAccountsData = await clientAdAccountsResponse.json();
        console.log(`Business ${businessId} client ad accounts response:`, JSON.stringify(clientAdAccountsData, null, 2));
        
        if (clientAdAccountsData.data && clientAdAccountsData.data.length > 0) {
          adAccountsData = clientAdAccountsData;
        }
      }
    } else {
      // No Business Manager associated - fallback to user's personal ad accounts
      console.log('No Business Manager found for page, fetching user ad accounts...');
      
      const adAccountsResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${longLivedTokenData.access_token}`
      );
      adAccountsData = await adAccountsResponse.json();
      
      console.log('User ad accounts response:', JSON.stringify(adAccountsData, null, 2));
    }

    // Format all ad accounts with their details
    const adAccounts = adAccountsData.data?.map((acc: any) => ({
      id: acc.id,
      name: acc.name || 'Conta sem nome',
      status: acc.account_status
    })) || [];

    // Find first active ad account (account_status = 1 means active)
    const activeAdAccount = adAccounts.find((acc: any) => acc.status === 1);
    const defaultAdAccountId = activeAdAccount?.id || adAccounts[0]?.id || null;

    console.log(`Found ${adAccounts.length} ad accounts for BM ${businessId || 'N/A'}, default: ${defaultAdAccountId}`);

    // Store in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (longLivedTokenData.expires_in || 5184000)); // 60 days default

    // Obter chave de criptografia
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

    // Criptografar tokens
    const encryptedAccessToken = await encryptToken(longLivedTokenData.access_token, ENCRYPTION_KEY);
    const encryptedPageAccessToken = await encryptToken(selectedPage?.access_token || '', ENCRYPTION_KEY);

    // Use upsert to update existing integration or create new one (sem tokens)
    const { data: integrationData, error: dbError } = await supabase
      .from('facebook_integrations')
      .upsert({
        user_id,
        organization_id,
        access_token: 'ENCRYPTED_IN_TOKENS_TABLE', // Placeholder para manter compatibilidade
        expires_at: expiresAt.toISOString(),
        page_id: selectedPage?.id || null,
        page_name: selectedPage?.name || null,
        page_access_token: 'ENCRYPTED_IN_TOKENS_TABLE', // Placeholder
        business_id: businessId,
        business_name: businessName,
        ad_account_id: defaultAdAccountId,
        ad_accounts: adAccounts,
      }, {
        onConflict: 'user_id,organization_id'
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    // Armazenar tokens criptografados na tabela segura
    if (integrationData?.id) {
      const { error: tokenError } = await supabase.rpc('update_facebook_tokens_secure', {
        p_integration_id: integrationData.id,
        p_encrypted_access_token: encryptedAccessToken,
        p_encrypted_page_access_token: encryptedPageAccessToken
      });

      if (tokenError) {
        console.error('Token storage error:', tokenError);
        // Não falhar completamente, apenas logar o erro
      }
    }

    console.log('Facebook integration saved with encrypted tokens');

    // Redirect back to settings page with success using the app origin
    const redirectUrl = origin || url.origin;
    return Response.redirect(
      `${redirectUrl}/settings?tab=integracoes&facebook=success`,
      302
    );

  } catch (error) {
    console.error('OAuth callback error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Redirect to settings page with error message
    const url = new URL(req.url);
    const state = url.searchParams.get('state');
    let redirectOrigin = url.origin;
    
    try {
      if (state) {
        const stateData = JSON.parse(atob(state));
        redirectOrigin = stateData.origin || redirectOrigin;
      }
    } catch (e) {
      console.error('Failed to parse state:', e);
    }
    
    return Response.redirect(
      `${redirectOrigin}/settings?tab=integracoes&facebook=error&message=${encodeURIComponent(errorMessage)}`,
      302
    );
  }
});
