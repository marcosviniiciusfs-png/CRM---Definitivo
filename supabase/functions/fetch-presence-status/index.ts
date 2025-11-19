import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchPresenceRequest {
  instance_name: string;
  phone_number: string;
  lead_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name, phone_number, lead_id } = await req.json() as FetchPresenceRequest;

    console.log('👀 Buscando status de presença:', { instance_name, phone_number, lead_id });

    // Validar entrada
    if (!instance_name || !phone_number || !lead_id) {
      throw new Error('instance_name, phone_number e lead_id são obrigatórios');
    }

    // Obter configurações
    let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log('⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.');
      evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
    }

    if (!evolutionApiKey) {
      throw new Error('EVOLUTION_API_KEY não configurada');
    }

    // Formatar número no formato esperado pela Evolution API (com @s.whatsapp.net)
    const formattedNumber = phone_number.includes('@') 
      ? phone_number 
      : `${phone_number.replace(/\D/g, '')}@s.whatsapp.net`;
 
    console.log('📞 Número formatado:', formattedNumber);

    // Chamar Evolution API para buscar status de presença usando whatsappNumbers
    const presenceUrl = `${evolutionApiUrl}/chat/whatsappNumbers/${instance_name}`;
    console.log('🔗 URL da Evolution API (whatsappNumbers):', presenceUrl);

    const response = await fetch(presenceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        numbers: [formattedNumber],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // Se for erro 400 (geralmente rate limit 429), retorna sucesso sem atualizar
      if (response.status === 400 || response.status === 404) {
        console.log('⚠️ Erro esperado da Evolution API (rate limit ou número não encontrado) - ignorando requisição');
        return new Response(
          JSON.stringify({
            success: true,
            is_online: false,
            last_seen: null,
            rate_limited: true,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.error('❌ Erro na Evolution API (fetchPresence):', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
      });
      throw new Error(`Evolution API retornou ${response.status}: ${errorText}`);
    }

    const presenceData = await response.json();
    console.log('✅ Resposta completa da Evolution API:', JSON.stringify(presenceData, null, 2));

    // Extrair informações de presença
    let isOnline = false;
    let lastSeen: any = null;
    let statusText: string | null = null;

    // A Evolution API está retornando um array, onde o status do lead
    // vem em presenceData[0].status (por exemplo: "available", "typing", etc.)
    if (Array.isArray(presenceData) && presenceData[0]) {
      const contactData = presenceData[0] as any;
      console.log('📱 Dados brutos de presença:', contactData);

      // Boolean simplificado para retrocompatibilidade
      isOnline = Boolean(
        contactData.isOnline ||
        contactData.online ||
        contactData.is_online ||
        contactData.status === 'available' ||
        contactData.status === 'online'
      );

      // Last seen em formatos diferentes
      lastSeen = contactData.lastSeen || contactData.last_seen || null;

      // Status textual usado pelo frontend para mapear as cores
      statusText =
        contactData.status ||
        contactData.presence ||
        contactData.state ||
        contactData.onlineStatus ||
        null;
    }

    console.log('📊 Status extraído:', { isOnline, lastSeen, statusText });

    // Atualizar status no banco de dados (mantemos apenas os campos já existentes)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updateData: any = {
      is_online: isOnline,
      updated_at: new Date().toISOString(),
    };

    if (lastSeen) {
      const lastSeenDate = typeof lastSeen === 'number'
        ? new Date(lastSeen * 1000).toISOString()
        : new Date(lastSeen).toISOString();

      updateData.last_seen = lastSeenDate;
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(updateData)
      .eq('id', lead_id);

    if (updateError) {
      console.error('❌ Erro ao atualizar status no banco:', updateError);
      throw updateError;
    }

    console.log('✅ Status de presença atualizado com sucesso no banco de dados');

    return new Response(
      JSON.stringify({
        success: true,
        is_online: isOnline,
        last_seen: lastSeen,
        status: statusText,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao buscar status de presença:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
