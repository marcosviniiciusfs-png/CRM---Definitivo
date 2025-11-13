import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface SendMessageRequest {
  instance_name: string;
  remoteJid: string;
  message_text: string;
  leadId?: string; // Opcional, para salvar no banco
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, remoteJid, message_text, leadId }: SendMessageRequest = await req.json();

    console.log('📤 Enviando mensagem:', { instance_name, remoteJid, message_text, leadId });

    // Validar parâmetros obrigatórios
    if (!instance_name || !remoteJid || !message_text) {
      console.error('❌ Parâmetros obrigatórios faltando');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Parâmetros obrigatórios: instance_name, remoteJid, message_text',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // CRÍTICO: Sempre retorna 200
        },
      );
    }

    // Limpar o número do WhatsApp - apenas dígitos
    const cleanNumber = remoteJid.replace(/\D/g, '');
    
    if (!cleanNumber) {
      console.error('❌ Número inválido após limpeza');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Número de WhatsApp inválido',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200, // CRÍTICO: Sempre retorna 200
        },
      );
    }

    console.log('✅ Número limpo:', cleanNumber);

    // Obter credenciais da Evolution API
    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('❌ Credenciais da Evolution API não configuradas');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Credenciais da Evolution API não configuradas',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // VALIDAÇÃO: Verificar se a instância existe e está conectada no banco
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: instanceCheck, error: instanceCheckError } = await supabase
      .from('whatsapp_instances')
      .select('id, status, instance_name')
      .eq('instance_name', instance_name)
      .maybeSingle();

    if (instanceCheckError) {
      console.error('❌ Erro ao verificar instância no banco:', instanceCheckError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Erro ao verificar instância WhatsApp',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    if (!instanceCheck) {
      console.error('❌ Instância não encontrada no banco:', instance_name);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instância WhatsApp não encontrada. Por favor, reconecte o WhatsApp nas Configurações.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    if (instanceCheck.status !== 'CONNECTED') {
      console.error('❌ Instância não está conectada:', {
        instance_name,
        status: instanceCheck.status
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `Instância WhatsApp está ${instanceCheck.status}. Por favor, reconecte o WhatsApp nas Configurações.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    console.log('✅ Instância validada:', {
      instance_name,
      status: instanceCheck.status,
      id: instanceCheck.id
    });

    // Limpar URL base de forma mais agressiva
    let cleanBaseUrl = evolutionApiUrl
      .replace(/\/+$/, '')           // Remove barras finais
      .replace(/\/manager\/?/g, '')  // Remove /manager/ ou /manager
      .replace(/\/\//g, '/');        // Remove barras duplas
    
    // Se a URL terminar com protocolo:/, adiciona a segunda barra
    cleanBaseUrl = cleanBaseUrl.replace(/:\/$/, '://');
    
    // Construir endpoint correto para envio de mensagem
    const sendMessageUrl = `${cleanBaseUrl}/message/sendText/${instance_name}`;
    
    console.log(`🔄 Chamando Evolution API: ${sendMessageUrl}`);
    
    const evolutionResponse = await fetch(sendMessageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: cleanNumber,
        text: message_text,
      }),
    });

    // Verificar resposta da Evolution API
    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('❌ Erro da Evolution API:', {
        status: evolutionResponse.status,
        statusText: evolutionResponse.statusText,
        error: errorText,
        instance_name,
        url: sendMessageUrl
      });
      
      // Tentar parsear erro JSON para mensagem mais amigável
      let friendlyError = `Evolution API retornou erro ${evolutionResponse.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.response?.message) {
          const messages = errorJson.response.message;
          if (Array.isArray(messages)) {
            friendlyError = messages.join(', ');
          } else {
            friendlyError = messages;
          }
        }
      } catch {
        friendlyError = errorText || friendlyError;
      }
      
      // Se for 404, significa que a instância não existe na Evolution API
      if (evolutionResponse.status === 404) {
        friendlyError = 'A instância WhatsApp não existe ou foi desconectada. Por favor, reconecte o WhatsApp nas Configurações.';
        
        // Atualizar status da instância no banco para DISCONNECTED
        await supabase
          .from('whatsapp_instances')
          .update({ status: 'DISCONNECTED' })
          .eq('instance_name', instance_name);
        
        console.log('🔄 Status da instância atualizado para DISCONNECTED');
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: friendlyError,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    const evolutionData = await evolutionResponse.json();
    console.log('✅ Resposta da Evolution API:', evolutionData);

    // Extrair messageId da resposta
    const messageId = evolutionData.key?.id || evolutionData.messageId || null;
    console.log('📝 Message ID:', messageId);

    // Se leadId foi fornecido, salvar no banco de dados
    if (leadId) {
      try {
        const { error: dbError } = await supabase
          .from('mensagens_chat')
          .insert({
            id_lead: leadId,
            direcao: 'SAIDA',
            corpo_mensagem: message_text,
            evolution_message_id: messageId,
            status_entrega: 'SENT',
          });

        if (dbError) {
          console.error('⚠️ Erro ao salvar no banco (mensagem foi enviada):', dbError);
          // Nota: Não retornamos erro aqui porque a mensagem FOI enviada com sucesso
        } else {
          console.log('💾 Mensagem salva no banco com sucesso');
        }
      } catch (dbException) {
        console.error('⚠️ Exceção ao salvar no banco (mensagem foi enviada):', dbException);
        // Nota: Não retornamos erro aqui porque a mensagem FOI enviada com sucesso
      }
    }

    // Sucesso!
    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
        evolutionData: evolutionData,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );

  } catch (error: any) {
    console.error('💥 Erro crítico na função:', error);
    
    // CRÍTICO: Mesmo com erro crítico, retornamos 200
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro desconhecido ao processar requisição',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200, // CRÍTICO: Sempre retorna 200
      },
    );
  }
});
