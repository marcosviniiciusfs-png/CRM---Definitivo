import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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

    // Inicializar cliente Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar configurações do ambiente (secrets)
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://161.97.148.99:8080';
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      console.error('❌ API Key não encontrada');
      throw new Error('API Key da Evolution não configurada');
    }

    // Validar e normalizar URL da Evolution API
    try {
      const parsed = new URL(evolutionApiUrl);
      evolutionApiUrl = `${parsed.protocol}//${parsed.host}`;
    } catch (e) {
      console.warn('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.', { evolutionApiUrl });
      evolutionApiUrl = 'http://161.97.148.99:8080';
    }

    console.log('🌐 URL da Evolution API (normalizada):', evolutionApiUrl);

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
        number: remoteJid,
        audio: media_base64,
        delay: 0,
        encoding: true  // Evolution converte para formato PTT correto via FFmpeg
      };
      
      console.log('📤 Enviando áudio PTT para Evolution API:', {
        url: `${evolutionApiUrl}/message/sendWhatsAppAudio/${instance_name}`,
        number: remoteJid,
        encoding: true
      });

      const pttResponse = await fetch(
        `${evolutionApiUrl}/message/sendWhatsAppAudio/${instance_name}`,
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
      number: remoteJid,
      mediatype,
      mimetype: finalMimeType,
      caption: caption || '',
      media: media_base64,
      fileName: finalFileName,
    };

    console.log('📤 Enviando mídia para Evolution API:', {
      url: `${evolutionApiUrl}/message/sendMedia/${instance_name}`,
      mediaType: mediatype,
      fileName: finalFileName,
      mimetype: finalMimeType
    });

    const evolutionResponse = await fetch(
      `${evolutionApiUrl}/message/sendMedia/${instance_name}`,
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
