import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 TESTE - Simulando payload da Evolution API');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar instância conectada
    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, user_id')
      .eq('status', 'CONNECTED')
      .single();

    if (!instance) {
      throw new Error('Nenhuma instância conectada');
    }

    console.log('✅ Instância encontrada:', instance.instance_name);

    // Simular payload da Evolution API exatamente como ela envia
    const simulatedPayload = {
      event: 'MESSAGES_UPSERT',
      instance: instance.instance_name,
      data: {
        key: {
          remoteJid: '5511987654321@s.whatsapp.net',
          fromMe: false,
          id: `TEST-${Date.now()}`
        },
        pushName: 'Cliente Teste',
        message: {
          conversation: 'Olá! Eu quero saber mais sobre seus produtos.'
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      }
    };

    console.log('📤 Enviando payload para webhook:', JSON.stringify(simulatedPayload, null, 2));

    // Enviar para o webhook
    const webhookResponse = await fetch(
      `${supabaseUrl}/functions/v1/whatsapp-message-webhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(simulatedPayload),
      }
    );

    const webhookResult = await webhookResponse.json();
    console.log('📥 Resposta do webhook:', JSON.stringify(webhookResult, null, 2));

    // Verificar se o lead foi criado
    await new Promise(resolve => setTimeout(resolve, 1000));

    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('*')
      .eq('telefone_lead', '5511987654321')
      .order('created_at', { ascending: false })
      .limit(1);

    console.log('🔍 Lead criado:', leads);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Teste de webhook concluído',
        webhookResponse: {
          status: webhookResponse.status,
          result: webhookResult
        },
        leadCreated: leads && leads.length > 0 ? leads[0] : null,
        leadsError
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
