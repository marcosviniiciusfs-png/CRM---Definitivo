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
      leadId
    } = await req.json();

    console.log('📥 Recebida requisição para enviar mídia:', {
      instance_name,
      remoteJid,
      media_type,
      file_name,
      mime_type,
      caption,
      leadId
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
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'https://evolution01.kairozspace.com.br';
    const apiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!apiKey) {
      console.error('❌ API Key não encontrada');
      throw new Error('API Key da Evolution não configurada');
    }

    // Validar e normalizar URL da Evolution API
    try {
      const parsed = new URL(evolutionApiUrl);
      // Mantém apenas protocolo + host para evitar caminhos estranhos
      evolutionApiUrl = `${parsed.protocol}//${parsed.host}`;
    } catch (e) {
      console.warn('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.', {
        evolutionApiUrl,
        error: e instanceof Error ? e.message : String(e),
      });
      evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
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

    // Preparar payload baseado no tipo de mídia (formato plano exigido pela Evolution API)
    let mediatype = media_type;
    let finalFileName = file_name;

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
        finalFileName = finalFileName || 'audio.ogg';
        break;
      case 'document':
      default:
        mediatype = 'document';
        finalFileName = finalFileName || 'document.pdf';
        break;
    }

    const payload: any = {
      number: remoteJid,
      mediatype,
      mimetype: mime_type || 'application/octet-stream',
      caption: caption || '',
      media: media_base64,
      fileName: finalFileName,
    };

    console.log('📤 Enviando mídia para Evolution API:', {
      url: `${evolutionApiUrl}/message/sendMedia/${instance_name}`,
      mediaType: mediatype,
      fileName: finalFileName,
      mimetype: payload.mimetype,
    });

    // Enviar mídia via Evolution API
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
    
    // Preparar corpo da mensagem (vazio para imagens, nome do arquivo para outros tipos)
    let messageBody = '';
    if (media_type === 'image') {
      messageBody = caption || ''; // Só a legenda para imagens, se houver
    } else if (media_type === 'video') {
      messageBody = caption ? `${caption}` : '[Vídeo]';
    } else if (media_type === 'audio') {
      messageBody = '[Áudio]';
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
        media_url: evolutionData.message?.imageMessage?.url || evolutionData.message?.videoMessage?.url || evolutionData.message?.documentMessage?.url || null,
        media_metadata: {
          fileName: file_name,
          mimeType: mime_type,
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
        mediaUrl: evolutionData.message?.imageMessage?.url || evolutionData.message?.videoMessage?.url || evolutionData.message?.documentMessage?.url || null
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
