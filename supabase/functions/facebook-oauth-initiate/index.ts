const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { user_id, organization_id, origin: body_origin } = body;

    console.log('🚀 [FB-INIT] Iniciando OAuth para:', { user_id, organization_id });

    if (!user_id || !organization_id) {
      console.error('❌ [FB-INIT] Parâmetros ausentes:', { user_id, organization_id });
      return new Response(
        JSON.stringify({ error: 'Identificação do usuário ou organização ausente. Por favor, recarregue a página.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

    if (!FACEBOOK_APP_ID) {
      console.error('❌ [FB-INIT] FACEBOOK_APP_ID não configurado');
      throw new Error('Configuração do servidor incompleta (FACEBOOK_APP_ID)');
    }

    // SEMPRE usar a URL da edge function como redirect_uri para o Facebook
    // (o frontend não deve sobrescrever isso — causa mismatch no callback)
    const SUPABASE_CALLBACK_URI = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
    const REDIRECT_URI = SUPABASE_CALLBACK_URI;
    const origin = body_origin || req.headers.get('origin')?.replace(/\/$/, '') || 'https://www.kairozcrm.com.br';

    // Encode state como JSON base64-safe
    // Incluir redirect_uri no state para que o callback use exatamente o mesmo valor
    const stateObj = { user_id, organization_id, origin, redirect_uri: REDIRECT_URI };
    const stateStr = JSON.stringify(stateObj);
    const state = btoa(stateStr)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    console.log('🔄 [FB-INIT] Preparando OAuth:', {
      organization_id,
      redirect_uri: REDIRECT_URI,
      origin
    });

    const scopes = [
      'leads_retrieval',
      'pages_manage_ads',
      'pages_manage_metadata',
      'pages_show_list',
      'pages_read_engagement',
      'business_management',
      'ads_read',
      'public_profile',
      'email'
    ].join(',');

    const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&state=${state}` +
      `&scope=${scopes}`;

    console.log('✅ [FB-INIT] URL gerada com sucesso');

    return new Response(
      JSON.stringify({ auth_url: authUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro interno desconhecido';
    console.error('❌ [FB-INIT] Erro fatal:', errorMsg);

    return new Response(
      JSON.stringify({ error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});