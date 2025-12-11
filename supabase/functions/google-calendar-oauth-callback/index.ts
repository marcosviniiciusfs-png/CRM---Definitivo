import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Função para criptografar token usando AES-256-GCM
async function encryptToken(plainToken: string, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  
  // Derivar chave de 256 bits usando SHA-256
  const keyMaterial = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(encryptionKey)
  );
  
  const key = await crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Gerar IV aleatório
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Criptografar
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainToken)
  );
  
  // Combinar IV + dados criptografados e converter para base64
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

serve(async (req) => {
  // Fallback padrão para redirect
  let redirectUrl = 'https://kairozspace.com.br';
  
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Decodificar state primeiro para pegar o origin (se disponível)
    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        if (stateData.origin) {
          redirectUrl = stateData.origin;
        }
      } catch {
        // State inválido, usar fallback
      }
    }

    // Se usuário negou autorização
    if (error) {
      console.log('❌ Usuário negou autorização:', error);
      return new Response(null, {
        status: 302,
        headers: {
          'Location': `${redirectUrl}/settings?integration=google_calendar&error=access_denied`,
        },
      });
    }

    if (!code || !state) {
      throw new Error('Código ou state ausente');
    }

    // Decodificar state completo
    const { user_id, origin } = JSON.parse(atob(state));
    if (origin) redirectUrl = origin;
    console.log('🔄 Processando callback para usuário:', user_id, 'redirect:', redirectUrl);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!encryptionKey) {
      throw new Error('Chave de criptografia não configurada');
    }

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

    // Criptografar tokens antes de salvar
    const encryptedAccessToken = await encryptToken(tokens.access_token, encryptionKey);
    const encryptedRefreshToken = await encryptToken(tokens.refresh_token, encryptionKey);
    console.log('🔐 Tokens criptografados com sucesso');

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

    // Salvar integração (apenas metadados, sem tokens)
    const { data: integration, error: insertError } = await supabase
      .from('google_calendar_integrations')
      .insert({
        organization_id: memberData.organization_id,
        user_id,
        token_expires_at: expiresAt,
        calendar_id: 'primary',
        is_active: true,
      })
      .select('id')
      .single();

    if (insertError || !integration) {
      console.error('❌ Erro ao salvar integração:', insertError);
      throw insertError;
    }

    // Salvar tokens na tabela segura separada
    const { error: tokenInsertError } = await supabase
      .from('google_calendar_tokens')
      .upsert({
        integration_id: integration.id,
        encrypted_access_token: encryptedAccessToken,
        encrypted_refresh_token: encryptedRefreshToken,
        token_expires_at: expiresAt,
      }, {
        onConflict: 'integration_id'
      });

    if (tokenInsertError) {
      console.error('❌ Erro ao salvar tokens:', tokenInsertError);
      throw tokenInsertError;
    }

    console.log('✅ Integração e tokens salvos com segurança');

    // Redirecionar para a página de configurações do frontend
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${redirectUrl}/settings?integration=google_calendar&success=true`,
      },
    });
  } catch (error) {
    console.error('❌ Erro no callback OAuth:', error);
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${redirectUrl}/settings?integration=google_calendar&error=callback_failed`,
      },
    });
  }
});
