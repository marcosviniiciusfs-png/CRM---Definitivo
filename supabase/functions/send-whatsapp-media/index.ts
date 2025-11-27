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

    // Buscar configuração da URL da Evolution API
    const { data: configData, error: configError } = await supabase
      .from('app_config')
      .select('config_value')
      .eq('config_key', 'evolution_api_url')
      .maybeSingle();

    if (configError) {
      console.error('❌ Erro ao buscar configuração:', configError);
      throw new Error('Erro ao buscar configuração da Evolution API');
    }

    let evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
    if (configData?.config_value) {
      evolutionApiUrl = configData.config_value;
    }

    console.log('🌐 URL da Evolution API:', evolutionApiUrl);

    // Buscar API Key da instância
    const { data: instanceData, error: instanceError } = await supabase
      .from('whatsapp_instances')
      .select('id')
      .eq('instance_name', instance_name)
      .maybeSingle();

    if (instanceError || !instanceData) {
      console.error('❌ Instância não encontrada:', instance_name);
      throw new Error('Instância WhatsApp não encontrada');
    }

    // Buscar API Key do app_config
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('app_config')
      .select('config_value')
      .eq('config_key', 'evolution_api_key')
      .maybeSingle();

    if (apiKeyError || !apiKeyData) {
      console.error('❌ API Key não encontrada');
      throw new Error('API Key da Evolution não configurada');
    }

    const apiKey = apiKeyData.config_value;

    // Preparar payload baseado no tipo de mídia
    const payload: any = {
      number: remoteJid
    };

    // Adicionar mídia baseado no tipo
    switch (media_type) {
      case 'image':
        payload.mediaMessage = {
          mediatype: 'image',
          media: media_base64,
          fileName: file_name || 'image.jpg',
          caption: caption || ''
        };
        break;
      case 'video':
        payload.mediaMessage = {
          mediatype: 'video',
          media: media_base64,
          fileName: file_name || 'video.mp4',
          caption: caption || ''
        };
        break;
      case 'audio':
        payload.audioMessage = {
          audio: media_base64
        };
        break;
      case 'document':
      default:
        payload.mediaMessage = {
          mediatype: 'document',
          media: media_base64,
          fileName: file_name || 'document.pdf',
          caption: caption || ''
        };
        break;
    }

    console.log('📤 Enviando mídia para Evolution API:', {
      url: `${evolutionApiUrl}/message/sendMedia/${instance_name}`,
      mediaType: media_type,
      fileName: file_name
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
    
    const { error: insertError } = await supabase
      .from('mensagens_chat')
      .insert({
        id_lead: leadId,
        corpo_mensagem: caption ? `*${caption}*\n[${media_type === 'image' ? 'Imagem' : media_type === 'video' ? 'Vídeo' : media_type === 'audio' ? 'Áudio' : 'Arquivo'}]` : `[${media_type === 'image' ? 'Imagem' : media_type === 'video' ? 'Vídeo' : media_type === 'audio' ? 'Áudio' : 'Arquivo'}]`,
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
