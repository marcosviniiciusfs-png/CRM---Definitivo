import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Se usuário negou autorização
    if (error) {
      console.log('❌ Usuário negou autorização:', error);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${Deno.env.get('SUPABASE_URL')}/settings?integration=google_calendar&error=access_denied`,
        },
      });
    }

    if (!code || !state) {
      throw new Error('Código ou state ausente');
    }

    // Decodificar state
    const { user_id } = JSON.parse(atob(state));
    console.log('🔄 Processando callback para usuário:', user_id);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Trocar código por tokens
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
    const redirectUri = `${supabaseUrl}/functions/v1/google-calendar-oauth-callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: googleClientId,
        client_secret: googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('❌ Erro ao trocar código:', errorData);
      throw new Error('Erro ao obter tokens');
    }

    const tokens = await tokenResponse.json();
    console.log('✅ Tokens obtidos com sucesso');

    // Calcular expiração
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Buscar organization_id do usuário
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user_id)
      .single();

    if (!memberData) {
      throw new Error('Organização do usuário não encontrada');
    }

    // Desativar integrações anteriores
    await supabase
      .from('google_calendar_integrations')
      .update({ is_active: false })
      .eq('user_id', user_id);

    // Salvar integração no banco
    const { error: insertError } = await supabase
      .from('google_calendar_integrations')
      .insert({
        organization_id: memberData.organization_id,
        user_id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        calendar_id: 'primary',
        is_active: true,
      });

    if (insertError) {
      console.error('❌ Erro ao salvar integração:', insertError);
      throw insertError;
    }

    console.log('✅ Integração salva com sucesso');

    // Redirecionar para a página de configurações
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Deno.env.get('SUPABASE_URL')}/settings?integration=google_calendar&success=true`,
      },
    });
  } catch (error) {
    console.error('❌ Erro no callback OAuth:', error);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${Deno.env.get('SUPABASE_URL')}/settings?integration=google_calendar&error=callback_failed`,
      },
    });
  }
});