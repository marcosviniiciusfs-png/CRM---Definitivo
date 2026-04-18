import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin } from "../_shared/evolution-config.ts";

interface FetchPresenceRequest {
  instance_name: string;
  phone_number: string;
  lead_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 });
  }

  try {
    const { instance_name, phone_number, lead_id } = await req.json() as FetchPresenceRequest;

    console.log('👀 Buscando status de presença:', { instance_name, phone_number, lead_id });

    // Validar entrada
    if (!instance_name || !phone_number || !lead_id) {
      throw new Error('instance_name, phone_number e lead_id são obrigatórios');
    }

    // Obter configurações
    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    // Formatar número no formato esperado pela Evolution API (com @s.whatsapp.net)
    const formattedNumber = phone_number.includes('@')
      ? phone_number
      : `${phone_number.replace(/\D/g, '')}@s.whatsapp.net`;

    console.log('📞 Número formatado:', formattedNumber);

    // Em vez de chamar a Evolution API (que está retornando rate limit / erro),
    // calculamos o status de presença localmente usando os dados do lead
    console.log('⚙️ Calculando presença localmente a partir de last_message_at/updated_at');

    const supabase = createSupabaseAdmin();

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('last_message_at, updated_at')
      .eq('id', lead_id)
      .maybeSingle();

    if (leadError) {
      console.error('❌ Erro ao buscar lead para cálculo de presença:', leadError);
      throw leadError;
    }

    console.log('📄 Dados do lead para presença:', lead);

    // Também buscamos a última mensagem RECEBIDA (ENTRADA) para esse lead,
    // assim o status de online depende da atividade do lead e não do usuário do CRM
    const { data: lastMessage, error: lastMessageError } = await supabase
      .from('mensagens_chat')
      .select('data_hora, direcao')
      .eq('id_lead', lead_id)
      .eq('direcao', 'ENTRADA')
      .order('data_hora', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastMessageError) {
      console.error('⚠️ Erro ao buscar última mensagem do lead (ignorando e seguindo com cálculo):', lastMessageError);
    }

    console.log('💬 Última mensagem ENTRADA encontrada para presença:', lastMessage);

    // Regras simples de presença baseadas em atividade recente (lead ou mensagens)
    // - Se última atividade (mensagem ou atualização do lead) foi há <= 5 minutos: available (online)
    // - Senão: unavailable (offline) e last_seen = data da última atividade
    let isOnline = false;
    let lastSeen: string | null = null;
    let statusText: string | null = null;

    const activityCandidates: (string | null | undefined)[] = [
      lead?.last_message_at as string | null | undefined,
      lead?.updated_at as string | null | undefined,
      (lastMessage?.data_hora as string | null | undefined) ?? null,
    ];

    const validActivities = activityCandidates
      .filter((v): v is string => Boolean(v))
      .map((v) => new Date(v as string))
      .filter((d) => !isNaN(d.getTime()));

    if (validActivities.length > 0) {
      // Pega a atividade mais recente entre lead e mensagens
      const lastActivity = new Date(Math.max(...validActivities.map((d) => d.getTime())));
      const diffMs = Date.now() - lastActivity.getTime();
      const diffMinutes = diffMs / 60000;

      // Lead é considerado online se teve atividade nos últimos 10 minutos
      if (diffMinutes <= 10) {
        isOnline = true;
        statusText = 'available';
        lastSeen = null; // online agora
      } else {
        isOnline = false;
        statusText = 'unavailable';
        lastSeen = lastActivity.toISOString();
      }

      console.log('📊 Status calculado localmente:', {
        isOnline,
        lastSeen,
        statusText,
        diffMinutes: diffMinutes.toFixed(2),
        lastActivityDate: lastActivity.toISOString(),
        now: new Date().toISOString()
      });
    } else {
      console.log('⚠️ Lead sem atividade registrada, marcando como unavailable');
      isOnline = false;
      statusText = 'unavailable';
      lastSeen = null;
    }

    // Atualizar status no banco de dados (mantemos apenas os campos já existentes)
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
