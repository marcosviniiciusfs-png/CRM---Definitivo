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

    // Create state parameter with user info
    const state = btoa(JSON.stringify({ user_id, organization_id }));

    // Required permissions for Facebook Leads
    const scopes = [
      'leads_retrieval',
      'pages_manage_ads',
    ].join(',');


    // Generate OAuth URL
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}` +
      `&scope=${scopes}`;

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