import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log('📥 MESSAGE WEBHOOK - Payload completo:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    const instance = payload.instance;
    const data = payload.data;

    // Log para debug
    console.log('Event:', event);
    console.log('Instance:', instance);
    console.log('Has data:', !!data);

    if (!event || !instance) {
      console.log('⚠️ Payload inválido - event ou instance faltando');
      return new Response(
        JSON.stringify({ success: true, message: 'Payload inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Processar apenas eventos de mensagens recebidas
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      console.log(`⏭️ Evento ${event} - encaminhando para outro webhook se necessário`);
      return new Response(
        JSON.stringify({ success: true, message: `Evento ${event} ignorado neste webhook` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!data) {
      console.log('⚠️ Data não encontrado no payload');
      return new Response(
        JSON.stringify({ success: true, message: 'Data faltando' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('✅ Processando mensagem recebida...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar a instância do WhatsApp no banco para obter o user_id
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('user_id, phone_number')
      .eq('instance_name', instance)
      .single();

    if (instanceError || !instanceData) {
      console.error('❌ Instância não encontrada:', instanceError);
      return new Response(
        JSON.stringify({ success: false, error: 'Instância não encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('✅ Instância encontrada:', JSON.stringify(instanceData));

    // Buscar a organization_id do usuário usando service role
    const { data: orgData, error: orgError } = await supabase
      .rpc('get_user_organization_id', { _user_id: instanceData.user_id });

    if (orgError) {
      console.error('❌ Erro ao buscar organização:', orgError);
      throw orgError;
    }

    if (!orgData) {
      console.error('❌ Organization não encontrada para user:', instanceData.user_id);
      throw new Error('Organization não encontrada');
    }

    const organizationId = orgData;
    console.log('✅ Organization ID:', organizationId);

    // Extrair informações da mensagem com logs detalhados
    console.log('📦 Data structure:', JSON.stringify(data, null, 2));
    
    const message = data.message || data;
    const messageKey = message.key || {};
    const messageInfo = message.message || {};
    
    console.log('🔑 Message Key:', JSON.stringify(messageKey));
    console.log('💬 Message Info:', JSON.stringify(messageInfo));
    
    // Determinar direção da mensagem
    const isFromMe = messageKey.fromMe || false;
    const remoteJid = messageKey.remoteJid || '';
    
    // Extrair número do contato (remover @s.whatsapp.net)
    const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    
    // Se for mensagem enviada por nós, ignorar (já foi salva ao enviar)
    if (isFromMe) {
      console.log('⏭️ Mensagem enviada por nós - ignorando');
      return new Response(
        JSON.stringify({ success: true, message: 'Mensagem própria ignorada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Extrair conteúdo da mensagem
    let messageContent = '';
    if (messageInfo.conversation) {
      messageContent = messageInfo.conversation;
    } else if (messageInfo.extendedTextMessage?.text) {
      messageContent = messageInfo.extendedTextMessage.text;
    } else if (messageInfo.imageMessage?.caption) {
      messageContent = `[Imagem] ${messageInfo.imageMessage.caption || ''}`;
    } else if (messageInfo.videoMessage?.caption) {
      messageContent = `[Vídeo] ${messageInfo.videoMessage.caption || ''}`;
    } else if (messageInfo.audioMessage) {
      messageContent = '[Áudio]';
    } else if (messageInfo.documentMessage) {
      messageContent = `[Documento] ${messageInfo.documentMessage.fileName || ''}`;
    } else {
      messageContent = '[Mensagem não suportada]';
    }

    console.log('📱 Número:', phoneNumber);
    console.log('💬 Conteúdo:', messageContent);

    // ========================================
    // CRIAR OU BUSCAR LEAD
    // ========================================
    
    // Verificar se o lead já existe
    let { data: existingLead, error: leadSearchError } = await supabase
      .from('leads')
      .select('id, nome_lead')
      .eq('telefone_lead', phoneNumber)
      .eq('organization_id', organizationId)
      .single();

    if (leadSearchError && leadSearchError.code !== 'PGRST116') {
      console.error('❌ Erro ao buscar lead:', leadSearchError);
      throw leadSearchError;
    }

    let leadId: string;
    let leadName: string;

    if (existingLead) {
      console.log('✅ Lead existente encontrado:', existingLead.id);
      leadId = existingLead.id;
      leadName = existingLead.nome_lead;
    } else {
      console.log('🆕 Criando novo lead...');
      
      // Extrair nome do contato (pushName) se disponível
      const pushName = message.pushName || phoneNumber;
      
      const { data: newLead, error: createLeadError } = await supabase
        .from('leads')
        .insert({
          telefone_lead: phoneNumber,
          nome_lead: pushName,
          organization_id: organizationId,
          source: 'WhatsApp',
          stage: 'novo',
          last_message_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createLeadError) {
        console.error('❌ Erro ao criar lead:', createLeadError);
        throw createLeadError;
      }

      console.log('✅ Lead criado:', newLead.id);
      leadId = newLead.id;
      leadName = newLead.nome_lead;
    }

    // ========================================
    // SALVAR MENSAGEM
    // ========================================
    
    const messageId = messageKey.id || `${Date.now()}-${Math.random()}`;
    
    const { data: savedMessage, error: saveMessageError } = await supabase
      .from('mensagens_chat')
      .insert({
        id_lead: leadId,
        corpo_mensagem: messageContent,
        direcao: 'RECEBIDA',
        data_hora: new Date().toISOString(),
        evolution_message_id: messageId,
        status_entrega: 'DELIVERED'
      })
      .select()
      .single();

    if (saveMessageError) {
      console.error('❌ Erro ao salvar mensagem:', saveMessageError);
      throw saveMessageError;
    }

    console.log('✅ Mensagem salva:', savedMessage.id);

    // Atualizar last_message_at do lead
    await supabase
      .from('leads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', leadId);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mensagem processada com sucesso',
        leadId,
        leadName,
        messageId: savedMessage.id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('❌ ERRO no whatsapp-message-webhook:', error);
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
