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
    console.log('🧪 SIMULAÇÃO INICIADA');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Payload EXATO da Evolution API
    const testPayload = {
      event: 'MESSAGES_UPSERT',
      instance: 'crm-9b51c26d-1763172430960',
      data: {
        key: {
          remoteJid: '5511988776655@s.whatsapp.net',
          fromMe: false,
          id: `TEST-${Date.now()}`
        },
        pushName: 'Cliente Real',
        message: {
          conversation: 'Oi, gostaria de falar com vocês!'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };

    console.log('📤 Enviando payload para webhook...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));

    const webhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    console.log('📥 Status do webhook:', response.status);
    
    const responseText = await response.text();
    console.log('📥 Resposta:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    return new Response(
      JSON.stringify({
        success: response.ok,
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
