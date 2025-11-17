import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Função auxiliar para baixar mídia usando Evolution API e fazer upload para Supabase Storage
async function downloadAndUploadMedia(
  messageId: string,
  mediaType: string,
  mimetype: string,
  leadId: string,
  serverUrl: string,
  apiKey: string,
  instance: string
): Promise<string> {
  console.log(`📥 Baixando ${mediaType} da Evolution API para mensagem:`, messageId);
  
  try {
    // Usar Evolution API para obter mídia em base64
    const evolutionUrl = `${serverUrl}/chat/getBase64FromMediaMessage/${instance}`;
    console.log(`🔗 Chamando Evolution API:`, evolutionUrl);
    
    const response = await fetch(evolutionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': apiKey
      },
      body: JSON.stringify({
        message: {
          key: {
            id: messageId
          }
        },
        convertToMp4: false
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Erro na Evolution API (${response.status}):`, errorText);
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log(`✅ Resposta da Evolution API recebida`);
    
    // A Evolution API retorna { base64: "..." }
    if (!data.base64) {
      throw new Error('Base64 não encontrado na resposta da Evolution API');
    }
    
    // Converter base64 para buffer (Deno-compatible)
    // Remover prefixo data:mime/type;base64, se existir
    const base64Data = data.base64.replace(/^data:[^;]+;base64,/, '');
    
    // Usar Uint8Array.from com decode no Deno
    const binaryData = Uint8Array.from(
      atob(base64Data)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    
    // Determinar extensão do arquivo
    let extension = 'bin';
    if (mimetype.includes('ogg')) extension = 'ogg';
    else if (mimetype.includes('opus')) extension = 'opus';
    else if (mimetype.includes('mp3')) extension = 'mp3';
    else if (mimetype.includes('mpeg')) extension = 'mp3';
    else if (mimetype.includes('jpeg') || mimetype.includes('jpg')) extension = 'jpg';
    else if (mimetype.includes('png')) extension = 'png';
    else if (mimetype.includes('mp4')) extension = 'mp4';
    else if (mimetype.includes('pdf')) extension = 'pdf';
    else if (mimetype.includes('webp')) extension = 'webp';
    else {
      const parts = mimetype.split('/');
      if (parts.length > 1) extension = parts[1].split(';')[0];
    }
    
    const fileName = `${leadId}/${Date.now()}.${extension}`;
    
    console.log(`📤 Fazendo upload para Storage: ${fileName}`);
    
    // Criar cliente Supabase admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Fazer upload para o bucket 'chat-media'
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('chat-media')
      .upload(fileName, binaryData, {
        contentType: mimetype,
        upsert: false
      });
    
    if (uploadError) {
      console.error('❌ Erro ao fazer upload:', uploadError);
      throw uploadError;
    }
    
    // Obter URL pública
    const { data: urlData } = supabaseAdmin.storage
      .from('chat-media')
      .getPublicUrl(fileName);
    
    console.log(`✅ Upload concluído:`, urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error(`❌ Erro ao processar ${mediaType}:`, error);
    throw error; // Propagar erro para não salvar URL inválida
  }
}

serve(async (req) => {
  console.log('🚨 WEBHOOK CHAMADO - TIMESTAMP:', new Date().toISOString());
  console.log('🚨 MÉTODO:', req.method);
  console.log('🚨 URL:', req.url);
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ CORS OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Tentando ler payload...');
    const payload = await req.json();
    console.log('✅ PAYLOAD RECEBIDO:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    const instance = payload.instance;
    const data = payload.data;
    const serverUrl = payload.server_url;
    const apiKey = payload.apikey;

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
      .maybeSingle();

    let organizationId: string;

    if (instanceError) {
      console.error('❌ Erro ao buscar instância:', instanceError);
      throw instanceError;
    }

    if (!instanceData) {
      console.warn('⚠️ Instância não registrada:', instance);
      
      // SOLUÇÃO: Buscar TODAS as instâncias e usar a primeira organização encontrada
      // Isso permite processar mensagens mesmo de instâncias não registradas
      const { data: anyInstance, error: anyInstanceError } = await supabase
        .from('whatsapp_instances')
        .select('user_id')
        .limit(1)
        .maybeSingle();

      if (anyInstanceError || !anyInstance) {
        console.error('❌ Nenhuma instância encontrada no sistema');
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Nenhuma instância WhatsApp configurada no sistema. Configure uma instância primeiro.',
            instance_received: instance
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      // Usar a organização da primeira instância encontrada
      const { data: orgData, error: orgError } = await supabase
        .rpc('get_user_organization_id', { _user_id: anyInstance.user_id });

      if (orgError || !orgData) {
        console.error('❌ Erro ao buscar organização fallback:', orgError);
        throw new Error('Organização não encontrada');
      }

      organizationId = orgData;
      console.log('⚠️ Usando organização fallback:', organizationId);
      
      // Auto-registrar a instância desconhecida
      await supabase
        .from('whatsapp_instances')
        .insert({
          instance_name: instance,
          user_id: anyInstance.user_id,
          status: 'CONNECTED',
          connected_at: new Date().toISOString()
        })
        .select()
        .single();
      
      console.log('✅ Instância auto-registrada:', instance);
    } else {
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

      organizationId = orgData;
      console.log('✅ Organization ID:', organizationId);
    }

    // Extrair informações da mensagem com logs detalhados
    console.log('📦 Data structure:', JSON.stringify(data, null, 2));
    
    // CRITICAL: Estrutura correta do payload da Evolution API
    // data = { key: {...}, message: {...}, pushName: "...", messageTimestamp: ... }
    const messageKey = data.key || {};
    const messageInfo = data.message || {};
    const pushName = data.pushName || '';
    
    console.log('🔑 Message Key:', JSON.stringify(messageKey));
    console.log('💬 Message Info:', JSON.stringify(messageInfo));
    
    // Determinar direção da mensagem
    const isFromMe = messageKey.fromMe || false;
    
    // CRÍTICO: Priorizar senderPn (número real) sobre remoteJid (@lid)
    // senderPn contém o número real do remetente quando remoteJid usa @lid
    const senderPhone = messageKey.senderPn || messageKey.remoteJid || '';
    const remoteJid = messageKey.remoteJid || '';
    
    console.log('📱 Sender Phone (senderPn):', messageKey.senderPn);
    console.log('📱 Remote JID:', remoteJid);
    
    // FILTRO CRÍTICO: Ignorar mensagens de grupos
    if (remoteJid.endsWith('@g.us')) {
      console.log('⏭️ Mensagem de grupo ignorada - não criar lead');
      console.log('📱 Group JID:', remoteJid);
      return new Response(
        JSON.stringify({ success: true, message: 'Mensagem de grupo ignorada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    // Extrair número do contato usando senderPhone (que prioriza senderPn)
    // Remove TODOS os sufixos: @s.whatsapp.net, @lid, @g.us
    const phoneNumber = senderPhone.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '').trim();
    
    // Se for mensagem enviada por nós, ignorar (já foi salva ao enviar)
    if (isFromMe) {
      console.log('⏭️ Mensagem enviada por nós - ignorando');
      return new Response(
        JSON.stringify({ success: true, message: 'Mensagem própria ignorada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Extrair conteúdo da mensagem e dados de mídia (URLs originais)
    let messageContent = '';
    let originalMediaUrl: string | null = null;
    let mediaType: string | null = null;
    let mediaMetadata: any = null;

    if (messageInfo.conversation) {
      messageContent = messageInfo.conversation;
    } else if (messageInfo.extendedTextMessage?.text) {
      messageContent = messageInfo.extendedTextMessage.text;
    } else if (messageInfo.imageMessage) {
      messageContent = `[Imagem] ${messageInfo.imageMessage.caption || ''}`;
      originalMediaUrl = messageInfo.imageMessage.url;
      mediaType = 'image';
      mediaMetadata = {
        mimetype: messageInfo.imageMessage.mimetype,
        fileLength: messageInfo.imageMessage.fileLength
      };
    } else if (messageInfo.videoMessage) {
      messageContent = `[Vídeo] ${messageInfo.videoMessage.caption || ''}`;
      originalMediaUrl = messageInfo.videoMessage.url;
      mediaType = 'video';
      mediaMetadata = {
        mimetype: messageInfo.videoMessage.mimetype,
        fileLength: messageInfo.videoMessage.fileLength,
        seconds: messageInfo.videoMessage.seconds
      };
    } else if (messageInfo.audioMessage) {
      messageContent = '[Áudio]';
      originalMediaUrl = messageInfo.audioMessage.url;
      mediaType = 'audio';
      mediaMetadata = {
        mimetype: messageInfo.audioMessage.mimetype,
        fileLength: messageInfo.audioMessage.fileLength,
        seconds: messageInfo.audioMessage.seconds,
        ptt: messageInfo.audioMessage.ptt
      };
    } else if (messageInfo.documentMessage) {
      messageContent = `[Documento] ${messageInfo.documentMessage.fileName || ''}`;
      originalMediaUrl = messageInfo.documentMessage.url;
      mediaType = 'document';
      mediaMetadata = {
        mimetype: messageInfo.documentMessage.mimetype,
        fileName: messageInfo.documentMessage.fileName,
        fileLength: messageInfo.documentMessage.fileLength
      };
    } else {
      messageContent = '[Mensagem não suportada]';
    }

    console.log('📱 Número:', phoneNumber);
    console.log('💬 Conteúdo:', messageContent);

    // ========================================
    // CRIAR OU BUSCAR LEAD
    // ========================================
    
    // Verificar se o lead já existe
    const { data: existingLead, error: leadSearchError } = await supabase
      .from('leads')
      .select('id, nome_lead')
      .eq('telefone_lead', phoneNumber)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (leadSearchError) {
      console.error('❌ Erro ao buscar lead:', leadSearchError);
      throw leadSearchError;
    }

    let leadId: string;
    let leadName: string;

    if (existingLead) {
      console.log('✅ Lead existente encontrado:', existingLead.id);
      leadId = existingLead.id;
      leadName = existingLead.nome_lead;
      
      // SINCRONIZAÇÃO AUTOMÁTICA: Atualizar nome se pushName estiver disponível e for diferente
      if (pushName && pushName !== existingLead.nome_lead) {
        console.log('🔄 Atualizando nome do lead:', pushName);
        await supabase
          .from('leads')
          .update({ 
            nome_lead: pushName,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingLead.id);
        
        leadName = pushName;
      }
    } else {
      console.log('🆕 Criando novo lead...');
      
      // Usar pushName ou número como nome do lead
      const newLeadName = pushName || phoneNumber;
      
      const { data: newLead, error: createLeadError } = await supabase
        .from('leads')
        .insert({
          telefone_lead: phoneNumber,
          nome_lead: newLeadName,
          organization_id: organizationId,
          source: 'WhatsApp',
          stage: 'NOVO',
          last_message_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createLeadError) {
        console.error('❌ Erro ao criar lead:', createLeadError);
        console.error('❌ Lead data tentado:', { phoneNumber, newLeadName, organizationId });
        throw createLeadError;
      }

      console.log('✅ Lead criado com sucesso!');
      console.log('📋 Lead ID:', newLead.id);
      console.log('📱 Telefone:', newLead.telefone_lead);
      console.log('👤 Nome:', newLead.nome_lead);
      console.log('🏢 Organization:', newLead.organization_id);
      leadId = newLead.id;
      leadName = newLead.nome_lead;
    }


    // ========================================
    // PROCESSAR MÍDIA
    // ========================================
    
    let mediaUrl: string | null = null;
    
    // Se houver mídia, baixar via Evolution API e fazer upload para o Supabase Storage
    if (originalMediaUrl && mediaType && leadId && serverUrl && apiKey) {
      console.log(`📥 Processando mídia do tipo ${mediaType}...`);
      try {
        const messageId = messageKey.id;
        if (!messageId) {
          throw new Error('Message ID não encontrado');
        }
        
        mediaUrl = await downloadAndUploadMedia(
          messageId,
          mediaType,
          mediaMetadata?.mimetype || 'application/octet-stream',
          leadId,
          serverUrl,
          apiKey,
          instance
        );
        console.log(`✅ Mídia processada com sucesso: ${mediaUrl}`);
      } catch (error) {
        console.error(`❌ Erro ao processar mídia:`, error);
        // Não salvar URL em caso de erro - deixar null
        mediaUrl = null;
      }
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
        direcao: 'ENTRADA', // ENTRADA para mensagens recebidas
        data_hora: new Date().toISOString(),
        evolution_message_id: messageId,
        status_entrega: 'DELIVERED',
        media_url: mediaUrl,
        media_type: mediaType,
        media_metadata: mediaMetadata
      })
      .select()
      .single();

    if (saveMessageError) {
      console.error('❌ Erro ao salvar mensagem:', saveMessageError);
      console.error('❌ Mensagem data tentada:', { leadId, messageContent, messageId });
      throw saveMessageError;
    }

    console.log('✅ Mensagem salva com sucesso!');
    console.log('💬 Message ID:', savedMessage.id);
    console.log('📝 Conteúdo:', messageContent.substring(0, 50));

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
