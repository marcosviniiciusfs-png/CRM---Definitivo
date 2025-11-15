import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 TESTANDO WEBHOOK - Simulando mensagem da Evolution API');

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const instanceName = 'crm-9b51c26d-1763172430960';

    // Primeiro, verificar se o webhook está registrado na Evolution API
    console.log('📡 Verificando configuração do webhook na Evolution API...');
    
    const webhookCheckResponse = await fetch(
      `${evolutionApiUrl}/webhook/find/${instanceName}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
      }
    );

    const webhookConfig = await webhookCheckResponse.json();
    console.log('🔍 Configuração atual do webhook:', JSON.stringify(webhookConfig, null, 2));

    // Configurar/atualizar o webhook para receber eventos de mensagem
    console.log('🔄 Configurando webhook para eventos de mensagem...');
    
    const webhookSetResponse = await fetch(
      `${evolutionApiUrl}/webhook/set/${instanceName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          enabled: true,
          url: 'https://uvwanpztskkhzdqifbai.supabase.co/functions/v1/whatsapp-message-webhook',
          webhook_by_events: true,
          events: [
            'MESSAGES_UPSERT',
            'messages.upsert'
          ]
        }),
      }
    );

    const webhookSetResult = await webhookSetResponse.json();
    console.log('✅ Resultado da configuração:', JSON.stringify(webhookSetResult, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook configurado com sucesso na Evolution API',
        webhookConfig,
        webhookSetResult
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ ERRO:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
