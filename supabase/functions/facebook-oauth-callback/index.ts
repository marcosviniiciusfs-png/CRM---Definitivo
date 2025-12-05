import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Get user's pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?access_token=${longLivedTokenData.access_token}`
    );
    const pagesData = await pagesResponse.json();
    
    console.log('Facebook pages response:', JSON.stringify(pagesData, null, 2));

    // Check if user has pages
    if (!pagesData.data || pagesData.data.length === 0) {
      console.error('No Facebook pages found for user');
      throw new Error('Nenhuma página do Facebook encontrada. Você precisa ter uma página do Facebook para usar esta integração.');
    }

    // Get user's ad accounts
    const adAccountsResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/adaccounts?fields=id,name,account_status&access_token=${longLivedTokenData.access_token}`
    );
    const adAccountsData = await adAccountsResponse.json();
    
    console.log('Facebook ad accounts response:', JSON.stringify(adAccountsData, null, 2));

    // Find first active ad account (account_status = 1 means active)
    const activeAdAccount = adAccountsData.data?.find((acc: any) => acc.account_status === 1);
    const adAccountId = activeAdAccount?.id || adAccountsData.data?.[0]?.id || null;

    // Store in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (longLivedTokenData.expires_in || 5184000)); // 60 days default

    // Use upsert to update existing integration or create new one
    const { error: dbError } = await supabase
      .from('facebook_integrations')
      .upsert({
        user_id,
        organization_id,
        access_token: longLivedTokenData.access_token,
        expires_at: expiresAt.toISOString(),
        page_id: pagesData.data?.[0]?.id || null,
        page_name: pagesData.data?.[0]?.name || null,
        page_access_token: pagesData.data?.[0]?.access_token || null,
        ad_account_id: adAccountId,
      }, {
        onConflict: 'user_id,organization_id'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

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