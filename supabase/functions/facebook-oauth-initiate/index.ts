const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, organization_id } = await req.json();

    if (!user_id || !organization_id) {
      throw new Error('Missing user_id or organization_id');
    }

    const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/facebook-oauth-callback`;

    // Get the origin from the request for proper redirect after OAuth
    const origin = req.headers.get('origin') || req.headers.get('referer')?.split('/').slice(0, 3).join('/');
    
    // Create state parameter with user info and origin for redirect
    const state = btoa(JSON.stringify({ user_id, organization_id, origin }));

    // Required permissions for Facebook Leads and Ads
    const scopes = [
      'leads_retrieval',
      'pages_manage_ads',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'ads_read',
    ].join(',');


    // Generate OAuth URL
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}` +
      `&scope=${scopes}`;

    // Log the generated URLs for debugging
    console.log('Facebook OAuth initiate - REDIRECT_URI:', REDIRECT_URI);
    console.log('Facebook OAuth initiate - FACEBOOK_APP_ID:', FACEBOOK_APP_ID);
    console.log('Facebook OAuth initiate - Full auth URL:', authUrl);
    console.log('Facebook OAuth initiate - Origin from request:', origin);

    return new Response(
      JSON.stringify({ auth_url: authUrl }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('OAuth initiate error:', error);
    
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