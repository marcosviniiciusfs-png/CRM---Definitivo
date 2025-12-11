import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Função para descriptografar token
async function decryptToken(encryptedToken: string, encryptionKey: string): Promise<string> {
  try {
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const keyMaterial = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(encryptionKey)
    );
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyMaterial,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    console.log('⚠️ Falha na descriptografia, token pode ser antigo (não criptografado)');
    return encryptedToken;
  }
}

// Função para criptografar token
async function encryptToken(plainToken: string, encryptionKey: string): Promise<string> {
  const encoder = new TextEncoder();
  
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
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plainToken)
  );
  
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!encryptionKey) {
      throw new Error('Chave de criptografia não configurada');
    }

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

    // Buscar parâmetros
    const { timeMin, timeMax } = await req.json();

    console.log('📅 Buscando eventos para usuário:', user.id);
    console.log('📅 Período:', timeMin, 'até', timeMax);

    // Buscar tokens via função segura
    const { data: tokenData, error: tokenError } = await supabase
      .rpc('get_google_calendar_tokens_secure', { target_user_id: user.id });

    if (tokenError || !tokenData || tokenData.length === 0) {
      throw new Error('Google Calendar não conectado');
    }

    const integration = tokenData[0];

    // Descriptografar tokens
    let accessToken = await decryptToken(integration.encrypted_access_token, encryptionKey);
    const refreshToken = await decryptToken(integration.encrypted_refresh_token, encryptionKey);

    // Verificar se o token expirou
    const now = new Date();
    const expiresAt = new Date(integration.token_expires_at);

    if (now >= expiresAt) {
      console.log('🔄 Token expirado, renovando...');
      
      const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
      const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: googleClientId,
          client_secret: googleClientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Não foi possível renovar o token');
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      // Criptografar novo access token
      const encryptedNewAccessToken = await encryptToken(accessToken, encryptionKey);

      // Atualizar token na tabela segura
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await supabase.rpc('update_google_calendar_tokens_secure', {
        p_integration_id: integration.integration_id,
        p_encrypted_access_token: encryptedNewAccessToken,
        p_token_expires_at: newExpiresAt,
      });

      // Atualizar expiração na tabela de integrações
      await supabase
        .from('google_calendar_integrations')
        .update({ token_expires_at: newExpiresAt })
        .eq('id', integration.integration_id);

      console.log('✅ Token renovado e criptografado');
    }

    // Buscar eventos do Google Calendar
    const params = new URLSearchParams({
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const eventsResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    if (!eventsResponse.ok) {
      const errorData = await eventsResponse.text();
      console.error('❌ Erro ao buscar eventos:', errorData);
      throw new Error('Erro ao buscar eventos do Google Calendar');
    }

    const eventsData = await eventsResponse.json();
    console.log('✅ Eventos encontrados:', eventsData.items?.length || 0);

    // Mapear eventos para formato simplificado
    const events = (eventsData.items || []).map((event: any) => ({
      id: event.id,
      title: event.summary || 'Sem título',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      location: event.location || '',
      attendees: event.attendees?.map((a: any) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
      })) || [],
      htmlLink: event.htmlLink,
      colorId: event.colorId,
    }));

    return new Response(
      JSON.stringify({ events }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erro ao listar eventos:', error);
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
