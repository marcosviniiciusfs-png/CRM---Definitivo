import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  isConnectedState,
  createSupabaseAdmin,
  formatPhoneToJid,
} from "../_shared/evolution-config.ts";

interface SendMessageRequest {
  instance_name: string;
  remoteJid: string;
  message_text: string;
  leadId?: string;
  quotedMessageId?: string; // ID da mensagem Evolution para quote
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instance_name, remoteJid, message_text, leadId, quotedMessageId }: SendMessageRequest = await req.json();

    console.log('📤 Enviando mensagem:', { instance_name, remoteJid, message_text, leadId, quotedMessageId });

    // Validar parâmetros obrigatórios
    if (!instance_name || !remoteJid || !message_text || !leadId) {
      console.error('❌ Parâmetros obrigatórios faltando');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Parâmetros obrigatórios: instance_name, remoteJid, message_text, leadId',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    // Cliente escopado ao usuário para o RPC de permissao — auth.uid() precisa
    // resolver para o JWT do caller, e nao para service_role.
    const userScopedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Spec channel-access-control: usuario so envia para leads aos quais
    // tem acesso (RLS valida leitura, mas envio precisa de check explicito).
    // leadId e obrigatorio (validado acima), entao este check roda sempre.
    {
      const { data: accessOk, error: accessErr } = await userScopedClient
        .rpc("user_can_access_lead", { p_lead_id: leadId });
      if (accessErr) {
        console.error("user_can_access_lead RPC error:", accessErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao verificar permissao" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!accessOk) {
        return new Response(
          JSON.stringify({ success: false, error: "Sem acesso a este lead/canal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Obter credenciais da Evolution API
    let evolutionApiUrl: string;
    let evolutionApiKey: string;
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch (configError: any) {
      return new Response(
        JSON.stringify({ success: false, error: configError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    // Formatar número do WhatsApp corretamente
    let jid: string;
    try {
      jid = formatPhoneToJid(remoteJid);
    } catch (formatError: any) {
      return new Response(
        JSON.stringify({
          success: false,
          error: formatError.message,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        },
      );
    }

    console.log('✅ Número formatado:', jid);

    // Criar cliente Supabase admin
    const supabase = createSupabaseAdmin();

    // Resolve o canal de envio: respeita o instance_name passado pelo
    // frontend (canal da membership selecionada na UI) e valida que existe
    // membership do par (lead, canal). Sem fallback automatico para
    // lead.whatsapp_instance_id — apos transferencia, um lead pode estar
    // em multiplos canais e a UI sabe qual escolher.
    let resolvedInstanceName = instance_name;

    if (leadId) {
      // Busca instancia passada pelo frontend para conferir membership.
      const { data: requestedInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, organization_id, instance_name')
        .eq('instance_name', instance_name)
        .maybeSingle();

      if (requestedInstance?.id) {
        const { data: membership } = await supabase
          .from('lead_channel_memberships')
          .select('lead_id')
          .eq('lead_id', leadId)
          .eq('whatsapp_instance_id', requestedInstance.id)
          .maybeSingle();

        if (membership) {
          // Match — usa o canal pedido (caso normal apos lead estar em
          // multiplos canais via transferencia).
          resolvedInstanceName = requestedInstance.instance_name;
          console.log('🔄 Canal validado via membership:', resolvedInstanceName);
        } else {
          // Sem membership para esse par. Fallback: usa o canal de origem
          // do lead (lead.whatsapp_instance_id) — compat com leads antigos
          // que ainda nao tiveram a primeira mensagem pos-deploy do webhook.
          const { data: leadData } = await supabase
            .from('leads')
            .select('whatsapp_instance_id')
            .eq('id', leadId)
            .maybeSingle();

          if (leadData?.whatsapp_instance_id) {
            const { data: leadInstance } = await supabase
              .from('whatsapp_instances')
              .select('instance_name')
              .eq('id', leadData.whatsapp_instance_id)
              .maybeSingle();
            if (leadInstance?.instance_name) {
              resolvedInstanceName = leadInstance.instance_name;
              console.log('🔄 Fallback para canal de origem do lead:', resolvedInstanceName);
            }
          }
        }
      }
    }

    const { data: instanceCheck, error: instanceCheckError } = await supabase
      .from('whatsapp_instances')
      .select('id, status, instance_name')
      .eq('instance_name', resolvedInstanceName)
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
      console.error('❌ Instância não encontrada no banco:', resolvedInstanceName);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Instância WhatsApp não encontrada. Por favor, reconecte o WhatsApp nas Configurações.',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        },
      );
    }

    if (instanceCheck.status !== 'CONNECTED') {
      console.error('❌ Instância não está conectada:', {
        instance_name: resolvedInstanceName,
        status: instanceCheck.status
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: `Instância WhatsApp está ${instanceCheck.status}. Por favor, reconecte o WhatsApp nas Configurações.`,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        },
      );
    }

    // Use the resolved instance name for all subsequent operations
    const finalInstanceName = resolvedInstanceName;

    console.log('✅ Instância validada:', {
      instance_name: finalInstanceName,
      status: instanceCheck.status,
      id: instanceCheck.id
    });

    // Normalizar URL da Evolution API
    const cleanBaseUrl = normalizeUrl(evolutionApiUrl);
    console.log('🔗 URL normalizada da Evolution API:', cleanBaseUrl);
    
    // VERIFICAR STATUS REAL NA EVOLUTION API ANTES DE ENVIAR
    const connectionStateUrl = `${cleanBaseUrl}/instance/connectionState/${finalInstanceName}`;
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
        if (!isConnectedState(stateData.instance?.state || stateData.state)) {
          console.error('❌ Instância não está aberta:', stateData);

          // Atualizar status no banco
          await supabase
            .from('whatsapp_instances')
            .update({ status: 'DISCONNECTED' })
            .eq('instance_name', finalInstanceName);

          return new Response(
            JSON.stringify({
              success: false,
              error: 'WhatsApp desconectado. Por favor, reconecte o WhatsApp nas Configurações escaneando o QR Code novamente.',
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 503,
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
    const sendMessageUrl = `${cleanBaseUrl}/message/sendText/${finalInstanceName}`;
    
    console.log(`🔄 Chamando Evolution API: ${sendMessageUrl}`);
    console.log(`📝 Texto da mensagem sendo enviado para Evolution API:`, message_text);
    console.log(`📝 Primeira linha da mensagem:`, message_text.split('\n')[0]);
    
    // Criar AbortController para timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 segundos de timeout
    
    let evolutionResponse;
    const requestBody: any = {
      number: jid,
      text: message_text,
    };
    
    // Add quoted message if provided
    if (quotedMessageId) {
      requestBody.quoted = {
        key: {
          id: quotedMessageId,
        },
      };
      console.log('📝 Mensagem com quote:', quotedMessageId);
    }
    
    try {
      evolutionResponse = await fetch(sendMessageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify(requestBody),
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
            status: 504,
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
          status: 502,
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
        finalInstanceName,
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
            .eq('instance_name', finalInstanceName);
          
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
          .eq('instance_name', finalInstanceName);

        console.log('🔄 Status da instância atualizado para DISCONNECTED');
      }

      // 200 + success:false: deixa o toast do frontend mostrar o erro real
      // (supabase-js esconde body de respostas non-2xx). 404 fica preservado
      // pois e usado pra detectar "instancia desconectada" no frontend.
      return new Response(
        JSON.stringify({
          success: false,
          error: friendlyError,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: evolutionResponse.status === 404 ? 404 : 200,
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
          status: 502,
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
        
        // Buscar ID da mensagem citada se houver quotedMessageId
        let quotedDbMessageId = null;
        if (quotedMessageId) {
          const { data: quotedMsg } = await supabase
            .from('mensagens_chat')
            .select('id')
            .eq('evolution_message_id', quotedMessageId)
            .maybeSingle();
          quotedDbMessageId = quotedMsg?.id || null;
        }
        
        const { error: dbError } = await supabase
          .from('mensagens_chat')
          .insert({
            id_lead: leadId,
            direcao: 'SAIDA',
            corpo_mensagem: messageForCRM,
            evolution_message_id: messageId,
            status_entrega: 'SENT',
            quoted_message_id: quotedDbMessageId,
            whatsapp_instance_id: instanceCheck.id,
          });

        if (dbError) {
          console.error('⚠️ Erro ao salvar no banco (mensagem foi enviada):', dbError);
        } else {
          console.log('💾 Mensagem salva no banco com sucesso');

          // Atualiza last_message_at na membership do canal de envio para
          // que a sidebar reordene corretamente. Assume membership ja existe
          // (lead estava visivel no Chat, logo foi criada pelo webhook ou
          // por transfer-lead-to-channel).
          const { error: updateLcmError } = await supabase
            .from('lead_channel_memberships')
            .update({ last_message_at: new Date().toISOString() })
            .eq('lead_id', leadId)
            .eq('whatsapp_instance_id', instanceCheck.id);

          if (updateLcmError) {
            console.warn('⚠️ Falha ao atualizar last_message_at em lead_channel_memberships:', updateLcmError);
          }
        }
      } catch (dbException) {
        console.error('⚠️ Exceção ao salvar no banco (mensagem foi enviada):', dbException);
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

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Erro desconhecido ao processar requisição',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    );
  }
});
