import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';
import { getSupabasePublicUrl } from '../_shared/supabase-urls.ts';
import { createOAuthState, getAllowedFrontendOrigin } from '../_shared/oauth-state.ts';

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
    const { organization_id, origin: body_origin } = body;
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: authData, error: authError } = await supabase.auth.getUser(
      authHeader.slice('Bearer '.length),
    );
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const user_id = authData.user.id;

    console.log('🚀 [FB-INIT] Iniciando OAuth para:', { user_id, organization_id });

    if (!user_id || !organization_id) {
      console.error('❌ [FB-INIT] Parâmetros ausentes:', { user_id, organization_id });
      return new Response(
        JSON.stringify({ error: 'Identificação do usuário ou organização ausente. Por favor, recarregue a página.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user_id)
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!membership) {
      return new Response(JSON.stringify({ error: 'Usuário não pertence à organização' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
    const SUPABASE_PUBLIC_URL = getSupabasePublicUrl();

    if (!FACEBOOK_APP_ID) {
      console.error('❌ [FB-INIT] FACEBOOK_APP_ID não configurado');
      throw new Error('Configuração do servidor incompleta (FACEBOOK_APP_ID)');
    }

    // SEMPRE usar a URL da edge function como redirect_uri para o Facebook
    // (o frontend não deve sobrescrever isso — causa mismatch no callback)
    const SUPABASE_CALLBACK_URI = `${SUPABASE_PUBLIC_URL}/functions/v1/facebook-oauth-callback`;
    const REDIRECT_URI = SUPABASE_CALLBACK_URI;
    const origin = getAllowedFrontendOrigin(body_origin || req.headers.get('origin'));

    const state = await createOAuthState({
      user_id,
      organization_id,
      origin,
      redirect_uri: REDIRECT_URI,
    });

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
