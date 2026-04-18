import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DistributeLeadRequest {
  lead_id: string;
  organization_id: string;
  trigger_source: 'new_lead' | 'whatsapp' | 'facebook' | 'webhook' | 'manual' | 'auto_redistribution';
  is_redistribution?: boolean;
  from_user_id?: string;
  /** Token do formulário/webhook de origem (para roletas específicas por formulário) */
  webhook_token?: string;
}

// ── Smart Rules Types & Helpers ────────────────────────────────

interface SystemRules {
  reroute_same_agent: boolean;
  work_hours_enabled: boolean;
  work_hours_start: string;
  work_hours_end: string;
  hot_lead_enabled: boolean;
  hot_lead_score: number;
  auto_redistribute_timeout: number;
}

interface CustomRule {
  id: string;
  name: string;
  condition_field: "source" | "score_min" | "score_max" | "funnel";
  condition_operator: "equals" | "not_equals" | "greater" | "less";
  condition_value: string;
  action: "assign_to" | "skip";
  agent_id: string;
  enabled: boolean;
}

interface SmartRulesData {
  system: SystemRules;
  custom: CustomRule[];
}

function parseSmartRules(raw: any): SmartRulesData {
  const DEFAULT_SYSTEM: SystemRules = {
    reroute_same_agent: false,
    work_hours_enabled: false,
    work_hours_start: "08:00",
    work_hours_end: "18:00",
    hot_lead_enabled: false,
    hot_lead_score: 70,
    auto_redistribute_timeout: 60,
  };

  if (!raw) return { system: DEFAULT_SYSTEM, custom: [] };
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!parsed || typeof parsed !== "object") return { system: DEFAULT_SYSTEM, custom: [] };

  return {
    system: { ...DEFAULT_SYSTEM, ...(parsed.system || {}) },
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
  };
}

function getCustomRuleFieldValue(field: string, lead: any): any {
  switch (field) {
    case "source": return lead.source || "";
    case "score_min": return lead.lead_score || 0;
    case "score_max": return lead.lead_score || 0;
    case "funnel": return lead.funnel_id || "";
    default: return "";
  }
}

