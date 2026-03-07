import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Função para criptografar tokens
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

  const url = new URL(req.url);
  let code = url.searchParams.get('code');
  let state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Suporte a chamada via POST (API do Frontend)
  let isApiCall = false;
  let customRedirectUri: string | null = null;

  if (req.method === 'POST') {
    try {
      const body = await req.json();
      code = body.code || code;
      state = body.state || state;
      customRedirectUri = body.redirect_uri || null;
      isApiCall = true;
    } catch (e) {
      console.warn('⚠️ [FB-CALLBACK] Erro ao ler body JSON, tentando via query params');
    }
  }

  console.log(`📬 [FB-CALLBACK] Recebida resposta do Facebook (${isApiCall ? 'API' : 'Redirect'})`);

  // Default redirect on error
  const defaultOrigin = 'https://www.kairozcrm.com.br';
  let origin = defaultOrigin;
  let user_id: string | null = null;
  let organization_id: string | null = null;

  try {
    if (state) {
      console.log('🔄 [FB-CALLBACK] Decodificando state:', state);
      // Handle URL-safe base64 normalization
      let normalizedState = state.replace(/-/g, '+').replace(/_/g, '/');
      // Adicionar padding se necessário
      while (normalizedState.length % 4 !== 0) {
        normalizedState += '=';
      }

      const decodedState = atob(normalizedState);
      const stateData = JSON.parse(decodedState);

      user_id = stateData.user_id;
      organization_id = stateData.organization_id;

      if (stateData.origin) {
        origin = stateData.origin.replace(/\/$/, '');
      }
      console.log('✅ [FB-CALLBACK] State decodificado:', { user_id, organization_id, origin });
    }
  } catch (e) {
    console.error('❌ [FB-CALLBACK] Falha ao decodificar state:', e instanceof Error ? e.message : e);
  }

  // Use current origin if we couldn't get one from state or it's just the default
  if (!origin || origin === 'https://www.kairozcrm.com.br') {
    const requestOrigin = req.headers.get('origin');
    if (requestOrigin) origin = requestOrigin.replace(/\/$/, '');
  }

  // Se houver erro do Facebook (ex: usuário cancelou)
  if (error) {
    console.error('❌ [FB-CALLBACK] Erro do Facebook:', error, errorDescription);
    if (isApiCall) {
      return new Response(JSON.stringify({ error: errorDescription || error }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const errorRedirect = `${origin}/integrations?facebook=error&message=${encodeURIComponent(errorDescription || error)}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': errorRedirect }
    });
  }

  // Validar se temos o necessário
  if (!code || !user_id || !organization_id) {
    console.error('❌ [FB-CALLBACK] Dados insuficientes:', { code: !!code, user_id, organization_id });
    const msg = 'Fluxo de autenticação corrompido ou expirado.';
    if (isApiCall) {
      return new Response(JSON.stringify({ error: msg }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const errorRedirect = `${origin}/integrations?facebook=error&message=${encodeURIComponent(msg)}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': errorRedirect }
    });
  }

  const FACEBOOK_APP_ID = Deno.env.get('FACEBOOK_APP_ID');
  const FACEBOOK_APP_SECRET = Deno.env.get('FACEBOOK_APP_SECRET');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_CALLBACK_URI = `${SUPABASE_URL}/functions/v1/facebook-oauth-callback`;
  const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    console.error('❌ [FB-CALLBACK] Configurações de ambiente ausentes');
    const errorRedirect = `${origin}/integrations?facebook=error&message=${encodeURIComponent('O servidor não está configurado para o Facebook.')}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': errorRedirect }
    });
  }

  try {
    // 1. Exchange authorization code for short-lived token
    const exchangeRedirectUri = isApiCall && customRedirectUri
      ? customRedirectUri
      : SUPABASE_CALLBACK_URI;

    console.log('🔄 [FB-CALLBACK] Obtendo access_token com redirect_uri:', exchangeRedirectUri);

    const tokenResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(exchangeRedirectUri)}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&code=${code}`
    );
    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('❌ [FB-CALLBACK] Erro na troca de token:', tokenData);
      throw new Error(tokenData.error?.message || 'Erro ao validar acesso com o Facebook.');
    }

    // 2. Trocar pelo token de longa duração (60 dias)
    console.log('🔄 [FB-CALLBACK] Convertendo para token de longa duração...');
    const longLivedResponse = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${FACEBOOK_APP_ID}` +
      `&client_secret=${FACEBOOK_APP_SECRET}` +
      `&fb_exchange_token=${tokenData.access_token}`
    );
    const longLivedData = await longLivedResponse.json();
    const accessToken = longLivedData.access_token || tokenData.access_token;

    // 3. Buscar páginas do usuário
    console.log('🔄 [FB-CALLBACK] Buscando páginas gerenciadas...');
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,business&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();

    if (!pagesData.data || pagesData.data.length === 0) {
      throw new Error('Nenhuma página do Facebook foi encontrada vinculada a esta conta.');
    }

    const selectedPage = pagesData.data[0];
    const businessId = selectedPage?.business?.id || null;
    const businessName = selectedPage?.business?.name || null;

    console.log(`💾 [FB-CALLBACK] Salvando integração para página: ${selectedPage.name} (${selectedPage.id})`);

    const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_SERVICE_ROLE_KEY ?? '');
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (longLivedData.expires_in || 5184000));

    const encryptedMainToken = await encryptToken(accessToken, ENCRYPTION_KEY);

    // Upsert da integração buscando por user_id + organization_id (Uma por usuário/org)
    const { data: existing } = await supabase
      .from('facebook_integrations')
      .select('id')
      .eq('user_id', user_id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    let integrationId: string;

    if (existing?.id) {
      const { error: updErr } = await supabase
        .from('facebook_integrations')
        .update({
          expires_at: expiresAt.toISOString(),
          page_id: selectedPage.id,
          page_name: selectedPage.name,
          business_id: businessId,
          business_name: businessName,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updErr) throw updErr;
      integrationId = existing.id;
    } else {
      const { data: insData, error: insErr } = await supabase
        .from('facebook_integrations')
        .insert({
          user_id,
          organization_id,
          expires_at: expiresAt.toISOString(),
          page_id: selectedPage.id,
          page_name: selectedPage.name,
          business_id: businessId,
          business_name: businessName,
          webhook_verified: false
        })
        .select('id')
        .single();

      if (insErr) throw insErr;
      integrationId = insData.id;
    }

    // 5. Salvar tokens na tabela segura com CRIPTOGRAFIA
    try {
      const encryptedPageToken = await encryptToken(selectedPage.access_token, ENCRYPTION_KEY);

      await supabase.rpc('update_facebook_tokens_secure', {
        p_integration_id: integrationId,
        p_encrypted_access_token: encryptedMainToken,
        p_encrypted_page_access_token: encryptedPageToken
      });
    } catch (e: any) {
      console.warn(`⚠️ [FB-CALLBACK] Falha no storage seguro para ${selectedPage.name}:`, e.message);
    }

    console.log('✅ [FB-CALLBACK] Integração única concluída com sucesso!');
    if (isApiCall) {
      return new Response(JSON.stringify({
        success: true,
        integration_id: integrationId,
        page_name: selectedPage.name
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const finalRedirect = `${origin}/integrations?facebook=success`;
    console.log('🔗 [FB-CALLBACK] Redirecionando para:', finalRedirect);

    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': finalRedirect }
    });

  } catch (err: any) {
    console.error('❌ [FB-CALLBACK] Erro fatal:', err.message);
    if (isApiCall) {
      return new Response(JSON.stringify({ error: err.message || 'Erro no processamento da conta' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    const errorRedirect = `${origin}/integrations?facebook=error&message=${encodeURIComponent(err.message || 'Erro no processamento da conta')}`;
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, 'Location': errorRedirect }
    });
  }
});
