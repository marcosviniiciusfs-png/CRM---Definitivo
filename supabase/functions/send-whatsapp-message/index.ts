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
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Validar e corrigir URL da Evolution API
    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.');
      evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
    }

    if (!evolutionApiKey) {
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

    // Limpar URL base - garantir que está no formato correto
    let cleanBaseUrl = evolutionApiUrl.trim();
    
    // Remover barras finais
    cleanBaseUrl = cleanBaseUrl.replace(/\/+$/, '');
    
    // Remover /manager se existir
    cleanBaseUrl = cleanBaseUrl.replace(/\/manager\/?$/i, '');
    
    // Garantir que tem protocolo correto
    if (!cleanBaseUrl.startsWith('http://') && !cleanBaseUrl.startsWith('https://')) {
      cleanBaseUrl = 'https://' + cleanBaseUrl;
    }
    
    // Remover barras duplas EXCETO no protocolo (https:// ou http://)
    cleanBaseUrl = cleanBaseUrl.replace(/(https?:\/\/)|(\/\/)/g, (match) => {
      return match.includes('://') ? match : '/';
    });
    
    console.log('🔗 URL limpa da Evolution API:', cleanBaseUrl);
    
    // VERIFICAR STATUS REAL NA EVOLUTION API ANTES DE ENVIAR
    const connectionStateUrl = `${cleanBaseUrl}/instance/connectionState/${instance_name}`;
    console.log('🔍 Verificando status real na Evolution API:', connectionStateUrl);
    
    try {
      const stateResponse = await fetch(connectionStateUrl, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey,
        },
      });
      
      if (stateResponse.ok) {
        const stateData = await stateResponse.json();
        console.log('📊 Status da conexão:', stateData);
        
        // Verificar se está realmente conectado
        if (stateData.instance?.state !== 'open' && stateData.state !== 'open') {
          console.error('❌ Instância não está aberta:', stateData);
          
          // Atualizar status no banco
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'DISCONNECTED' })
            .eq('instance_name', instance_name);
          
          return new Response(
            JSON.stringify({
              success: false,
              error: 'WhatsApp desconectado. Por favor, reconecte o WhatsApp nas Configurações escaneando o QR Code novamente.',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }
      } else {
        console.warn('⚠️ Não foi possível verificar status da instância, continuando com envio...');
      }
    } catch (statusError) {
      console.warn('⚠️ Erro ao verificar status (continuando):', statusError);
      // Continua mesmo se não conseguir verificar o status
    }
    
    // Construir endpoint correto para envio de mensagem
    const sendMessageUrl = `${cleanBaseUrl}/message/sendText/${instance_name}`;
    
    console.log(`🔄 Chamando Evolution API: ${sendMessageUrl}`);
    
    // Criar AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos de timeout
    
    let evolutionResponse;
    try {
      evolutionResponse = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          number: cleanNumber,
          text: message_text,
        }),
        signal: controller.signal,
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      console.error('❌ Erro ao fazer fetch para Evolution API:', fetchError);
      
      // Tratamento especial para timeout
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout: A Evolution API não respondeu a tempo. Verifique se o serviço está funcionando.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }
      
      // Outros erros de conexão
      return new Response(
        JSON.stringify({
          success: false,
          error: `Erro de conexão com Evolution API: ${fetchError.message}`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Verificar resposta da Evolution API
    if (!evolutionResponse.ok) {
      let errorText = '';
      try {
        errorText = await evolutionResponse.text();
      } catch (readError) {
        console.error('❌ Erro ao ler resposta de erro:', readError);
        errorText = 'Não foi possível ler a resposta de erro';
      }
      
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
        } else if (errorJson.message) {
          friendlyError = errorJson.message;
        }
        
        // Verificar se é "Connection Closed"
        if (friendlyError.includes('Connection Closed')) {
          friendlyError = 'WhatsApp desconectado. Por favor, reconecte o WhatsApp nas Configurações escaneando o QR Code novamente.';
          
          // Atualizar status no banco para DISCONNECTED
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'DISCONNECTED' })
            .eq('instance_name', instance_name);
          
          console.log('🔄 Status da instância atualizado para DISCONNECTED devido a Connection Closed');
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

    let evolutionData;
    try {
      evolutionData = await evolutionResponse.json();
      console.log('✅ Resposta da Evolution API:', evolutionData);
    } catch (jsonError) {
      console.error('❌ Erro ao fazer parse da resposta JSON:', jsonError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Erro ao processar resposta da Evolution API. A API pode estar offline ou retornando dados inválidos.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // Extrair messageId da resposta
    const messageId = evolutionData.key?.id || evolutionData.messageId || null;
    console.log('📝 Message ID:', messageId);

    // Se leadId foi fornecido, salvar no banco de dados
    if (leadId) {
      try {
        // Remover asteriscos da assinatura para salvar no CRM
        const messageForCRM = message_text.replace(/^\*([^*]+):\*\n/, '$1:\n');
        
        const { error: dbError } = await supabase
          .from('mensagens_chat')
          .insert({
            id_lead: leadId,
            direcao: 'SAIDA',
            corpo_mensagem: messageForCRM,
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