function evaluateCustomCondition(value: any, operator: string, conditionValue: string): boolean {
  const strVal = String(value);
  switch (operator) {
    case "equals": return strVal === conditionValue;
    case "not_equals": return strVal !== conditionValue;
    case "greater": return Number(value) > Number(conditionValue);
    case "less": return Number(value) < Number(conditionValue);
    default: return false;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { lead_id, organization_id, trigger_source, is_redistribution, from_user_id, webhook_token } = await req.json() as DistributeLeadRequest;

    console.log('Distributing lead:', { lead_id, organization_id, trigger_source });

    // 1. Buscar lead para identificar o source e o funil atual
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('source, funnel_id, telefone_lead, email, nome_lead, lead_score')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      console.log('Lead not found');
      return new Response(
        JSON.stringify({ success: false, message: 'Lead not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // Calculate lead score if not already set
    if (!lead.lead_score || lead.lead_score === 0) {
      const score = calculateLeadScore({
        telefone_lead: lead.telefone_lead,
        email: lead.email,
        source: lead.source,
        nome_lead: lead.nome_lead,
      });
      await supabase.from('leads').update({ lead_score: score }).eq('id', lead_id);
      console.log(`Calculated lead_score: ${score}`);
    }

    // 2. Buscar configuração da roleta usando hierarquia de especificidade:
    //    (source_type + funnel_id) → (source_type sem funil) → (all + funnel_id) → (all genérico)
    const leadSource = lead.source?.toLowerCase() || '';
    const leadFunnelId: string | null = lead.funnel_id || null;
    let sourceType = 'all';
    
    if (leadSource.includes('whatsapp')) {
      sourceType = 'whatsapp';
    } else if (leadSource.includes('facebook')) {
      sourceType = 'facebook';
    } else if (leadSource.includes('webhook') || leadSource.includes('formulário')) {
      sourceType = 'webhook';
    }

    console.log(`Lead source: "${lead.source}" → sourceType: "${sourceType}", funnel_id: ${leadFunnelId || 'none'}`);

    let config: any = null;

    // ── Hierarquia de busca de roleta (mais específica → mais genérica) ──
    // A roleta mais específica ganha. Prioridades:
    //   P1: webhook_token exato + funil
    //   P2: webhook_token exato (sem funil)
    //   P3: source_type + funil
    //   P4: source_type sem funil
    //   P5: "all" + funil
    //   P6: "all" genérica

    const candidateQueries: Array<{ label: string; promise: Promise<{ data: any }> }> = [];

    // P1 & P2: Roleta específica pelo token do webhook (source_identifiers contém o token)
    if (webhook_token && sourceType === 'webhook') {
      // Buscar todas as configs de webhook ativas da org
      const { data: webhookConfigs } = await supabase
        .from('lead_distribution_configs')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('source_type', 'webhook')
        .eq('is_active', true);

      const matchingByToken = (webhookConfigs || []).filter((c: any) => {
        const ids: string[] = Array.isArray(c.source_identifiers) ? c.source_identifiers : [];
        return ids.includes(webhook_token);
      });

      console.log(`Configs webhook com token "${webhook_token}": ${matchingByToken.length}`);

      // P1: token + funil específico
      if (leadFunnelId) {
        const withFunnel = matchingByToken.find((c: any) => c.funnel_id === leadFunnelId);
        if (withFunnel) {
          config = withFunnel;
          console.log(`Roleta encontrada na prioridade 1 (token + funil): "${config.name}"`);
        }
      }

      // P2: token sem funil
      if (!config) {
        const withoutFunnel = matchingByToken.find((c: any) => !c.funnel_id);
        if (withoutFunnel) {
          config = withoutFunnel;
          console.log(`Roleta encontrada na prioridade 2 (token + sem funil): "${config.name}"`);
        }
      }
    }

    // P3–P6: Busca genérica por source_type / funil (sem token)
    if (!config) {
      const genericCandidates = await Promise.all([
        // P3: source específico + funil específico
        leadFunnelId
          ? supabase
              .from('lead_distribution_configs')
              .select('*')
              .eq('organization_id', organization_id)
              .eq('source_type', sourceType)
              .eq('funnel_id', leadFunnelId)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null }),

        // P4: source específico sem funil
        supabase
          .from('lead_distribution_configs')
          .select('*')
          .eq('organization_id', organization_id)
          .eq('source_type', sourceType)
          .is('funnel_id', null)
          .eq('is_active', true)
          .maybeSingle(),

        // P5: source "all" + funil específico
        leadFunnelId
          ? supabase
              .from('lead_distribution_configs')
              .select('*')
              .eq('organization_id', organization_id)
              .eq('source_type', 'all')
              .eq('funnel_id', leadFunnelId)
              .eq('is_active', true)
              .maybeSingle()
          : Promise.resolve({ data: null }),

        // P6: source "all" sem funil (roleta genérica)
        supabase
          .from('lead_distribution_configs')
          .select('*')
          .eq('organization_id', organization_id)
          .eq('source_type', 'all')
          .is('funnel_id', null)
          .eq('is_active', true)
          .maybeSingle(),
      ]);

      const genericLabels = [
        `source="${sourceType}" + funnel_id="${leadFunnelId}"`,
        `source="${sourceType}" + sem funil`,
        `source="all" + funnel_id="${leadFunnelId}"`,
        `source="all" + sem funil (genérica)`,
      ];

      for (let i = 0; i < genericCandidates.length; i++) {
        const candidate = genericCandidates[i].data;
        if (candidate) {
          config = candidate;
          console.log(`Roleta encontrada na prioridade ${i + 3}: ${genericLabels[i]} → "${config.name}"`);
          break;
        }
        console.log(`Prioridade ${i + 3} sem resultado: ${genericLabels[i]}`);
      }
    }

    if (config) {
      console.log(`Using config: "${config.name}" (${config.distribution_method}), team_id: ${config.team_id || 'none'}`);
    }

    if (!config) {
      console.log('No active distribution config found for source:', sourceType);
      return new Response(
        JSON.stringify({ success: false, message: 'Distribution not configured or not active' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2.5. Evaluate filter_rules against lead
    const filterRules = config.filter_rules as any;
    if (filterRules?.conditions?.length > 0) {
      const passesFilter = evaluateFilterRules(filterRules, lead);
      if (!passesFilter) {
        console.log(`Lead does not pass filter rules for config "${config.name}", skipping`);
        return new Response(
          JSON.stringify({ success: false, message: 'Lead filtered out by distribution rules' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`Lead passes filter rules for config "${config.name}"`);
    }

    // 2.6. Execute smart rules (custom rules, hot lead, reroute, work hours)
    const smartRules = parseSmartRules(config.smart_rules);
    const leadScore = lead.lead_score || 0;

    // ── Custom Rules ──
    let forcedAgentId: string | null = null;
    let leadSkipped = false;

    for (const rule of smartRules.custom) {
      if (!rule.enabled) continue;
      const fieldValue = getCustomRuleFieldValue(rule.condition_field, lead);
      const matches = evaluateCustomCondition(fieldValue, rule.condition_operator, rule.condition_value);

      if (matches) {
        console.log(`[SmartRules] Custom rule "${rule.name}" matched: ${rule.condition_field} ${rule.condition_operator} ${rule.condition_value}`);
        if (rule.action === "skip") {
          console.log(`[SmartRules] Lead skipped by custom rule "${rule.name}"`);
          leadSkipped = true;
          break;
        }
        if (rule.action === "assign_to" && rule.agent_id) {
          forcedAgentId = rule.agent_id;
          console.log(`[SmartRules] Custom rule forces assignment to agent ${rule.agent_id}`);
          break;
        }
      }
    }

    if (leadSkipped) {
      return new Response(
        JSON.stringify({ success: false, message: 'Lead skipped by custom smart rule' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Hot Lead Check ──
    const isHotLead = smartRules.system.hot_lead_enabled && leadScore >= smartRules.system.hot_lead_score;
    if (isHotLead) {
      console.log(`[SmartRules] Hot lead detected (score: ${leadScore} >= ${smartRules.system.hot_lead_score})`);
    }

    // ── Reroute Same Agent ──
    if (!forcedAgentId && smartRules.system.reroute_same_agent) {
      const { data: prevHistory } = await supabase
        .from('lead_distribution_history')
        .select('to_user_id')
        .eq('lead_id', lead_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevHistory?.to_user_id) {
        forcedAgentId = prevHistory.to_user_id;
        console.log(`[SmartRules] Rerouting to previous agent: ${prevHistory.to_user_id}`);
      }
    }

    // ── Work Hours Check ──
    if (!isHotLead && smartRules.system.work_hours_enabled) {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      if (currentTime < smartRules.system.work_hours_start || currentTime > smartRules.system.work_hours_end) {
        console.log(`[SmartRules] Outside work hours (${currentTime} not in ${smartRules.system.work_hours_start}-${smartRules.system.work_hours_end}), queuing lead`);
        return new Response(
          JSON.stringify({ success: false, message: 'Outside work hours, lead queued for next business hours' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 3. Mapear trigger_source para tipo de trigger correto
    const triggerTypeMap: Record<string, string> = {
      'facebook': 'new_lead',
      'whatsapp': 'new_lead', 
      'webhook': 'new_lead',
      'manual': 'manual',
      'auto_redistribution': 'auto_redistribution',
      'new_lead': 'new_lead'
    };
    
    const mappedTrigger = triggerTypeMap[trigger_source] || trigger_source;
    
    // Verificar se o trigger está habilitado
    const triggers = (config.triggers as string[]) || [];
    if (!triggers.includes(mappedTrigger)) {
      console.log('Trigger not enabled:', mappedTrigger, 'for trigger_source:', trigger_source);
      return new Response(
        JSON.stringify({ success: false, message: `Trigger ${mappedTrigger} not enabled` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Se há team_id configurado, buscar membros da equipe
    let eligibleAgentIds = config.eligible_agents as string[] | null;
    const teamId = config.team_id as string | null;

    if (teamId) {
      console.log(`Filtering by team_id: ${teamId}`);
      
      const { data: teamMembers, error: teamMembersError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId);

      if (teamMembersError) {
        console.error('Error fetching team members:', teamMembersError);
      } else if (teamMembers && teamMembers.length > 0) {
        const teamMemberIds = teamMembers.map(tm => tm.user_id);
        console.log(`Team has ${teamMemberIds.length} members:`, teamMemberIds);
        
        // Se já havia agentes elegíveis, fazer interseção
        if (eligibleAgentIds && eligibleAgentIds.length > 0) {
          eligibleAgentIds = eligibleAgentIds.filter(id => teamMemberIds.includes(id));
        } else {
          eligibleAgentIds = teamMemberIds;
        }
        
        console.log(`Filtered eligible agents: ${eligibleAgentIds.length}`);
      } else {
        console.log('Team has no members');
        return new Response(
          JSON.stringify({ success: false, message: 'Team has no members' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 5. Buscar agentes disponíveis
    console.log('Eligible agent IDs:', eligibleAgentIds);
    const availableAgents = await getAvailableAgents(supabase, organization_id, eligibleAgentIds);
    
    console.log(`Found ${availableAgents.length} available agents:`, availableAgents.map(a => a.full_name || a.email));
    
    if (availableAgents.length === 0) {
      console.log('No available agents found');
      return new Response(
        JSON.stringify({ success: false, message: 'No available agents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Selecionar agente baseado no método de distribuição (ou usar agente forçado pelas smart rules)
    let selectedAgent: any = null;

    if (forcedAgentId) {
      // Verify the forced agent is actually available
      selectedAgent = availableAgents.find((a: any) => a.user_id === forcedAgentId) || null;
      if (selectedAgent) {
        console.log(`[SmartRules] Using forced agent: ${selectedAgent.full_name || selectedAgent.email}`);
      } else {
        console.log(`[SmartRules] Forced agent ${forcedAgentId} not available, falling back to normal selection`);
      }
    }

    if (!selectedAgent) {
      selectedAgent = await selectAgent(
        supabase,
        availableAgents,
        config.distribution_method,
        organization_id,
        config.id
      );
    }

    if (!selectedAgent) {
      console.log('Could not select an agent');
      return new Response(
        JSON.stringify({ success: false, message: 'Could not select an agent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Atribuir lead ao agente e mover para o funil/estágio correto da roleta
    const leadUpdate: Record<string, any> = {
      responsavel_user_id: selectedAgent.user_id,
      responsavel: selectedAgent.full_name || selectedAgent.email, // Mantém TEXT para compatibilidade
    };

    // Se a config tem funil definido, mover o lead para o funil/estágio correto
    if (config.funnel_id) {
      leadUpdate.funnel_id = config.funnel_id;

      if (config.funnel_stage_id) {
        // Usar estágio específico definido na roleta
        leadUpdate.funnel_stage_id = config.funnel_stage_id;
        console.log(`Setting funnel_id=${config.funnel_id}, funnel_stage_id=${config.funnel_stage_id} (from config)`);
      } else {
        // Buscar o primeiro estágio ativo do funil (menor position, sem won/lost)
        const { data: firstStage } = await supabase
          .from('funnel_stages')
          .select('id, name, position')
          .eq('funnel_id', config.funnel_id)
          .not('stage_type', 'in', '("won","lost")')
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          leadUpdate.funnel_stage_id = firstStage.id;
          console.log(`Setting funnel_id=${config.funnel_id}, funnel_stage_id=${firstStage.id} (first stage: "${firstStage.name}")`);
        } else {
          console.log(`Funnel ${config.funnel_id} has no active stages, skipping funnel_stage_id`);
        }
      }
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update(leadUpdate)
      .eq('id', lead_id);

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 8. Registrar no histórico
    const { error: historyError } = await supabase
      .from('lead_distribution_history')
      .insert({
        lead_id,
        organization_id,
        config_id: config.id,  // isola o round-robin por roleta
        from_user_id: from_user_id || null,
        to_user_id: selectedAgent.user_id,
        distribution_method: config.distribution_method,
        trigger_source,
        is_redistribution: is_redistribution || false,
      });

    if (historyError) {
      // Logar detalhes completos para diagnóstico
      console.error('[HISTORY] Error recording distribution history:', JSON.stringify(historyError));
      console.error('[HISTORY] Attempted insert: lead_id=' + lead_id + ' org=' + organization_id + ' to=' + selectedAgent.user_id + ' config=' + config.id);
    } else {
      console.log('[HISTORY] Distribution recorded: lead=' + lead_id + ' → agent=' + selectedAgent.user_id + ' (config=' + config.id + ')');
    }

    console.log('Lead distributed successfully to:', selectedAgent.full_name || selectedAgent.email, '(UUID:', selectedAgent.user_id, ')');

    return new Response(
      JSON.stringify({ 
        success: true, 
        agent: selectedAgent.full_name || selectedAgent.email,
        agent_user_id: selectedAgent.user_id,
        method: config.distribution_method 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in distribute-lead function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function getAvailableAgents(supabase: any, organization_id: string, eligibleAgentIds?: string[] | null) {
  // 1. Buscar agent_distribution_settings — ORDER BY user_id garante ordem estável para round-robin
  let settingsQuery = supabase
    .from('agent_distribution_settings')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('is_paused', false)
    .order('user_id', { ascending: true });

  // Se há lista de agentes elegíveis, filtrar por ela
  if (eligibleAgentIds && eligibleAgentIds.length > 0) {
    settingsQuery = settingsQuery.in('user_id', eligibleAgentIds);
  }

  let { data: settings, error: settingsError } = await settingsQuery;

  // Fallback: se nenhum agente tem agent_distribution_settings configurado,
  // criar entradas virtuais para os membros elegíveis da organização
  if (settingsError || !settings || settings.length === 0) {
    console.warn('No agent_distribution_settings found, falling back to organization_members');

    let membersQuery = supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .order('user_id', { ascending: true });

    if (eligibleAgentIds && eligibleAgentIds.length > 0) {
      membersQuery = membersQuery.in('user_id', eligibleAgentIds);
    }

    const { data: orgMembers, error: membersError } = await membersQuery;
    if (membersError || !orgMembers || orgMembers.length === 0) {
      console.error('No organization members found:', membersError);
      return [];
    }

    // Criar settings virtuais com valores padrão (sem limite de capacidade)
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

  // 2. Buscar profiles para cada user_id
  const userIds = settings.map((s: any) => s.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .in('user_id', userIds);

  // 3. Buscar organization_members para cada user_id
  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, email')
    .in('user_id', userIds)
    .eq('organization_id', organization_id);

  // 4. Criar mapas para fácil acesso
  const profilesMap = new Map();
  if (profiles) {
    profiles.forEach((p: any) => profilesMap.set(p.user_id, p));
  }

  const membersMap = new Map();
  if (members) {
    members.forEach((m: any) => membersMap.set(m.user_id, m));
  }

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM

  // 5. Filtrar agentes disponíveis - ATUALIZADO: usar responsavel_user_id
  const available = [];
  for (const agent of settings) {
    const profile = profilesMap.get(agent.user_id);
    const member = membersMap.get(agent.user_id);
    // Verificar pause_until
    if (agent.pause_until && new Date(agent.pause_until) > now) {
      continue;
    }

    // Verificar horário de trabalho
    const workingHours = agent.working_hours as any;
    if (workingHours && workingHours[currentDay]) {
      const { start, end } = workingHours[currentDay];
      if (currentTime < start || currentTime > end) {
        continue;
      }
    }

    // Verificar capacidade máxima - usando stage_type do funil
    // Contar por UUID
    const { data: leadsByUuid } = await supabase
      .from('leads')
      .select('id, funnel_stages!inner(stage_type)')
      .eq('responsavel_user_id', agent.user_id)
      .not('funnel_stages.stage_type', 'in', '("won","lost")');

    // Contar por nome (fallback para leads antigos sem UUID)
    let leadsByNameCount = 0;
    if (profile?.full_name) {
      const { data: leadsByName } = await supabase
        .from('leads')
        .select('id, funnel_stages!inner(stage_type)')
        .eq('responsavel', profile.full_name)
        .is('responsavel_user_id', null)
        .not('funnel_stages.stage_type', 'in', '("won","lost")');
      leadsByNameCount = leadsByName?.length || 0;
    }

    const currentLoad = (leadsByUuid?.length || 0) + leadsByNameCount;
    const agentName = profile?.full_name || member?.email;

    // Só verificar capacidade se capacity_enabled estiver ativo
    const capacityEnabled = agent.capacity_enabled === true;
    console.log(`Agent ${agentName} (${agent.user_id}): ${currentLoad}/${agent.max_capacity} leads (capacity_enabled: ${capacityEnabled})`);

    if (capacityEnabled && currentLoad >= agent.max_capacity) {
      console.log(`Agent at capacity (limit active), skipping`);
      continue;
    }

    available.push({
      user_id: agent.user_id,
      full_name: profile?.full_name,
      email: member?.email,
      priority_weight: agent.priority_weight,
      current_load: currentLoad,
      max_capacity: agent.max_capacity,
    });
  }

  return available;
}

async function selectAgent(
  supabase: any,
  agents: any[],
  method: string,
  organization_id: string,
  config_id?: string
) {
  switch (method) {
    case 'round_robin':
      return selectRoundRobin(supabase, agents, organization_id, config_id);

    case 'weighted':
      return selectWeighted(agents);

    case 'load_based':
      return selectLoadBased(agents);

    case 'random':
      return selectRandom(agents);

    default:
      return selectRoundRobin(supabase, agents, organization_id, config_id);
  }
}

async function selectRoundRobin(supabase: any, agents: any[], organization_id: string, config_id?: string) {
  // Buscar os últimos 50 registros de distribuição desta ROLETA ESPECÍFICA
  // Filtrar por config_id garante que rolettas distintas não interferem entre si
  // (agents[] já está ordenado por user_id — ordem estável garantida pelo getAvailableAgents)
  let historyQuery = supabase
    .from('lead_distribution_history')
    .select('to_user_id')
    .eq('organization_id', organization_id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Filtrar por esta roleta se config_id estiver disponível
  if (config_id) {
    historyQuery = historyQuery.eq('config_id', config_id);
  }

  const { data: recentHistory, error: historyFetchError } = await historyQuery;

  if (historyFetchError) {
    console.error('[RoundRobin] Error fetching history:', JSON.stringify(historyFetchError));
  }

  if (!recentHistory || recentHistory.length === 0) {
    // Sem histórico: começar pelo primeiro agente
    console.log(`[RoundRobin] No history found (config_id=${config_id || 'none'}), starting from agents[0]: ${agents[0]?.user_id}`);
    return agents[0];
  }

  console.log(`[RoundRobin] Found ${recentHistory.length} history records. Last to_user_id: ${recentHistory[0]?.to_user_id}`);
  console.log(`[RoundRobin] Available agents (${agents.length}): ${agents.map(a => a.user_id).join(', ')}`);

  // Percorrer o histórico recente e encontrar o ÚLTIMO agente que ainda está disponível
  // Isso corrige o bug onde findIndex retorna -1 (agente cheio/pausado) causando nextIndex=0 sempre
  for (const record of recentHistory) {
    const lastIndex = agents.findIndex(a => a.user_id === record.to_user_id);
    if (lastIndex !== -1) {
      // Encontrou o último agente disponível no histórico
      const nextIndex = (lastIndex + 1) % agents.length;
      const selected = agents[nextIndex];
      console.log(`[RoundRobin] Last available in history: index=${lastIndex} (${record.to_user_id}), next: index=${nextIndex} (${selected.user_id})`);
      return selected;
    }
  }

  // Nenhum agente do histórico recente está disponível — começar do início
  console.log('[RoundRobin] No recent history agent is available, starting from agents[0]:', agents[0]?.user_id);
  return agents[0];
}

function selectWeighted(agents: any[]) {
  // Calcular total de pesos
  const totalWeight = agents.reduce((sum, agent) => sum + agent.priority_weight, 0);
  
  // Gerar número aleatório
  let random = Math.random() * totalWeight;
  
  // Selecionar agente baseado no peso
  for (const agent of agents) {
    random -= agent.priority_weight;
    if (random <= 0) {
      return agent;
    }
  }
  
  return agents[0];
}

function selectLoadBased(agents: any[]) {
  // Selecionar agente com menor carga atual
  return agents.reduce((min, agent) => 
    agent.current_load < min.current_load ? agent : min
  );
}

function selectRandom(agents: any[]) {
  return agents[Math.floor(Math.random() * agents.length)];
}

function calculateLeadScore(input: { telefone_lead?: string; email?: string; source?: string; nome_lead?: string }): number {
  let score = 0;
  if (input.telefone_lead && input.telefone_lead.replace(/\D/g, '').length >= 10) score += 30;
  if (input.email && input.email.includes('@')) score += 20;
  if (input.source === 'facebook') score += 20;
  if (input.source === 'formulario' || input.source === 'site') score += 15;
  if (input.nome_lead && input.nome_lead.trim().split(/\s+/).length >= 2) score += 15;
  return Math.min(score, 100);
}

function evaluateFilterRules(rules: any, lead: any): boolean {
  const { logic, conditions } = rules;
  if (!conditions?.length) return true;

  const results = conditions.map((cond: any) => {
    const { field, operator, value } = cond;
    const leadValue = getLeadFieldValue(field, lead);

    switch (operator) {
      case 'equals': return String(leadValue) === String(value);
      case 'not_equals': return String(leadValue) !== String(value);
      case 'gte': return Number(leadValue) >= Number(value);
      case 'lte': return Number(leadValue) <= Number(value);
      case 'exists': return leadValue !== null && leadValue !== undefined && leadValue !== '';
      default: return true;
    }
  });

  return logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
}

function getLeadFieldValue(field: string, lead: any): any {
  switch (field) {
    case 'source_type': return lead.source || '';
    case 'lead_score': return lead.lead_score || 0;
    case 'telefone_lead': return lead.telefone_lead || '';
    case 'email_lead': return lead.email || '';
    default: return null;
  }
}
