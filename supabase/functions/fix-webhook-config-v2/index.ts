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
    console.log('🔧 TESTANDO CONFIGURAÇÃO DO WEBHOOK (V2 Format)');

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

    // Limpar URL base
    let cleanEvolutionUrl = evolutionApiUrl
      .replace(/\/+$/, '')           
      .replace(/\/manager\/?$/g, '') 
      .replace(/\/\//g, '/');        
    
    cleanEvolutionUrl = cleanEvolutionUrl.replace(/:\/$/, '://');
    
    console.log('🔧 Evolution API URL limpa:', cleanEvolutionUrl);

    // Tentar formato v2 da API (instanceName no body, sem no path)
    console.log('🔄 Tentando configuração v2 (instanceName no body)...');
    
    const webhookConfigV2 = {
      instanceName: instance.instance_name,
      webhook: {
        url: messageWebhookUrl,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE'
        ],
        enabled: true,
        webhookByEvents: true,
        webhookBase64: false
      }
    };

    const webhookUrlV2 = `${cleanEvolutionUrl}/webhook/set`;
    console.log('🔗 URL v2:', webhookUrlV2);
    console.log('📦 Config v2:', JSON.stringify(webhookConfigV2, null, 2));

    const webhookResponseV2 = await fetch(webhookUrlV2, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify(webhookConfigV2),
    });

    console.log('📊 Status da resposta v2:', webhookResponseV2.status);

    if (!webhookResponseV2.ok) {
      const errorV2 = await webhookResponseV2.json().catch(async () => {
        const text = await webhookResponseV2.text();
        return { error: text, status: webhookResponseV2.status };
      });
      console.error('❌ Erro v2:', JSON.stringify(errorV2, null, 2));
      
      // Se v2 falhar, tentar v1
      console.log('🔄 Tentando configuração v1 (instanceName no path)...');
      
      const webhookConfigV1 = {
        webhook: {
          enabled: true,
          url: messageWebhookUrl,
          webhook_by_events: true,
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

      const webhookUrlV1 = `${cleanEvolutionUrl}/webhook/set/${instance.instance_name}`;
      console.log('🔗 URL v1:', webhookUrlV1);
      console.log('📦 Config v1:', JSON.stringify(webhookConfigV1, null, 2));

      const webhookResponseV1 = await fetch(webhookUrlV1, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify(webhookConfigV1),
      });

      console.log('📊 Status da resposta v1:', webhookResponseV1.status);

      if (!webhookResponseV1.ok) {
        const errorV1 = await webhookResponseV1.json().catch(async () => {
          const text = await webhookResponseV1.text();
          return { error: text, status: webhookResponseV1.status };
        });
        console.error('❌ Erro v1:', JSON.stringify(errorV1, null, 2));
        throw new Error(`Ambas as versões falharam. V2: ${JSON.stringify(errorV2)}, V1: ${JSON.stringify(errorV1)}`);
      }

      const webhookResultV1 = await webhookResponseV1.json();
      console.log('✅ Webhook configurado com v1:', JSON.stringify(webhookResultV1, null, 2));

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
          message: 'Webhook reconfigurado com sucesso usando v1!',
          instanceName: instance.instance_name,
          webhookUrl: messageWebhookUrl,
          version: 'v1',
          webhookConfig: webhookResultV1
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const webhookResultV2 = await webhookResponseV2.json();
    console.log('✅ Webhook configurado com v2:', JSON.stringify(webhookResultV2, null, 2));

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
        message: 'Webhook reconfigurado com sucesso usando v2!',
        instanceName: instance.instance_name,
        webhookUrl: messageWebhookUrl,
        version: 'v2',
        webhookConfig: webhookResultV2
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
