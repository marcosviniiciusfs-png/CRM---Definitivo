import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    console.log(`🔔 [send-scheduled-reminders] Verificando lembretes pendentes em: ${now}`);

    // Buscar todas as activities de agendamento que tenham lembrete pendente
    const { data: activities, error } = await supabase
      .from('lead_activities')
      .select('id, lead_id, user_id, activity_type, content')
      .in('activity_type', ['Agendamento Reunião', 'Agendamento Venda']);

    if (error) throw error;
    if (!activities || activities.length === 0) {
      console.log('✅ Nenhum agendamento encontrado');
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filtrar os que têm lembrete_at <= now e lembrete_sent != "true"
    const pending = activities.filter(act => {
      try {
        const c = JSON.parse(act.content);
        if (!c.lembrete_at || c.lembrete_sent === 'true') return false;
        return new Date(c.lembrete_at) <= new Date(now);
      } catch {
        return false;
      }
    });

    console.log(`📋 ${pending.length} lembrete(s) para enviar`);

    let sent = 0;

    for (const act of pending) {
      try {
        const content = JSON.parse(act.content);
        const { telefone, data: agendData, hora, observacoes, valor } = content;
        const tipoLabel = act.activity_type === 'Agendamento Reunião' ? 'Reunião' : 'Venda';

        if (!telefone) {
          console.warn(`⚠️ Activity ${act.id} sem telefone — pulando`);
          continue;
        }

        // Buscar instância WhatsApp conectada do usuário
        const { data: instance } = await supabase
          .from('whatsapp_instances')
          .select('instance_name')
          .eq('user_id', act.user_id)
          .eq('status', 'CONNECTED')
          .maybeSingle();

        if (!instance?.instance_name) {
          console.warn(`⚠️ Nenhuma instância conectada para user ${act.user_id}`);
          continue;
        }

        // Montar mensagem de lembrete
        const dataFormatted = agendData
          ? new Date(`${agendData}T${hora || '00:00'}`).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            })
          : '';

        let msg = `🗓️ *Lembrete de Agendamento — ${tipoLabel}*\n\n`;
        if (dataFormatted) msg += `📅 Data: ${dataFormatted}\n⏰ Horário: ${hora || ''}\n`;
        if (observacoes) msg += `📝 Obs: ${observacoes}\n`;
        if (valor) msg += `💰 Valor: R$ ${parseFloat(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n`;

        // Buscar o lead para incluir o nome
        const { data: leadData } = await supabase
          .from('leads')
          .select('nome_lead')
          .eq('id', act.lead_id)
          .maybeSingle();

        if (leadData?.nome_lead) msg += `\n👤 Lead: ${leadData.nome_lead}`;

        // Enviar mensagem via Evolution API
        let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || 'http://161.97.148.99:8080';
        evolutionApiUrl = evolutionApiUrl.replace(/\/manager\/?$/, '').replace(/\/$/, '');
        const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')!;

        const cleanNumber = telefone.replace(/\D/g, '');
        const remoteJid = `${cleanNumber}@s.whatsapp.net`;

        const sendResp = await fetch(`${evolutionApiUrl}/message/sendText/${instance.instance_name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            number: remoteJid,
            text: msg,
          }),
        });

        if (!sendResp.ok) {
          const errText = await sendResp.text();
          console.error(`❌ Falha ao enviar para ${telefone}: ${errText}`);
          continue;
        }

        console.log(`✅ Lembrete enviado para ${telefone} (activity ${act.id})`);

        // Marcar como enviado atualizando o content JSON
        const updatedContent = { ...content, lembrete_sent: 'true' };
        await supabase
          .from('lead_activities')
          .update({ content: JSON.stringify(updatedContent) })
          .eq('id', act.id);

        sent++;
      } catch (actErr) {
        console.error(`❌ Erro ao processar activity ${act.id}:`, actErr);
      }
    }

    console.log(`✅ [send-scheduled-reminders] ${sent}/${pending.length} lembretes enviados`);

    return new Response(
      JSON.stringify({ success: true, sent, pending: pending.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em send-scheduled-reminders:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
