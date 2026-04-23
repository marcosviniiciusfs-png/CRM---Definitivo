import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BATCH_SIZE = 200;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organization_id, config_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-lost] Iniciando para org: ${organization_id}`);

    // 1. Buscar leads na etapa "Perdido" (lost)
    const { data: lostLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, source, funnel_id, funnel_stage_id')
      .eq('organization_id', organization_id)
      .not('funnel_stage_id', 'is', null)
      .limit(BATCH_SIZE);

    if (leadsError) throw leadsError;

    // Filtrar apenas leads cujo estágio seja do tipo "lost"
    const stageIds = [...new Set((lostLeads || []).map(l => l.funnel_stage_id))];
    const lostStageIds = new Set<string>();

    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id')
        .in('id', stageIds)
        .eq('stage_type', 'lost');
      (stages || []).forEach(s => lostStageIds.add(s.id));
    }

    const filteredLeads = (lostLeads || []).filter(l => lostStageIds.has(l.funnel_stage_id));

    // Contar total real
    const { count: totalCount, error: countError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organization_id)
      .not('funnel_stage_id', 'is', null);

    if (countError) throw countError;

    if (filteredLeads.length === 0) {
      return new Response(
        JSON.stringify({ success: true, redistributed_count: 0, total: 0, has_more: false, message: 'Nenhum lead na etapa Perdido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 ${filteredLeads.length} leads na etapa Perdido`);

    // 2. Buscar roletas ativas
    const { data: configs, error: configsError } = await supabase
      .from('lead_distribution_configs')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    if (configsError) throw configsError;

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Nenhuma roleta ativa encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar agentes disponíveis
    const agentsByConfig = new Map<string, any[]>();
    for (const config of configs) {
      const eligibleIds = config.eligible_agents as string[] | null;
      let agents = await getAvailableAgentsFast(supabase, organization_id, eligibleIds, config.team_id);
      agentsByConfig.set(config.id, agents);
    }

    // 4. Buscar estágios iniciais dos funis
    const funnelIds = [...new Set(configs.filter(c => c.funnel_id).map(c => c.funnel_id))];
    const firstStages = new Map<string, string>();

    if (funnelIds.length > 0) {
      const { data: stages } = await supabase
        .from('funnel_stages')
        .select('id, funnel_id, position')
        .in('funnel_id', funnelIds)
        .not('stage_type', 'in', '("won","lost")')
        .order('position', { ascending: true });

      if (stages) {
        for (const s of stages) {
          if (!firstStages.has(s.funnel_id)) {
            firstStages.set(s.funnel_id, s.id);
          }
        }
      }
    }

    // 5. Buscar último agente por config (para round-robin contínuo)
    const lastAgentByConfig = new Map<string, string>();
    for (const config of configs) {
      const { data: lastHistory } = await supabase
        .from('lead_distribution_history')
        .select('to_user_id')
        .eq('organization_id', organization_id)
        .eq('config_id', config.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastHistory) {
        lastAgentByConfig.set(config.id, lastHistory.to_user_id);
      }
    }

    // 6. Distribuir leads
    let redistributedCount = 0;
    const errors: string[] = [];
    const historyRecords: any[] = [];
    const leadsByConfig = new Map<string, { leads: any[], agents: any[], agentIndex: number }>();

    const effectiveConfig = config_id
      ? configs.find(c => c.id === config_id) || null
      : null;

    const fallbackConfig = configs.find(c => c.source_type === 'all' && !c.funnel_id)
      || configs.find(c => agentsByConfig.get(c.id)?.length > 0)
      || null;

    let skippedCount = 0;

    for (const lead of filteredLeads) {
      const config = effectiveConfig || findBestConfig(configs, lead) || fallbackConfig;
      if (!config) {
        skippedCount++;
        continue;
      }

      let agents = agentsByConfig.get(config.id);
      if (!agents || agents.length === 0) {
        skippedCount++;
        continue;
      }

      let group = leadsByConfig.get(config.id);
      if (!group) {
        const lastAgentId = lastAgentByConfig.get(config.id);
        let startIndex = 0;
        if (lastAgentId) {
          const idx = agents.findIndex(a => a.user_id === lastAgentId);
          if (idx !== -1) {
            startIndex = (idx + 1) % agents.length;
          }
        }
        group = { leads: [], agents, agentIndex: startIndex };
        leadsByConfig.set(config.id, group);
      }

      const selectedAgent = group.agents[group.agentIndex];
      group.agentIndex = (group.agentIndex + 1) % group.agents.length;
      group.leads.push({ ...lead, agent: selectedAgent, config });
    }

    // 7. Batch update leads
    for (const [configId, group] of leadsByConfig) {
      const config = group.leads[0]?.config;
      if (!config || group.leads.length === 0) continue;

      const agentLeadMap = new Map<string, any[]>();
      for (const item of group.leads) {
        if (!agentLeadMap.has(item.agent.user_id)) {
          agentLeadMap.set(item.agent.user_id, []);
        }
        agentLeadMap.get(item.agent.user_id)!.push(item);
      }

      for (const [agentId, items] of agentLeadMap) {
        const agent = items[0].agent;
        const leadIds = items.map(i => i.id);

        const update: Record<string, any> = {
          responsavel_user_id: agentId,
          responsavel: agent.full_name || agent.email,
        };

        // Mover para o primeiro estágio do funil da roleta
        if (config.funnel_id) {
          update.funnel_id = config.funnel_id;
          const stageId = config.funnel_stage_id || firstStages.get(config.funnel_id);
          if (stageId) {
            update.funnel_stage_id = stageId;
          }
        } else if (items[0]?.funnel_id) {
          // Se o lead tem funil, resetar para o primeiro estágio do mesmo funil
          const firstStage = firstStages.get(items[0].funnel_id);
          if (firstStage) {
            update.funnel_stage_id = firstStage;
          }
        }

        const { error: updateError } = await supabase
          .from('leads')
          .update(update)
          .in('id', leadIds);

        if (updateError) {
          console.error(`❌ Erro batch update (${leadIds.length} leads):`, updateError);
          errors.push(`Batch update failed: ${updateError.message}`);
          continue;
        }

        redistributedCount += leadIds.length;

        for (const item of items) {
          historyRecords.push({
            lead_id: item.id,
            organization_id,
            config_id: configId,
            to_user_id: agentId,
            distribution_method: config.distribution_method,
            trigger_source: 'lost_redistribution',
            is_redistribution: true,
          });
        }
      }
    }

    // 8. Batch insert histórico
    if (historyRecords.length > 0) {
      const { error: histError } = await supabase
        .from('lead_distribution_history')
        .insert(historyRecords);

      if (histError) {
        console.error('❌ Erro ao salvar histórico:', histError);
      }
    }

    const hasMore = filteredLeads.length >= BATCH_SIZE;

    console.log(`✅ [redistribute-lost] ${redistributedCount} leads redistribuídos (skipped: ${skippedCount})`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: redistributedCount,
        total: filteredLeads.length,
        processed: redistributedCount,
        skipped: skippedCount,
        has_more: hasMore,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em redistribute-lost-leads:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

function findBestConfig(configs: any[], lead: any): any | null {
  const leadSource = lead.source?.toLowerCase() || '';
  let sourceType = 'all';
  if (leadSource.includes('whatsapp')) sourceType = 'whatsapp';
  else if (leadSource.includes('facebook')) sourceType = 'facebook';
  else if (leadSource.includes('webhook') || leadSource.includes('formulário')) sourceType = 'webhook';

  const funnelId = lead.funnel_id || null;

  if (funnelId) {
    const c = configs.find(c => c.source_type === sourceType && c.funnel_id === funnelId);
    if (c) return c;
  }
  const c2 = configs.find(c => c.source_type === sourceType && !c.funnel_id);
  if (c2) return c2;
  if (funnelId) {
    const c3 = configs.find(c => c.source_type === 'all' && c.funnel_id === funnelId);
    if (c3) return c3;
  }
  const c4 = configs.find(c => c.source_type === 'all' && !c.funnel_id);
  return c4 || null;
}

async function getAvailableAgentsFast(supabase: any, organization_id: string, eligibleAgentIds?: string[] | null, team_id?: string | null): Promise<any[]> {
  let settingsQuery = supabase
    .from('agent_distribution_settings')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('is_paused', false)
    .order('user_id', { ascending: true });

  let effectiveIds = eligibleAgentIds;

  if (team_id) {
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', team_id);

    if (teamMembers && teamMembers.length > 0) {
      const teamIds = teamMembers.map((tm: any) => tm.user_id);
      if (effectiveIds && effectiveIds.length > 0) {
        effectiveIds = effectiveIds.filter(id => teamIds.includes(id));
      } else {
        effectiveIds = teamIds;
      }
    } else {
      return [];
    }
  }

  if (effectiveIds && effectiveIds.length > 0) {
    settingsQuery = settingsQuery.in('user_id', effectiveIds);
  }

  let { data: settings } = await settingsQuery;

  if (!settings || settings.length === 0) {
    let membersQuery = supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .order('user_id', { ascending: true });

    if (effectiveIds && effectiveIds.length > 0) {
      membersQuery = membersQuery.in('user_id', effectiveIds);
    }

    const { data: orgMembers } = await membersQuery;
    if (!orgMembers || orgMembers.length === 0) return [];

    settings = orgMembers.map((m: any) => ({
      user_id: m.user_id,
      organization_id,
      is_active: true,
      is_paused: false,
      max_capacity: 999,
      priority_weight: 1,
      capacity_enabled: false,
      pause_until: null,
      working_hours: null,
    }));
  }

  const userIds = settings.map((s: any) => s.user_id);
  const [profilesResult, membersResult] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
    supabase.from('organization_members').select('user_id, email').in('user_id', userIds).eq('organization_id', organization_id),
  ]);

  const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.user_id, p]));
  const membersMap = new Map((membersResult.data || []).map((m: any) => [m.user_id, m]));

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5);

  const available = [];
  for (const agent of settings) {
    if (agent.pause_until && new Date(agent.pause_until) > now) continue;

    const workingHours = agent.working_hours as any;
    if (workingHours && workingHours[currentDay]) {
      const { start, end } = workingHours[currentDay];
      if (currentTime < start || currentTime > end) continue;
    }

    available.push({
      user_id: agent.user_id,
      full_name: profilesMap.get(agent.user_id)?.full_name,
      email: membersMap.get(agent.user_id)?.email,
      priority_weight: agent.priority_weight,
      current_load: 0,
      max_capacity: 0,
    });
  }

  return available;
}
