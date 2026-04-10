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

    const { collaborator_user_id, config_id, organization_id } = await req.json();

    if (!collaborator_user_id || !config_id || !organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'collaborator_user_id, config_id e organization_id são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-collaborator] Iniciando: collaborator=${collaborator_user_id}, config=${config_id}`);

    // 1. Buscar roleta escolhida
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

    // 2. Buscar todos os leads ativos do colaborador (excluindo won/lost)
    const { data: allLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, funnel_stage_id')
      .eq('organization_id', organization_id)
      .eq('responsavel_user_id', collaborator_user_id);

    if (leadsError) throw leadsError;

    if (!allLeads || allLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum lead encontrado para este colaborador' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Filtrar leads em won/lost stages
    const stageIds = [...new Set(allLeads.map((l: any) => l.funnel_stage_id).filter(Boolean))];
    const wonLostStages = new Set<string>();

    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id')
        .in('id', stageIds)
        .in('stage_type', ['won', 'lost']);

      (stages || []).forEach((s: any) => wonLostStages.add(s.id));
    }

    const eligibleLeads = allLeads.filter((l: any) => !wonLostStages.has(l.funnel_stage_id));

    if (eligibleLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Todos os leads estão em estágios ganho/perdido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 3. Buscar colaboradores da roleta escolhida (direto, sem regras)
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
        .filter(id => membersMap.has(id) && id !== collaborator_user_id) // Excluir colaborador original
        .map(id => ({
          user_id: id,
          full_name: profilesMap.get(id)?.full_name,
          email: membersMap.get(id)?.email,
        }));
    }

    if (agents.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhum colaborador disponível na roleta (excluindo o colaborador original)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 4. Criar lote de redistribuição
    const { data: batchRecord, error: batchError } = await supabase
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

    const batchId = batchRecord?.id || null;

    if (batchError) {
      console.error('Erro ao criar lote:', batchError);
    }

    // 5. Distribuir leads em round-robin direto
    let agentIndex = 0;
    const updates: Array<{ leadId: string; agentId: string }> = [];
    const historyRecords: any[] = [];

    for (const lead of eligibleLeads) {
      const agent = agents[agentIndex];
      agentIndex = (agentIndex + 1) % agents.length;

      updates.push({ leadId: lead.id, agentId: agent.user_id });

      historyRecords.push({
        lead_id: lead.id,
        organization_id,
        config_id,
        batch_id: batchId,
        from_user_id: collaborator_user_id,
        to_user_id: agent.user_id,
        distribution_method: config.distribution_method,
        trigger_source: 'manual',
        is_redistribution: true,
        redistribution_reason: `Redistribuição de leads do colaborador ${collaborator_user_id}`,
      });
    }

    // 6. Batch update leads (por agente para eficiência)
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

    // 7. Inserir histórico
    if (historyRecords.length > 0) {
      const { error: histInsertError } = await supabase
        .from('lead_distribution_history')
        .insert(historyRecords);

      if (histInsertError) {
        console.error('Erro ao inserir histórico:', histInsertError);
      }
    }

    // 8. Atualizar total_leads do lote
    if (batchId && redistributedCount > 0) {
      await supabase
        .from('redistribution_batches')
        .update({ total_leads: redistributedCount })
        .eq('id', batchId);
    }

    console.log(`✅ [redistribute-collaborator] ${redistributedCount}/${eligibleLeads.length} leads redistribuídos`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: redistributedCount,
        total_eligible: eligibleLeads.length,
        batch_id: batchId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em redistribute-collaborator-leads:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
