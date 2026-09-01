import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabasePublicUrl } from '../_shared/supabase-urls.ts';
import { createOAuthState, getAllowedFrontendOrigin } from '../_shared/oauth-state.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autenticado');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Token inválido');
    }

    console.log('🔐 Iniciando OAuth para usuário:', user.id);

    // Receber origin do frontend para redirect após OAuth
    let requestedOrigin: string | undefined;
    try {
      const body = await req.json();
      if (body?.origin) {
        requestedOrigin = body.origin;
      }
    } catch {
      // Body vazio ou inválido, usar fallback
    }

    const origin = getAllowedFrontendOrigin(requestedOrigin);
    console.log('📍 Origin validada para redirect:', origin);

    // Buscar organização ativa do usuário (multi-org aware)
    const { data: activeOrg } = await supabase
      .from('user_active_org')
      .select('active_organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let organizationId = activeOrg?.active_organization_id;

    // Fallback: buscar primeira organização ativa do usuário
    if (!organizationId) {
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      
      organizationId = memberData?.organization_id;
    }

    if (!organizationId) {
      console.error('❌ Organização do usuário não encontrada');
      throw new Error('Organização do usuário não encontrada. Verifique se você está vinculado a uma organização.');
    }

    console.log('🏢 Organização ativa:', organizationId);

    // Buscar credenciais do Google (devem estar configuradas como secrets)
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const redirectUri = `${getSupabasePublicUrl()}/functions/v1/google-calendar-oauth-callback`;

    // Validação anti-placeholder: detectar se as secrets ainda estão com valores de exemplo
    const isPlaceholder = (value: string | undefined): boolean => {
      if (!value) return true;
      const placeholderPatterns = [
        'PLACEHOLDER',
        'YOUR_',
        'CHANGE_ME',
        'TODO',
        'xxx',
        'example',
      ];
      return placeholderPatterns.some(pattern => 
        value.toUpperCase().includes(pattern.toUpperCase())
      );
    };

    if (!googleClientId || !googleClientSecret) {
      console.error('❌ Credenciais do Google não configuradas');
      throw new Error('SETUP_REQUIRED: Credenciais do Google Calendar não configuradas. Acesse View Backend → Secrets e configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET com os valores do Google Cloud Console.');
    }

    if (isPlaceholder(googleClientId)) {
      console.error('❌ GOOGLE_CLIENT_ID contém valor placeholder:', googleClientId?.substring(0, 20) + '...');
      throw new Error('SETUP_REQUIRED: O GOOGLE_CLIENT_ID está com valor de exemplo. Substitua pelo ID real do OAuth Client (termina com .apps.googleusercontent.com) em View Backend → Secrets.');
    }

    if (isPlaceholder(googleClientSecret)) {
      console.error('❌ GOOGLE_CLIENT_SECRET contém valor placeholder');
      throw new Error('SETUP_REQUIRED: O GOOGLE_CLIENT_SECRET está com valor de exemplo. Substitua pelo segredo real do OAuth Client em View Backend → Secrets.');
    }

    // Validação de formato do Client ID
    if (!googleClientId.endsWith('.apps.googleusercontent.com')) {
      console.error('❌ GOOGLE_CLIENT_ID com formato inválido:', googleClientId?.substring(0, 30) + '...');
      throw new Error('SETUP_REQUIRED: O GOOGLE_CLIENT_ID tem formato inválido. Ele deve terminar com ".apps.googleusercontent.com". Verifique se você copiou o ID correto do Google Cloud Console.');
    }

    // Construir URL de autorização do Google
    const scope = 'https://www.googleapis.com/auth/calendar';
    const state = await createOAuthState({
      user_id: user.id,
      organization_id: organizationId,
      origin,
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${googleClientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scope)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${state}`;

    console.log('✅ URL de autorização gerada');

    return new Response(
      JSON.stringify({ authUrl }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erro ao iniciar OAuth:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
