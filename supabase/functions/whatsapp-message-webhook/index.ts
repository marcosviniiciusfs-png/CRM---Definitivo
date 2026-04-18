import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  mapEvolutionState,
  isConnectedState,
  extractPhoneNumber,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";

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
    console.log(`✅ Resposta da Evolution API recebida, tamanho do base64:`, data.base64?.length || 0);
    
    // A Evolution API retorna { base64: "..." }
    if (!data.base64) {
      console.error('❌ Base64 não encontrado na resposta:', JSON.stringify(data).substring(0, 200));
      throw new Error('Base64 não encontrado na resposta da Evolution API');
    }
    
    // Converter base64 para buffer usando Deno's native decoder
    // Remover prefixo data:mime/type;base64, se existir
    const base64Data = data.base64.replace(/^data:[^;]+;base64,/, '');
    console.log(`🔄 Decodificando base64, tamanho limpo:`, base64Data.length);
    
    // Usar TextEncoder/TextDecoder do Deno
    const binaryString = atob(base64Data);
    const binaryData = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      binaryData[i] = binaryString.charCodeAt(i);
    }
    
    console.log(`✅ Buffer criado, tamanho:`, binaryData.length, 'bytes');
    
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
    
    console.log(`📤 Fazendo upload para Storage: ${fileName}, tamanho: ${binaryData.length} bytes, tipo: ${mimetype}`);
    
    // Criar cliente Supabase admin
    const supabaseAdmin = createSupabaseAdmin();
    
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
    
    console.log(`✅ Upload concluído com sucesso!`);
    console.log(`🔗 URL pública:`, urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error: any) {
    console.error(`❌ Erro ao processar ${mediaType}:`, error);
    console.error(`❌ Stack trace:`, error?.stack);
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

  // 🔒 VALIDAÇÃO DE AUTENTICAÇÃO
  const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
  const authHeader = req.headers.get('x-api-key');

  // CRÍTICO: Só validar autenticação quando EVOLUTION_WEBHOOK_SECRET está configurado.
  // Se não estiver configurado, aceitar requisições sem header (webhook sem auth).
  // Antes: !webhookSecret → rejeitava TODOS os eventos quando a variável não estava definida.
  if (webhookSecret && (!authHeader || authHeader !== webhookSecret)) {
    console.error('❌ Unauthorized webhook access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('📥 Tentando ler payload...');
    const payload = await req.json();
    console.log('✅ PAYLOAD RECEBIDO:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    const instance = payload.instance;
    const data = payload.data;
    let serverUrl: string;
    let apiKey: string;
    try {
      serverUrl = getEvolutionApiUrl();
      apiKey = getEvolutionApiKey();
    } catch (configError: any) {
      console.error('❌ Erro de configuração:', configError.message);
      return new Response(
        JSON.stringify({ success: false, error: configError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const supabase = createSupabaseAdmin();

    console.log('🔧 URL do servidor Evolution:', serverUrl);

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

    // ==================== EVENTO: QRCODE.UPDATED ====================
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      console.log(`🔄 Processando QR Code para instância: ${instance}`);

      let rawBase64 = '';
      
      if (data?.qrcode?.base64 && typeof data.qrcode.base64 === 'string') {
        rawBase64 = data.qrcode.base64;
        console.log('✅ QR extraído de: data.qrcode.base64');
      } else if (typeof data?.qrcode === 'string') {
        rawBase64 = data.qrcode;
        console.log('✅ QR extraído de: data.qrcode (string)');
      } else if (typeof data?.qr === 'string') {
        rawBase64 = data.qr;
        console.log('✅ QR extraído de: data.qr');
      } else if (typeof data?.base64 === 'string') {
        rawBase64 = data.base64;
        console.log('✅ QR extraído de: data.base64');
      }
      
      if (!rawBase64) {
        console.warn('⚠️ QR Code não encontrado no payload');
        return new Response(
          JSON.stringify({ success: false, error: 'QR Code não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      
      // Limpar Base64
      let cleanedBase64 = rawBase64;
      if (cleanedBase64.startsWith('"') && cleanedBase64.endsWith('"')) {
        cleanedBase64 = cleanedBase64.slice(1, -1);
      }
      cleanedBase64 = cleanedBase64.replace(/^data:image\/[a-z]+;base64,/i, '');
      cleanedBase64 = cleanedBase64.replace(/\s/g, '');
      cleanedBase64 = cleanedBase64.replace(/['"]/g, '');
      cleanedBase64 = cleanedBase64.replace(/[^A-Za-z0-9+/=]/g, '');
      
      console.log(`✅ QR Code limpo: ${cleanedBase64.length} caracteres`);
      
      // Atualizar no banco
      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({ 
          qr_code: cleanedBase64,
          status: 'WAITING_QR',
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instance);
      
      if (updateError) {
        console.error('❌ Erro ao atualizar QR Code:', updateError);
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }
      
      console.log(`✅ QR Code atualizado no banco para instância: ${instance}`);
      return new Response(
        JSON.stringify({ success: true, message: 'QR Code atualizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    // ==================== EVENTO: CONNECTION_UPDATE ====================
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      console.log(`🔄 Processando atualização de conexão para instância: ${instance}`);

      const state = data?.state || data?.status || data?.connection;
      console.log('📊 Estado da conexão recebido:', state);

      // PROTEÇÃO: Ignorar estados nulos/vazios/undefined — manter status atual
      if (!state || typeof state !== 'string' || state.trim() === '') {
        console.log('⏭️ Estado vazio ou nulo — ignorando update (mantendo status atual)');
        return new Response(
          JSON.stringify({ success: true, message: 'Estado vazio ignorado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const normalizedState = state.toLowerCase().trim();

      // PROTEÇÃO: Estado transitório "connecting" — NÃO sobrescrever status existente
      if (normalizedState === 'connecting') {
        console.log('⏭️ Estado transitório "connecting" — ignorando para proteger status atual');
        return new Response(
          JSON.stringify({ success: true, message: 'Estado transitório ignorado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      let newStatus: string;

      newStatus = mapEvolutionState(normalizedState);

      if (newStatus === 'CONNECTED') {
        // Conectado — atualizar normalmente
      } else if (normalizedState === 'close' || normalizedState === 'disconnected') {
        // DOUBLE-CHECK: Confirmar desconexão com Evolution API antes de marcar
        console.log('🔍 Estado "close/disconnected" recebido — fazendo double-check na Evolution API...');

        let evolutionApiUrl: string;
        let evolutionApiKey: string;
        try {
          evolutionApiUrl = getEvolutionApiUrl();
          evolutionApiKey = getEvolutionApiKey();
        } catch {
          // Se não conseguir obter config, a auto-reconexão falhará silenciosamente
          return;
        }

        let confirmedDisconnected = true;

        try {
          const checkResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instance}`, {
            method: 'GET',
            headers: {
              'apikey': evolutionApiKey,
              'Content-Type': 'application/json',
            },
          });

          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            const realState = checkData.instance?.state || checkData.state || '';
            console.log('📊 Double-check: estado real na Evolution API:', realState);

            if (isConnectedState(realState)) {
              console.log('✅ Double-check: instância AINDA ESTÁ CONECTADA! Ignorando webhook de desconexão (falso positivo).');
              confirmedDisconnected = false;
            } else {
              console.log('❌ Double-check: desconexão confirmada. Estado real:', realState);
            }
          } else {
            console.warn('⚠️ Double-check: Evolution API retornou erro', checkResponse.status, '— assumindo desconectado');
          }
        } catch (checkError) {
          console.warn('⚠️ Double-check: erro ao contactar Evolution API:', checkError, '— assumindo desconectado');
        }

        if (!confirmedDisconnected) {
          return new Response(
            JSON.stringify({ success: true, message: 'Falso positivo — conexão ainda ativa' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
          );
        }

        // Desconexão confirmada — tentar auto-reconexão em background
        console.log('🔄 Disconexão confirmada — tentando auto-reconexão em background...');

        const reconnectAttempt = async () => {
          try {
            const evolutionApiKey = getEvolutionApiKey();
            let evoUrl: string;
            try { evoUrl = getEvolutionApiUrl(); } catch { return; }

            for (let attempt = 1; attempt <= 3; attempt++) {
              console.log(`🔄 Auto-reconexão tentativa ${attempt}/3 para ${instance}...`);

              const restartResponse = await fetch(`${evoUrl}/instance/restart/${instance}`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': evolutionApiKey,
                },
              });

              if (restartResponse.ok) {
                // Esperar 5 segundos antes de verificar
                await new Promise(resolve => setTimeout(resolve, 5000));

                const stateResponse = await fetch(`${evoUrl}/instance/connectionState/${instance}`, {
                  method: 'GET',
                  headers: {
                    'apikey': evolutionApiKey,
                    'Content-Type': 'application/json',
                  },
                });

                if (stateResponse.ok) {
                  const stateData = await stateResponse.json();
                  const currentState = stateData.instance?.state || stateData.state || '';

                  if (isConnectedState(currentState)) {
                    console.log(`✅ Auto-reconexão bem-sucedida na tentativa ${attempt}!`);
                    await supabase
                      .from('whatsapp_instances')
                      .update({ status: 'CONNECTED', updated_at: new Date().toISOString() })
                      .eq('instance_name', instance);
                    return;
                  }
                }
              }

              if (attempt < 3) {
                console.log(`⏳ Tentativa ${attempt} falhou — aguardando 10s antes da próxima...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
              }
            }

            console.log('❌ Auto-reconexão falhou após 3 tentativas — marcando como DISCONNECTED');
            await supabase
              .from('whatsapp_instances')
              .update({ status: 'DISCONNECTED', updated_at: new Date().toISOString() })
              .eq('instance_name', instance);
          } catch (err) {
            console.error('❌ Erro na auto-reconexão:', err);
            await supabase
              .from('whatsapp_instances')
              .update({ status: 'DISCONNECTED', updated_at: new Date().toISOString() })
              .eq('instance_name', instance);
          }
        };

        // Executar auto-reconexão em background (não bloqueia resposta)
        reconnectAttempt().catch(err => console.error('❌ Falha na auto-reconexão background:', err));

        // Retornar imediatamente — a auto-reconexão acontece em background
        return new Response(
          JSON.stringify({ success: true, message: 'Auto-reconexão iniciada em background' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      } else {
        // Estado não reconhecido — NÃO assumir desconexão
        console.log(`⏭️ Estado não reconhecido "${normalizedState}" — ignorando para proteger status atual`);
        return new Response(
          JSON.stringify({ success: true, message: `Estado não reconhecido ignorado: ${normalizedState}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const updatePayload: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      // Limpar QR code se conectou
      if (newStatus === 'CONNECTED') {
        updatePayload.qr_code = null;
        updatePayload.connected_at = new Date().toISOString();
      }

      // PROTEÇÃO: Se atualizando para qualquer status não-CONNECTED, não sobrescrever CONNECTED
      if (newStatus !== 'CONNECTED') {
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update(updatePayload)
          .eq('instance_name', instance)
          .neq('status', 'CONNECTED');

        if (updateError) {
          console.error('❌ Erro ao atualizar status:', updateError);
        } else {
          console.log(`✅ Status atualizado para ${newStatus}: ${instance} (com proteção CONNECTED)`);
        }
      } else {
        const { error: updateError } = await supabase
          .from('whatsapp_instances')
          .update(updatePayload)
          .eq('instance_name', instance);

        if (updateError) {
          console.error('❌ Erro ao atualizar status:', updateError);
        } else {
          console.log(`✅ Status atualizado para ${newStatus}: ${instance}`);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Status atualizado: ${newStatus}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Processar apenas eventos de mensagens recebidas
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      console.log(`⏭️ Evento ${event} - ignorado`);
      return new Response(
        JSON.stringify({ success: true, message: `Evento ${event} não processado` }),
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

    // Buscar a instância do WhatsApp no banco para obter o user_id e organization_id
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('user_id, phone_number, organization_id')
      .eq('instance_name', instance)
      .maybeSingle();

    if (instanceError) {
      console.error('❌ Erro ao buscar instância:', instanceError);
      throw instanceError;
    }

    if (!instanceData) {
      console.error('❌ Instância não registrada:', instance);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Instância WhatsApp não encontrada. Por favor, reconecte o WhatsApp.',
          instance_received: instance,
          solution: 'Vá em Configurações > Integração e reconecte o WhatsApp'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('✅ Instância encontrada:', JSON.stringify(instanceData));

    // Usar organization_id diretamente da instância
    const organizationId = instanceData.organization_id;
    
    if (!organizationId) {
      console.error('❌ Organization não encontrada para a instância:', instance);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Organização não encontrada para esta instância. Por favor, reconecte o WhatsApp.',
          instance: instance
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    console.log('✅ Organization ID:', organizationId);

    // Função auxiliar para salvar log
    const saveWebhookLog = async (status: string, errorMessage?: string) => {
      try {
        const logData: any = {
          organization_id: organizationId,
          instance_name: instance,
          event_type: event,
          status,
          payload,
          error_message: errorMessage,
        };

        // Adicionar dados da mensagem se disponível
        if (data?.key?.remoteJid) logData.remote_jid = data.key.remoteJid;
        if (data?.pushName) logData.sender_name = data.pushName;
        if (data?.message) {
          const msgContent = data.message?.conversation || 
                            data.message?.extendedTextMessage?.text || 
                            data.message?.imageMessage?.caption ||
                            data.message?.videoMessage?.caption ||
                            data.message?.audioMessage ? '[Áudio]' :
                            data.message?.documentMessage ? '[Documento]' : '';
          logData.message_content = msgContent;
        }
        if (data?.messageType) logData.message_type = data.messageType;
        if (data?.key?.fromMe !== undefined) logData.direction = data.key.fromMe ? 'SENT' : 'RECEIVED';

        await supabase.from('webhook_logs').insert(logData);
      } catch (err) {
        console.error('❌ Erro ao salvar log:', err);
      }
    };

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
    
    // CRÍTICO: Extrair número de telefone do remetente usando múltiplas estratégias
    // Prioridade: senderPn > remoteJid > participant
    let senderPhone = '';
    const remoteJid = messageKey.remoteJid || '';
    
    if (messageKey.senderPn) {
      senderPhone = messageKey.senderPn;
      console.log('📱 Usando senderPn:', senderPhone);
    } else if (remoteJid.includes('@s.whatsapp.net')) {
      senderPhone = remoteJid;
      console.log('📱 Usando remoteJid (direto):', senderPhone);
    } else if (messageKey.participant) {
      // Para mensagens de grupo, usar participant
      senderPhone = messageKey.participant;
      console.log('📱 Usando participant:', senderPhone);
    } else if (messageKey.senderLid) {
      // Fallback para senderLid se disponível
      senderPhone = messageKey.senderLid;
      console.log('📱 Usando senderLid:', senderPhone);
    } else {
      senderPhone = remoteJid;
      console.log('📱 Usando remoteJid (fallback):', senderPhone);
    }
    
    console.log('📱 Sender Phone final:', senderPhone);
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
    
    // Extrair número do contato limpo
    // Remove TODOS os sufixos: @s.whatsapp.net, @lid, @g.us, @c.us
    const phoneNumber = extractPhoneNumber(senderPhone);
    
    // Validar que temos um número válido
    if (!phoneNumber || phoneNumber.length < 8) {
      console.error('❌ Número de telefone inválido ou ausente:', phoneNumber);
      await saveWebhookLog('error', 'Número de telefone inválido ou ausente');
      return new Response(
        JSON.stringify({ success: false, message: 'Número de telefone inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }
    
    console.log('📱 Número extraído:', phoneNumber);
    
    // Se for mensagem enviada por nós, ignorar (já foi salva ao enviar)
    if (isFromMe) {
      console.log('⏭️ Mensagem enviada por nós - ignorando');
      await saveWebhookLog('ignored', 'Mensagem enviada por nós');
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
    } else if (messageInfo.videoMessage?.gifPlayback) {
      // GIFs vêm como vídeos com flag gifPlayback = true
      messageContent = '[GIF]';
      originalMediaUrl = messageInfo.videoMessage.url;
      mediaType = 'gif';
      mediaMetadata = {
        mimetype: messageInfo.videoMessage.mimetype,
        fileLength: messageInfo.videoMessage.fileLength,
        seconds: messageInfo.videoMessage.seconds,
        gifPlayback: true
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
    } else if (messageInfo.stickerMessage) {
      // Stickers (Figurinhas)
      messageContent = '[Figurinha]';
      originalMediaUrl = messageInfo.stickerMessage.url;
      mediaType = 'sticker';
      mediaMetadata = {
        mimetype: messageInfo.stickerMessage.mimetype,
        fileLength: messageInfo.stickerMessage.fileLength,
        isAnimated: messageInfo.stickerMessage.isAnimated
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
      .select('id, nome_lead, funnel_id, funnel_stage_id')
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
      
      // Se o lead existente ainda não tem funil configurado, aplicar mesma regra de mapeamento
      if (!existingLead.funnel_id) {
        console.log('🔄 Lead existente sem funil, aplicando mapeamento padrão de funil para WhatsApp...');

        // Buscar funis da organização
        const { data: orgFunnels } = await supabase
          .from('sales_funnels')
          .select('id')
          .eq('organization_id', organizationId);

        const funnelIds = orgFunnels?.map(f => f.id) || [];
        console.log('🎯 Funis da organização (existente):', funnelIds);

        let funnelId: string | null = null;
        let funnelStageId: string | null = null;

        if (funnelIds.length > 0) {
          // Buscar mapeamento para WhatsApp
          const { data: funnelMapping } = await supabase
            .from('funnel_source_mappings')
            .select('funnel_id, target_stage_id')
            .eq('source_type', 'whatsapp')
            .in('funnel_id', funnelIds)
            .maybeSingle();

          if (funnelMapping) {
            console.log('✅ Mapeamento encontrado para lead existente:', funnelMapping);
            funnelId = funnelMapping.funnel_id;
            funnelStageId = funnelMapping.target_stage_id;
          } else {
            console.log('⚠️ Nenhum mapeamento encontrado para lead existente, usando funil padrão');
            // CORREÇÃO: usar .limit(1) em vez de .maybeSingle() para evitar erro
            // quando há múltiplos funis com is_default = true.
            const { data: defaultFunnels } = await supabase
              .from('sales_funnels')
              .select('id')
              .eq('organization_id', organizationId)
              .eq('is_default', true)
              .order('created_at', { ascending: true })
              .limit(1);

            const defaultFunnel = defaultFunnels && defaultFunnels.length > 0 ? defaultFunnels[0] : null;

            if (defaultFunnel) {
              funnelId = defaultFunnel.id;

              const { data: firstStage } = await supabase
                .from('funnel_stages')
                .select('id')
                .eq('funnel_id', defaultFunnel.id)
                .order('position')
                .limit(1)
                .maybeSingle();

              if (firstStage) {
                funnelStageId = firstStage.id;
              }
            }
          }
        }

        if (funnelId && funnelStageId) {
          console.log('✅ Atualizando funil do lead existente:', { funnelId, funnelStageId });
          await supabase
            .from('leads')
            .update({
              funnel_id: funnelId,
              funnel_stage_id: funnelStageId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLead.id);
        } else {
          console.log('⚠️ Não foi possível determinar funil/etapa para o lead existente');
        }
      }
      
      // Buscar foto de perfil do WhatsApp de forma assíncrona (não bloqueia o fluxo)
      supabase.functions.invoke('fetch-profile-picture', {
        body: {
          instance_name: instance,
          phone_number: phoneNumber,
          lead_id: existingLead.id
        }
      }).then(({ data, error }) => {
        if (error) {
          console.error('⚠️ Erro ao buscar foto de perfil:', error);
        } else {
          console.log('✅ Foto de perfil processada:', data);
        }
      }).catch(err => {
        console.error('⚠️ Falha ao invocar fetch-profile-picture:', err);
      });
    } else {
      console.log('🆕 Criando novo lead...');
      
      // Usar pushName ou número como nome do lead
      const newLeadName = pushName || phoneNumber;
      
      // 🎯 BUSCAR MAPEAMENTO DE FUNIL PARA WHATSAPP
      console.log('🔍 Buscando mapeamento de funil para WhatsApp...');
      
      // Primeiro, buscar os funis da organização
      const { data: orgFunnels } = await supabase
        .from('sales_funnels')
        .select('id')
        .eq('organization_id', organizationId);
      
      const funnelIds = orgFunnels?.map(f => f.id) || [];
      console.log('🎯 Funis da organização:', funnelIds);
      
      // Depois, buscar o mapeamento para esses funis
      const { data: funnelMapping } = await supabase
        .from('funnel_source_mappings')
        .select('funnel_id, target_stage_id')
        .eq('source_type', 'whatsapp')
        .in('funnel_id', funnelIds)
        .maybeSingle();
      
      let funnelId: string | null = null;
      let funnelStageId: string | null = null;
      
      if (funnelMapping) {
        console.log('✅ Mapeamento encontrado:', funnelMapping);
        funnelId = funnelMapping.funnel_id;
        funnelStageId = funnelMapping.target_stage_id;
      } else {
        console.log('⚠️ Nenhum mapeamento encontrado, usando funil padrão');
        // CORREÇÃO: usar .limit(1) em vez de .maybeSingle() para evitar erro
        // quando há múltiplos funis com is_default = true.
        const { data: defaultFunnels } = await supabase
          .from('sales_funnels')
          .select('id')
          .eq('organization_id', organizationId)
          .eq('is_default', true)
          .order('created_at', { ascending: true })
          .limit(1);

        const defaultFunnel = defaultFunnels && defaultFunnels.length > 0 ? defaultFunnels[0] : null;

        if (defaultFunnel) {
          funnelId = defaultFunnel.id;

          // Buscar primeira etapa do funil padrão
          const { data: firstStage } = await supabase
            .from('funnel_stages')
            .select('id')
            .eq('funnel_id', defaultFunnel.id)
            .order('position')
            .limit(1)
            .maybeSingle();

          if (firstStage) {
            funnelStageId = firstStage.id;
          }
        }
      }
      
      const { data: newLead, error: createLeadError } = await supabase
        .from('leads')
        .insert({
          telefone_lead: phoneNumber,
          nome_lead: newLeadName,
          organization_id: organizationId,
          source: 'WhatsApp',
          stage: 'NOVO',
          funnel_id: funnelId,
          funnel_stage_id: funnelStageId,
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
      
      // ✅ DISTRIBUIR LEAD NA ROLETA (apenas para leads NOVOS)
      supabase.functions.invoke('distribute-lead', {
        body: {
          lead_id: newLead.id,
          organization_id: organizationId,
          trigger_source: 'whatsapp',
        },
      }).then(({ data, error }) => {
        if (error) {
          console.error('⚠️ Erro ao distribuir lead:', error);
        } else {
          console.log('✅ Lead distribuído:', data);
        }
      }).catch(err => {
        console.error('⚠️ Falha ao invocar distribute-lead:', err);
      });
      
      // Buscar foto de perfil do WhatsApp de forma assíncrona (não bloqueia o fluxo)
      supabase.functions.invoke('fetch-profile-picture', {
        body: {
          instance_name: instance,
          phone_number: phoneNumber,
          lead_id: newLead.id
        }
      }).then(({ data, error }) => {
        if (error) {
          console.error('⚠️ Erro ao buscar foto de perfil:', error);
        } else {
          console.log('✅ Foto de perfil processada:', data);
        }
      }).catch(err => {
        console.error('⚠️ Falha ao invocar fetch-profile-picture:', err);
      });
    }


    // ========================================
    // PROCESSAR MÍDIA
    // ========================================
    
    let mediaUrl: string | null = null;
    
    // Log detalhado dos parâmetros para debugging
    console.log('🔍 Verificando condições para processar mídia:');
    console.log(`  - originalMediaUrl: ${originalMediaUrl ? 'PRESENTE' : 'AUSENTE'}`);
    console.log(`  - mediaType: ${mediaType || 'AUSENTE'}`);
    console.log(`  - leadId: ${leadId || 'AUSENTE'}`);
    console.log(`  - serverUrl: ${serverUrl || 'AUSENTE'}`);
    console.log(`  - apiKey: ${apiKey ? 'PRESENTE' : 'AUSENTE'}`);
    
    // Se houver mídia, baixar via Evolution API e fazer upload para o Supabase Storage
    if (originalMediaUrl && mediaType && leadId && serverUrl && apiKey) {
      console.log(`📥 ✅ TODAS CONDIÇÕES OK - Processando mídia do tipo ${mediaType}...`);
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
        console.log(`✅ ✅ ✅ Mídia processada com sucesso: ${mediaUrl}`);
      } catch (error: any) {
        console.error(`❌ ❌ ❌ ERRO CRÍTICO ao processar mídia:`, error);
        console.error(`❌ Detalhes do erro:`, {
          message: error?.message,
          stack: error?.stack,
          mediaType,
          leadId,
          messageId: messageKey.id,
          originalMediaUrl,
          serverUrl,
          hasApiKey: !!apiKey
        });
        // Não salvar URL em caso de erro - deixar null
        mediaUrl = null;
      }
    } else {
      console.log('⚠️ ⚠️ ⚠️ CONDIÇÕES NÃO ATENDIDAS - mídia não será processada');
      console.log(`  Final check - Faltando: ${[
        !originalMediaUrl && 'originalMediaUrl',
        !mediaType && 'mediaType',
        !leadId && 'leadId',
        !serverUrl && 'serverUrl',
        !apiKey && 'apiKey'
      ].filter(Boolean).join(', ')}`);
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

    const nowIso = new Date().toISOString();

    // Atualizar last_message_at do lead e marcá-lo como online imediatamente
    await supabase
      .from('leads')
      .update({ 
        last_message_at: nowIso,
        is_online: true,
        last_seen: null,
        updated_at: nowIso,
      })
      .eq('id', leadId);

    await saveWebhookLog('success');

    // Processar automações (não bloqueia o retorno)
    const isFirstMessage = !existingLead;
    const triggerType = isFirstMessage ? 'WHATSAPP_FIRST_MESSAGE' : 'NEW_INCOMING_MESSAGE';
    
    supabase.functions.invoke('process-automation-rules', {
      body: {
        trigger_type: triggerType,
        trigger_data: {
          lead_id: leadId,
          message_id: savedMessage.id,
          message_content: messageContent,
          organization_id: organizationId,
          phone_number: phoneNumber,
        },
      },
    }).then(({ data, error }) => {
      if (error) {
        console.error('⚠️ Erro ao processar automações:', error);
      } else {
        console.log('✅ Automações processadas:', data);
      }
    }).catch(err => {
      console.error('⚠️ Falha ao invocar process-automation-rules:', err);
    });

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
    
    // Tentar salvar log de erro
    try {
      const payload = await req.clone().json().catch(() => ({}));
      const instanceName = payload?.instance || 'unknown';
      const event = payload?.event || 'unknown';
      
      // Buscar organization_id se possível
      const supabase = createSupabaseAdmin();
      
      const { data: instanceData } = await supabase
        .from('whatsapp_instances')
        .select('organization_id')
        .eq('instance_name', instanceName)
        .maybeSingle();
      
      if (instanceData?.organization_id) {
        await supabase.from('webhook_logs').insert({
          organization_id: instanceData.organization_id,
          instance_name: instanceName,
          event_type: event,
          status: 'error',
          error_message: error.message || String(error),
          payload: payload || {},
        });
      }
    } catch (logError) {
      console.error('❌ Erro ao salvar log de erro:', logError);
    }
    
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
