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
    console.log('🔧 CORRIGINDO CONFIGURAÇÃO DO WEBHOOK');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify JWT and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Invalid authorization token');
    }

    // Buscar instância conectada do usuário
    const { data: instance, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'CONNECTED')
      .single();

    if (instanceError || !instance) {
      throw new Error('Nenhuma instância conectada encontrada');
    }

    console.log('✅ Instância encontrada:', instance.instance_name);

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')!;
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;
    const messageWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;

    // Reconfigurar webhook com eventos habilitados
    console.log('🔄 Reconfigurando webhook...');
    
    const webhookConfig = {
      webhook: {
        enabled: true,
        url: messageWebhookUrl,
        webhook_by_events: true, // CRITICAL: Habilitar webhook por eventos
        webhook_base64: false,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ]
      }
    };

    const webhookResponse = await fetch(
      `${evolutionApiUrl}/webhook/set/${instance.instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify(webhookConfig),
      }
    );

    if (!webhookResponse.ok) {
      const error = await webhookResponse.text();
      throw new Error(`Erro ao configurar webhook: ${error}`);
    }

    const webhookResult = await webhookResponse.json();
    console.log('✅ Webhook reconfigurado:', JSON.stringify(webhookResult, null, 2));

    // Atualizar banco de dados
    await supabase
      .from('whatsapp_instances')
      .update({ 
        webhook_url: messageWebhookUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', instance.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Webhook reconfigurado com sucesso! Agora você receberá as mensagens.',
        instanceName: instance.instance_name,
        webhookUrl: messageWebhookUrl,
        webhookConfig: webhookResult
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
