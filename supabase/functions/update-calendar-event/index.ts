import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { eventId, title, description, startDateTime, endDateTime, attendeeEmail } = await req.json();

    if (!eventId) {
      throw new Error('ID do evento é obrigatório');
    }

    console.log('📅 Atualizando evento:', eventId, 'para usuário:', user.id);

    // Buscar integração ativa do usuário
    const { data: integration, error: integrationError } = await supabase
      .from('google_calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (integrationError || !integration) {
      throw new Error('Google Calendar não conectado');
    }

    // Verificar se o token expirou
    const now = new Date();
    const expiresAt = new Date(integration.token_expires_at);
    
    let accessToken = integration.access_token;

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
          refresh_token: integration.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Não foi possível renovar o token');
      }

      const tokens = await refreshResponse.json();
      accessToken = tokens.access_token;

      const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await supabase
        .from('google_calendar_integrations')
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq('id', integration.id);

      console.log('✅ Token renovado');
    }

    // Construir payload do evento
    const eventPayload: any = {};
    
    if (title !== undefined) eventPayload.summary = title;
    if (description !== undefined) eventPayload.description = description;
    
    if (startDateTime) {
      eventPayload.start = {
        dateTime: startDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }
    
    if (endDateTime) {
      eventPayload.end = {
        dateTime: endDateTime,
        timeZone: 'America/Sao_Paulo',
      };
    }

    if (attendeeEmail) {
      eventPayload.attendees = [{ email: attendeeEmail }];
    }

    // Atualizar evento no Google Calendar
    const updateResponse = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${integration.calendar_id}/events/${eventId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventPayload),
      }
    );

    if (!updateResponse.ok) {
      const errorData = await updateResponse.text();
      console.error('❌ Erro ao atualizar evento:', errorData);
      throw new Error('Erro ao atualizar evento no Google Calendar');
    }

    const event = await updateResponse.json();
    console.log('✅ Evento atualizado:', event.id);

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
    console.error('❌ Erro ao atualizar evento:', error);
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
