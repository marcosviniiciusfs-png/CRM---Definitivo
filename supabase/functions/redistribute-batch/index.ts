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

    const { batch_id, config_id, organization_id } = await req.json();

    if (!batch_id || !config_id || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'batch_id, config_id e organization_id são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-batch] Iniciando: batch=${batch_id}, config=${config_id}`);

    // 1. Validar lote
    const { data: batch, error: batchError } = await supabase
      .from('redistribution_batches')
      .select('*')
      .eq('id', batch_id)
      .eq('organization_id', organization_id)
      .single();

    if (batchError || !batch) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lote não encontrado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    if (batch.status !== 'completed') {
      return new Response(
        JSON.stringify({ success: false, error: 'Este lote já foi redistribuído' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 2. Buscar roleta escolhida
    const { data: config, error: configError } = await supabase
      .from('lead_distribution_configs')
      .select('*')
      .eq('id', config_id)
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ success: false, error: 'Roleta não encontrada ou inativa' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 3. Buscar leads do lote via histórico
    const { data: historyRecords, error: histError } = await supabase
      .from('lead_distribution_history')
      .select('lead_id, to_user_id')
      .eq('batch_id', batch_id);

    if (histError) throw histError;

    if (!historyRecords || historyRecords.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum lead encontrado neste lote' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Mapa: lead_id → to_user_id original (para verificar se ainda está com o mesmo colaborador)
    const originalAssignment = new Map(
      historyRecords.map((r: any) => [r.lead_id, r.to_user_id])
    );

    const leadIds = [...originalAssignment.keys()];

    // 4. Buscar leads atuais (excluindo won/lost)
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, responsavel_user_id, funnel_stage_id')
      .in('id', leadIds)
      .eq('organization_id', organization_id);

    if (leadsError) throw leadsError;

    // Filtrar: só leads que ainda estão com o mesmo colaborador
    const activeLeads = (leads || []).filter((lead: any) => {
      if (lead.responsavel_user_id !== originalAssignment.get(lead.id)) {
        return false;
      }
      return true;
    });

    if (activeLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum lead elegível para redistribuição neste lote' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Filtrar leads em won/lost stages
    const stageIds = [...new Set(activeLeads.map((l: any) => l.funnel_stage_id).filter(Boolean))];
    const wonLostStages = new Set<string>();

    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id')
        .in('id', stageIds)
        .in('stage_type', ['won', 'lost']);

      (stages || []).forEach((s: any) => wonLostStages.add(s.id));
    }

    const eligibleLeads = activeLeads.filter((l: any) => !wonLostStages.has(l.funnel_stage_id));

    if (eligibleLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Todos os leads estão em estágios ganho/perdido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 5. Buscar colaboradores da roleta escolhida (direto, sem regras de capacidade/horário)
    const eligibleAgentIds = config.eligible_agents as string[] | null;

    let agents: any[] = [];
    if (eligibleAgentIds && eligibleAgentIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', eligibleAgentIds);

      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, email')
        .in('user_id', eligibleAgentIds)
        .eq('organization_id', organization_id)
        .eq('is_active', true);

      const profilesMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));
      const membersMap = new Map((members || []).map((m: any) => [m.user_id, m]));

      agents = (eligibleAgentIds || [])
        .filter(id => membersMap.has(id))
        .map(id => ({
          user_id: id,
          full_name: profilesMap.get(id)?.full_name,
          email: membersMap.get(id)?.email,
        }));
    }

    if (agents.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum colaborador encontrado na roleta selecionada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 6. Criar novo lote de redistribuição
    const { data: newBatch, error: newBatchError } = await supabase
      .from('redistribution_batches')
      .insert({
        organization_id,
        config_id,
        created_by: null,
        batch_type: 'redistribution',
        total_leads: 0,
        status: 'completed',
      })
      .select('id')
      .single();

    if (newBatchError) {
      console.error('Erro ao criar novo lote:', newBatchError);
    }

    const newBatchId = newBatch?.id || null;

    // 7. Distribuir leads em round-robin direto
    let agentIndex = 0;
    const updates: Array<{ leadId: string; agentId: string }> = [];
    const newHistoryRecords: any[] = [];

    for (const lead of eligibleLeads) {
      const agent = agents[agentIndex];
      agentIndex = (agentIndex + 1) % agents.length;

      updates.push({ leadId: lead.id, agentId: agent.user_id });

      newHistoryRecords.push({
        lead_id: lead.id,
        organization_id,
        config_id,
        batch_id: newBatchId,
        from_user_id: originalAssignment.get(lead.id),
        to_user_id: agent.user_id,
        distribution_method: config.distribution_method,
        trigger_source: 'manual',
        is_redistribution: true,
        redistribution_reason: `Re-distribuição do lote ${batch_id}`,
      });
    }

    // 8. Batch update leads (por agente para eficiência)
    const agentLeadMap = new Map<string, string[]>();
    for (const u of updates) {
      if (!agentLeadMap.has(u.agentId)) agentLeadMap.set(u.agentId, []);
      agentLeadMap.get(u.agentId)!.push(u.leadId);
    }

    const agentNameMap = new Map(agents.map(a => [a.user_id, a.full_name || a.email]));

    let redistributedCount = 0;
    for (const [agentId, leadIds] of agentLeadMap) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          responsavel_user_id: agentId,
          responsavel: agentNameMap.get(agentId),
        })
        .in('id', leadIds);

      if (updateError) {
        console.error(`Erro ao atualizar leads:`, updateError);
        continue;
      }

      redistributedCount += leadIds.length;
    }

    // 9. Inserir histórico
    if (newHistoryRecords.length > 0) {
      const { error: histInsertError } = await supabase
        .from('lead_distribution_history')
        .insert(newHistoryRecords);

      if (histInsertError) {
        console.error('Erro ao inserir histórico:', histInsertError);
      }
    }

    // 10. Marcar lote original como redistributed
    await supabase
      .from('redistribution_batches')
      .update({ status: 'redistributed' })
      .eq('id', batch_id);

    // 11. Atualizar total_leads do novo lote
    if (newBatchId && redistributedCount > 0) {
      await supabase
        .from('redistribution_batches')
        .update({ total_leads: redistributedCount })
        .eq('id', newBatchId);
    }

    console.log(`✅ [redistribute-batch] ${redistributedCount}/${eligibleLeads.length} leads redistribuídos`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: redistributedCount,
        total_eligible: eligibleLeads.length,
        new_batch_id: newBatchId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em redistribute-batch:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
