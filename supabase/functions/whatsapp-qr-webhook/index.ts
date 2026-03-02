import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// CRITICAL: Rigorously clean Base64 string
function cleanBase64(rawBase64: string): string {
  // CRÍTICO: Remover aspas duplas literais no início e fim
  let cleaned = rawBase64;
  if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
    cleaned = cleaned.slice(1, -1);
  }
  
  // Remover prefixo data:image se existir
  cleaned = cleaned.replace(/^data:image\/[a-z]+;base64,/i, '');
  
  // Remover espaços, aspas e caracteres inválidos
  cleaned = cleaned.replace(/\s/g, '');
  cleaned = cleaned.replace(/['"]/g, '');
  cleaned = cleaned.replace(/[^A-Za-z0-9+/=]/g, '');
  
  return cleaned;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 🔒 VALIDAÇÃO DE AUTENTICAÇÃO
  const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
  const authHeader = req.headers.get('x-api-key');

  if (!webhookSecret || !authHeader || authHeader !== webhookSecret) {
    console.error('❌ Unauthorized webhook access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const payload = await req.json();
    console.log('📥 Webhook recebido:', JSON.stringify(payload, null, 2));

    const event = payload.event;
    const instance = payload.instance;
    const data = payload.data;

    if (!event || !instance) {
      console.log('⚠️ Payload inválido');
      return new Response(
        JSON.stringify({ success: true, message: 'Payload inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ==================== EVENTO: QRCODE.UPDATED ====================
    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      console.log(`🔄 Processando QR Code para instância: ${instance}`);
      
      // CRÍTICO: Verificar se a instância existe antes de atualizar
      const { data: existingInstance, error: findError } = await supabase
        .from('whatsapp_instances')
        .select('id, instance_name')
        .eq('instance_name', instance)
        .single();

      if (findError || !existingInstance) {
        console.warn(`⚠️ Instância ${instance} não existe no banco - ignorando QR update`);
        return new Response(
          JSON.stringify({ success: false, error: 'Instância não encontrada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
        );
      }

      console.log(`✅ Instância encontrada: ${existingInstance.id}`);
      
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
      } else if (data?.qrcode && typeof data.qrcode === 'object') {
        const qrObject: any = data.qrcode;
        if (typeof qrObject.base64 === 'string') {
          rawBase64 = qrObject.base64;
          console.log('✅ QR extraído de objeto: data.qrcode.base64');
        }
      }

      if (typeof rawBase64 !== 'string' || rawBase64.length === 0) {
        console.error('❌ QR Code não encontrado');
        return new Response(
          JSON.stringify({ success: false, error: 'QR Code não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const cleanedBase64 = cleanBase64(rawBase64);
      
      if (cleanedBase64.length < 1000) {
        console.error(`❌ QR Code inválido: ${cleanedBase64.length} caracteres`);
        return new Response(
          JSON.stringify({ success: false, error: 'QR Code muito curto' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`✅ QR Code limpo: ${cleanedBase64.length} caracteres`);

      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update({ 
          qr_code: cleanedBase64,
          status: 'WAITING_QR',
          updated_at: new Date().toISOString()
        })
        .eq('instance_name', instance);

      if (updateError) {
        console.error('❌ Erro ao salvar QR Code:', updateError);
        throw updateError;
      }

      console.log(`✅ QR Code salvo para: ${instance}`);

      return new Response(
        JSON.stringify({ success: true, message: 'QR Code atualizado', qrCodeLength: cleanedBase64.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==================== EVENTO: CONNECTION.UPDATE ====================
    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      console.log('🔌 CONNECTION_UPDATE recebido:', JSON.stringify(data, null, 2));
      
      const state = data?.state || data?.status;
      
      if (!state) {
        console.log('⚠️ Estado não encontrado no payload');
        return new Response(
          JSON.stringify({ success: true, message: 'Estado não encontrado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      let internalStatus = 'DISCONNECTED';
      let phoneNumber = null;
      let connectedAt = null;
      let qrCode: string | null | undefined = undefined;

      console.log('🔍 Processando estado:', state);

      switch (state.toLowerCase()) {
        case 'open':
        case 'connected':
          internalStatus = 'CONNECTED';
          phoneNumber = data?.phoneNumber || data?.number || null;
          connectedAt = new Date().toISOString();
          qrCode = null; // CRÍTICO: Limpar QR Code quando conectado
          console.log('✅ Conexão estabelecida!', {
            internalStatus,
            phoneNumber,
            connectedAt,
            willClearQrCode: true
          });
          break;
        case 'close':
        case 'disconnected':
          internalStatus = 'DISCONNECTED';
          console.log('⚠️ Conexão desconectada - iniciando auto-deleção da instância');
          
          // 🗑️ AUTO-DELETAR INSTÂNCIA QUANDO DESCONECTADA
          try {
            const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL')?.replace(/\/manager\/?$/, '').replace(/\/$/, '');
            const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');
            
            if (evolutionApiUrl && evolutionApiKey) {
              console.log(`🗑️ Deletando instância ${instance} da Evolution API...`);
              
              // 1. Primeiro fazer logout da instância
              try {
                const logoutResponse = await fetch(`${evolutionApiUrl}/instance/logout/${instance}`, {
                  method: 'DELETE',
                  headers: { 
                    'apikey': evolutionApiKey, 
                    'Content-Type': 'application/json' 
                  },
                });
                console.log(`📤 Logout response: ${logoutResponse.status}`);
              } catch (logoutErr) {
                console.warn('⚠️ Erro no logout (ignorando):', logoutErr);
              }
              
              // 2. Deletar a instância da Evolution API
              const deleteResponse = await fetch(`${evolutionApiUrl}/instance/delete/${instance}`, {
                method: 'DELETE',
                headers: { 
                  'apikey': evolutionApiKey, 
                  'Content-Type': 'application/json' 
                },
              });
              console.log(`✅ Instância deletada da Evolution API: ${deleteResponse.status}`);
            }
          } catch (deleteApiErr) {
            console.warn('⚠️ Erro ao deletar da Evolution API (continuando):', deleteApiErr);
          }
          
          // 3. Deletar do banco de dados
          try {
            const { error: deleteDbError } = await supabase
              .from('whatsapp_instances')
              .delete()
              .eq('instance_name', instance);
              
            if (!deleteDbError) {
              console.log('✅ Instância deletada do banco de dados');
              
              // Retornar imediatamente após deletar
              return new Response(
                JSON.stringify({ 
                  success: true, 
                  message: 'Instância desconectada e deletada automaticamente',
                  deleted: true
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
              );
            } else {
              console.error('❌ Erro ao deletar do banco:', deleteDbError);
            }
          } catch (deleteDbErr) {
            console.error('❌ Erro ao deletar do banco:', deleteDbErr);
          }
          
          break;
        case 'connecting':
          internalStatus = 'CONNECTING';
          console.log('⏳ Conectando...');
          break;
        default:
          console.log(`⚠️ Estado desconhecido: ${state}`);
          internalStatus = 'UNKNOWN';
      }

      console.log(`🔌 Atualizando status de ${instance} para ${internalStatus}`);

      const updateData: any = { status: internalStatus, updated_at: new Date().toISOString() };
      
      if (phoneNumber) updateData.phone_number = phoneNumber;
      if (connectedAt) updateData.connected_at = connectedAt;
      if (qrCode !== undefined) updateData.qr_code = qrCode;
      
      // CRÍTICO: Quando conectado, atualizar webhook_url para receber mensagens
      if (internalStatus === 'CONNECTED') {
        const messageWebhookUrl = `${supabaseUrl}/functions/v1/whatsapp-message-webhook`;
        updateData.webhook_url = messageWebhookUrl;
        console.log('✅ Atualizando webhook_url para:', messageWebhookUrl);
      }

      console.log('💾 Dados para atualizar:', JSON.stringify(updateData, null, 2));
      
      // CRÍTICO: Buscar o ID da instância antes de atualizar
      const { data: instanceData, error: fetchError } = await supabase
        .from('whatsapp_instances')
        .select('id, status, qr_code')
        .eq('instance_name', instance)
        .single();

      if (fetchError) {
        console.error('❌ Erro ao buscar instância:', fetchError);
        throw fetchError;
      }

      console.log('📊 Instância antes da atualização:', {
        id: instanceData.id,
        oldStatus: instanceData.status,
        hadQrCode: !!instanceData.qr_code,
        newStatus: internalStatus,
        willClearQrCode: qrCode === null
      });

      const { error: updateError } = await supabase
        .from('whatsapp_instances')
        .update(updateData)
        .eq('instance_name', instance);

      if (updateError) {
        console.error('❌ Erro ao atualizar status:', updateError);
        throw updateError;
      }

      console.log(`✅ Status atualizado com sucesso!`);
      console.log(`📢 REALTIME DEVE NOTIFICAR O FRONTEND AGORA`);
      console.log(`   - Instance ID: ${instanceData.id}`);
      console.log(`   - Old Status: ${instanceData.status} -> New Status: ${internalStatus}`);
      console.log(`   - QR Code cleared: ${qrCode === null}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Status atualizado', 
          status: internalStatus,
          instanceId: instanceData.id
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==================== EVENTO: MESSAGES.UPSERT ====================
    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT' || event === 'message.received') {
      console.log('💬 Processando mensagem recebida');

      const remoteJid = data?.key?.remoteJid;
      const fromMe = data?.key?.fromMe || false;
      const pushName = data?.pushName || 'Desconhecido';
      const messageContent = data?.message?.conversation 
        || data?.message?.extendedTextMessage?.text
        || data?.message?.imageMessage?.caption
        || '[Mensagem de mídia]';
      const messageTimestamp = data?.messageTimestamp 
        ? new Date(parseInt(data.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();
      const evolutionMessageId = data?.key?.id || null;

      // Ignorar mensagens de grupos e mensagens enviadas por nós
      if (!remoteJid || remoteJid.includes('@g.us') || fromMe) {
        console.log('⏭️ Mensagem ignorada (grupo ou enviada)');
        return new Response(
          JSON.stringify({ success: true, message: 'Mensagem ignorada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const phoneNumber = remoteJid.replace('@s.whatsapp.net', '');
      console.log(`📞 Mensagem de: ${phoneNumber}`);

      // Buscar a instância para pegar o organization_id do dono
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('user_id')
        .eq('instance_name', instance)
        .single();

      if (instanceError || !instanceData) {
        console.error('❌ Instância não encontrada:', instanceError);
        throw new Error('Instância não encontrada');
      }

      // Buscar organization_id do usuário
      const { data: orgData, error: orgError } = await supabase
        .rpc('get_user_organization_id', { _user_id: instanceData.user_id });

      if (orgError || !orgData) {
        console.error('❌ Organização não encontrada:', orgError);
        throw new Error('Organização não encontrada');
      }

      console.log(`🏢 Organization ID: ${orgData}`);

      // Buscar ou criar lead
      const { data: existingLead, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('telefone_lead', phoneNumber)
        .eq('organization_id', orgData)
        .single();

      let leadId: string;

      if (leadError || !existingLead) {
        console.log('➕ Criando novo lead');
        
        const { data: newLead, error: createError } = await supabase
          .from('leads')
          .insert({
            telefone_lead: phoneNumber,
            nome_lead: pushName,
            source: 'WhatsApp',
            last_message_at: messageTimestamp,
            stage: 'NOVO',
            organization_id: orgData,
          })
          .select()
          .single();

        if (createError) {
          console.error('❌ Erro ao criar lead:', createError);
          throw createError;
        }

        leadId = newLead.id;
        console.log(`✅ Lead criado: ${leadId}`);
      } else {
        leadId = existingLead.id;
        console.log(`✅ Lead existente: ${leadId}`);

        await supabase
          .from('leads')
          .update({ last_message_at: messageTimestamp, nome_lead: pushName })
          .eq('id', leadId);
      }

      // Salvar mensagem
      const { error: messageError } = await supabase
        .from('mensagens_chat')
        .insert({
          id_lead: leadId,
          direcao: 'ENTRADA',
          corpo_mensagem: messageContent,
          data_hora: messageTimestamp,
          evolution_message_id: evolutionMessageId,
          status_entrega: 'DELIVERED',
        });

      if (messageError) {
        console.error('❌ Erro ao salvar mensagem:', messageError);
        throw messageError;
      }

      console.log('✅ Mensagem salva com sucesso');

      return new Response(
        JSON.stringify({ success: true, message: 'Mensagem processada', leadId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Evento não processado
    console.log(`⚠️ Evento não processado: ${event}`);
    return new Response(
      JSON.stringify({ success: true, message: `Evento ${event} recebido` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('❌ Erro no webhook:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
