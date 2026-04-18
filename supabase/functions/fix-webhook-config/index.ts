import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin } from "../_shared/evolution-config.ts";

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

    const supabase = createSupabaseAdmin();

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

    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const messageWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;

    console.log('🔧 Evolution API URL:', evolutionApiUrl);

    // Reconfigurar webhook com eventos habilitados
    console.log('🔄 Reconfigurando webhook...');
    
    // Get webhook secret for authentication
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.warn('⚠️ EVOLUTION_WEBHOOK_SECRET not configured - webhooks will not be authenticated!');
    }
    
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
        ],
        // 🔒 SEGURANÇA: Adicionar header de autenticação
        ...(webhookSecret ? {
          headers: {
            'x-api-key': webhookSecret
          }
        } : {})
      }
    };

    const webhookUrl = `${evolutionApiUrl}/webhook/set/${instance.instance_name}`;
    console.log('🔗 URL completa do webhook:', webhookUrl);
    console.log('📦 Config do webhook:', JSON.stringify(webhookConfig, null, 2));

    const webhookResponse = await fetch(
      webhookUrl,
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
      const error = await webhookResponse.json().catch(async () => {
        const text = await webhookResponse.text();
        return { error: text, status: webhookResponse.status };
      });
      console.error('❌ Resposta de erro da Evolution API:', JSON.stringify(error, null, 2));
      throw new Error(`Erro ao configurar webhook: ${JSON.stringify(error)}`);
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
