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
    console.log('🧪 SIMULAÇÃO - Criando payload de teste da Evolution API');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Payload simulando Evolution API exatamente como ela envia
    const testPayload = {
      event: 'MESSAGES_UPSERT',
      instance: 'crm-9b51c26d-1763172430960',
      data: {
        key: {
          remoteJid: '5511999888777@s.whatsapp.net',
          fromMe: false,
          id: `MSG-TEST-${Date.now()}`
        },
        pushName: 'Cliente Simulado',
        message: {
          conversation: 'Olá! Esta é uma mensagem de teste simulada da Evolution API.'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };

    console.log('📤 Enviando para webhook:', JSON.stringify(testPayload, null, 2));

    // Chamar o webhook
    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const responseText = await response.text();
    console.log('📥 Resposta do webhook (status):', response.status);
    console.log('📥 Resposta do webhook (body):', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return new Response(
      JSON.stringify({
        success: response.ok,
        message: 'Payload de teste enviado para o webhook',
        webhookStatus: response.status,
        webhookResponse: responseData,
        testPayload
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
