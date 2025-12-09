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
    
    // Decodificar base64
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    
    // Separar IV e dados criptografados
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
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
      ['decrypt']
    );
    
    // Descriptografar
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  } catch (error) {
    console.log('⚠️ Falha na descriptografia, token pode ser antigo (não criptografado)');
    // Se falhar, pode ser um token antigo não criptografado
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

    // Buscar parâmetros do evento
    const { title, description, startDateTime, endDateTime, attendeeEmail, leadId } = await req.json();

    console.log('📅 Criando evento para usuário:', user.id);

    // Buscar integração ativa do usuário (apenas o próprio usuário pode acessar)
    const { data: integration, error: integrationError } = await supabase
      .from('google_calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google Calendar não conectado');
    }

    // Descriptografar tokens
    let accessToken = await decryptToken(integration.access_token, encryptionKey);
    const refreshToken = await decryptToken(integration.refresh_token, encryptionKey);

    // Verificar se o token expirou
    const now = new Date();
    const expiresAt = new Date(integration.token_expires_at);

    if (now >= expiresAt) {
      console.log('🔄 Token expirado, renovando...');
      
      // Renovar token
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

      // Criptografar novo access token antes de salvar
      const encryptedNewAccessToken = await encryptToken(accessToken, encryptionKey);

      // Atualizar token criptografado no banco
      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await supabase
        .from('google_calendar_integrations')
        .update({
          access_token: encryptedNewAccessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('id', integration.id);

      console.log('✅ Token renovado e criptografado');
    }

    // Criar evento no Google Calendar
    const eventPayload: any = {
      summary: title,
      description: description || '',
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Sao_Paulo',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Sao_Paulo',
      },
    };

    if (attendeeEmail) {
      eventPayload.attendees = [{ email: attendeeEmail }];
    }

    const createEventResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!createEventResponse.ok) {
      const errorData = await createEventResponse.text();
      console.error('❌ Erro ao criar evento:', errorData);
      throw new Error('Erro ao criar evento no Google Calendar');
    }

    const event = await createEventResponse.json();
    console.log('✅ Evento criado:', event.id);

    // Se leadId foi fornecido, atualizar lead com calendar_event_id
    if (leadId) {
      await supabase
        .from('leads')
        .update({ calendar_event_id: event.id })
        .eq('id', leadId);
    }

    return new Response(
      JSON.stringify({
        success: true,
        eventId: event.id,
        eventLink: event.htmlLink,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erro ao criar evento:', error);
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
