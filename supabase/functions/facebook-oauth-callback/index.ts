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

    // Parse state to get user_id and organization_id
    const stateData = JSON.parse(atob(state));
    const { user_id, organization_id } = stateData;

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

    // Store in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (longLivedTokenData.expires_in || 5184000)); // 60 days default

    const { error: dbError } = await supabase
      .from('facebook_integrations')
      .insert({
        user_id,
        organization_id,
        access_token: longLivedTokenData.access_token,
        expires_at: expiresAt.toISOString(),
        page_id: pagesData.data?.[0]?.id || null,
        page_name: pagesData.data?.[0]?.name || null,
        page_access_token: pagesData.data?.[0]?.access_token || null,
      });

    if (dbError) {
      console.error('Database error:', dbError);
      throw dbError;
    }

    // Redirect back to settings page with success
    return Response.redirect(
      `${url.origin}/settings?tab=integracoes&facebook=success`,
      302
    );

  } catch (error) {
    console.error('OAuth callback error:', error);
    
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