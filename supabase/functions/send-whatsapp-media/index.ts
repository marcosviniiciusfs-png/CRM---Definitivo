import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  formatPhoneToJid,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      instance_name,
      remoteJid,
      media_base64,
      media_type,
      file_name,
      mime_type,
      caption,
      leadId,
      is_ptt
    } = await req.json();

    console.log('📥 Recebida requisição para enviar mídia:', {
      instance_name,
      remoteJid,
      media_type,
      file_name,
      mime_type,
      caption,
      leadId,
      is_ptt
    });

    // Validar campos obrigatórios
    if (!instance_name || !remoteJid || !media_base64 || !media_type) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Campos obrigatórios faltando: instance_name, remoteJid, media_base64, media_type'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    let cleanApiUrl: string;
    let apiKey: string;
    try {
      cleanApiUrl = getEvolutionApiUrl();
      apiKey = getEvolutionApiKey();
    } catch (configError: any) {
      return new Response(
        JSON.stringify({ success: false, error: configError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const cleanApiUrl = normalizeUrl(cleanApiUrl);

    // Buscar instância para validação
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instance_name)
      .maybeSingle();

    if (instanceError || !instanceData) {
      console.error('❌ Instância não encontrada:', instance_name);
      throw new Error('Instância WhatsApp não encontrada');
    }

    // ========== ÁUDIO PTT: Usar endpoint dedicado sendWhatsAppAudio ==========
    if (media_type === 'audio' && is_ptt) {
      console.log('🎤 Usando endpoint sendWhatsAppAudio para PTT (com encoding server-side)');
      
      const pttPayload = {
        number: remoteJid.includes('@') ? remoteJid : formatPhoneToJid(remoteJid),
        audio: media_base64,
        delay: 0,
        encoding: true  // Evolution converte para formato PTT correto via FFmpeg
      };
      
      console.log('📤 Enviando áudio PTT para Evolution API:', {
        url: `${cleanApiUrl}/message/sendWhatsAppAudio/${instance_name}`,
        number: remoteJid,
        encoding: true
      });

      const pttResponse = await fetch(
        `${cleanApiUrl}/message/sendWhatsAppAudio/${instance_name}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
          },
          body: JSON.stringify(pttPayload),
        }
      );

      if (!pttResponse.ok) {
        const errorText = await pttResponse.text();
        console.error('❌ Erro no sendWhatsAppAudio:', {
          status: pttResponse.status,
          statusText: pttResponse.statusText,
          body: errorText
        });
        throw new Error(`Erro ao enviar áudio PTT: ${pttResponse.status} - ${errorText}`);
      }

      const pttData = await pttResponse.json();
      console.log('✅ Áudio PTT enviado com sucesso:', pttData);

      // Salvar mensagem no banco
      const messageId = pttData.key?.id || `ptt-${Date.now()}`;
      
      const { error: insertError } = await supabase
        .from('mensagens_chat')
        .insert({
          id_lead: leadId,
          corpo_mensagem: '[Áudio de Voz]',
          direcao: 'SAIDA',
          evolution_message_id: messageId,
          status_entrega: 'SENT',
          media_type: 'audio',
          media_metadata: {
            fileName: 'ptt.ogg',
            mimeType: 'audio/ogg; codecs=opus',
            isPTT: true
          }
        });

      if (insertError) {
        console.error('⚠️ Erro ao salvar mensagem PTT no banco:', insertError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          messageId: messageId,
          evolutionData: pttData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========== OUTROS TIPOS DE MÍDIA: Usar sendMedia padrão ==========
    let mediatype = media_type;
    let finalFileName = file_name;
    let finalMimeType = mime_type;

    switch (media_type) {
      case 'image':
        mediatype = 'image';
        finalFileName = finalFileName || 'image.jpg';
        break;
      case 'video':
        mediatype = 'video';
        finalFileName = finalFileName || 'video.mp4';
        break;
      case 'audio':
        mediatype = 'audio';
        finalFileName = finalFileName || 'audio.mp3';
        break;
      case 'document':
      default:
        mediatype = 'document';
        finalFileName = finalFileName || 'document.pdf';
        break;
    }
    finalMimeType = finalMimeType || 'application/octet-stream';

    const payload: any = {
      number: remoteJid.includes('@') ? remoteJid : formatPhoneToJid(remoteJid),
      mediatype,
      mimetype: finalMimeType,
      caption: caption || '',
      media: media_base64,
      fileName: finalFileName,
    };

    console.log('📤 Enviando mídia para Evolution API:', {
      url: `${cleanApiUrl}/message/sendMedia/${instance_name}`,
      mediaType: mediatype,
      fileName: finalFileName,
      mimetype: finalMimeType
    });

    const evolutionResponse = await fetch(
      `${cleanApiUrl}/message/sendMedia/${instance_name}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error('❌ Erro na Evolution API:', {
        status: evolutionResponse.status,
        statusText: evolutionResponse.statusText,
        body: errorText
      });
      throw new Error(`Erro da Evolution API: ${evolutionResponse.status} - ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log('✅ Resposta da Evolution API:', evolutionData);

    // Salvar mensagem no banco de dados
    const messageId = evolutionData.key?.id || `media-${Date.now()}`;
    
    // Upload para Supabase Storage para ter URL permanente
    let storageUrl: string | null = null;
    try {
      // Remover prefixo data:xxx;base64, se existir
      const base64Data = media_base64.replace(/^data:[^;]+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const filePath = `${leadId}/${Date.now()}-${finalFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-media')
        .upload(filePath, bytes, {
          contentType: finalMimeType,
          upsert: false
        });

      if (uploadError) {
        console.error('⚠️ Erro no upload para Storage:', uploadError);
      } else if (uploadData) {
        // Construir URL do Storage (bucket privado, requer signed URL)
        storageUrl = `${supabaseUrl}/storage/v1/object/chat-media/${filePath}`;
        console.log('✅ Mídia salva no Storage:', storageUrl);
      }
    } catch (uploadErr) {
      console.error('⚠️ Erro ao fazer upload para Storage:', uploadErr);
    }
    
    // Preparar corpo da mensagem
    let messageBody = '';
    if (media_type === 'image') {
      messageBody = caption || '';
    } else if (media_type === 'video') {
      messageBody = caption ? `${caption}` : '[Vídeo]';
    } else if (media_type === 'audio') {
      messageBody = is_ptt ? '[Áudio de Voz]' : '[Áudio]';
    } else {
      messageBody = caption ? `${caption}` : `[${file_name}]`;
    }
    
    const { error: insertError } = await supabase
      .from('mensagens_chat')
      .insert({
        id_lead: leadId,
        corpo_mensagem: messageBody,
        direcao: 'SAIDA',
        evolution_message_id: messageId,
        status_entrega: 'SENT',
        media_type: media_type,
        media_url: storageUrl || evolutionData.message?.imageMessage?.url || evolutionData.message?.videoMessage?.url || evolutionData.message?.documentMessage?.url || null,
        media_metadata: {
          fileName: finalFileName,
          mimeType: finalMimeType,
          fileSize: media_base64.length
        }
      });

    if (insertError) {
      console.error('⚠️ Erro ao salvar mensagem no banco:', insertError);
    } else {
      console.log('✅ Mensagem salva no banco de dados');
    }

    return new Response(
      JSON.stringify({
        success: true,
        messageId: messageId,
        evolutionData: evolutionData,
        // Priorizar storageUrl (URL permanente) sobre URL temporária do Evolution
        mediaUrl: storageUrl || evolutionData.message?.imageMessage?.url || evolutionData.message?.videoMessage?.url || evolutionData.message?.documentMessage?.url || null
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao enviar mídia:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido ao enviar mídia'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
