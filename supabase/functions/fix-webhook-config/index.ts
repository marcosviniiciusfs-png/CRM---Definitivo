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

    // Buscar TODAS as instancias conectadas do usuario.
    // Antes: .single() falhava com multi-canal (>= 2 instancias CONNECTED).
    const { data: instances, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'CONNECTED');

    if (instanceError || !instances || instances.length === 0) {
      throw new Error('Nenhuma instância conectada encontrada');
    }

    console.log(`✅ ${instances.length} instancia(s) encontrada(s)`);

    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const messageWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;

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

    const results: any[] = [];

    for (const instance of instances) {
      console.log(`🔄 Reconfigurando webhook para ${instance.instance_name}...`);
      const webhookUrl = `${evolutionApiUrl}/webhook/set/${instance.instance_name}`;

      try {
        const webhookResponse = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify(webhookConfig),
        });

        if (!webhookResponse.ok) {
          const errBody = await webhookResponse.text().catch(() => 'unknown');
          console.error(`❌ Erro ao configurar webhook de ${instance.instance_name}:`, errBody);
          results.push({ instance: instance.instance_name, success: false, error: errBody });
          continue;
        }

        const webhookResult = await webhookResponse.json();
        console.log(`✅ Webhook reconfigurado: ${instance.instance_name}`);

        await supabase
          .from('whatsapp_instances')
          .update({
            webhook_url: messageWebhookUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', instance.id);

        results.push({ instance: instance.instance_name, success: true, webhookConfig: webhookResult });
      } catch (err: any) {
        console.error(`❌ Excecao ao configurar ${instance.instance_name}:`, err);
        results.push({ instance: instance.instance_name, success: false, error: err.message });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        message: `${successCount}/${instances.length} webhook(s) reconfigurados com sucesso`,
        results,
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
