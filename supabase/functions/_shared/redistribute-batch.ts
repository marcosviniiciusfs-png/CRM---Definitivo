/**
 * Helper compartilhado para redistribuir 1 batch de leads sem dono via roletas.
 *
 * Usado por:
 * - redistribute-from-collaborator (depois de desatribuir leads do colaborador)
 * - redistribute-unassigned-leads (refatoração futura)
 *
 * Aplica a hierarquia: source+funnel > source > all+funnel > all
 */

export interface RedistributeBatchOptions {
  batchSize?: number;
  configId?: string | null;
  batchId?: string | null;
  /**
   * Quando setado, restringe a busca de leads sem dono APENAS aos IDs listados.
   * Util para chamadas que querem redistribuir um conjunto especifico (ex.:
   * leads recem-desatribuidos de um colaborador) sem varrer toda a fila da org.
   */
  leadIds?: string[];
  /**
   * Quando setado, esses user_ids sao removidos do pool de agentes elegiveis
   * de qualquer roleta. Usado pelo redistribute-from-collaborator para evitar
   * que os leads do(s) colaborador(es) escolhido(s) voltem para eles via
   * round-robin (caso o proprio esteja na roleta).
   */
  excludeUserIds?: string[];
}

export interface RedistributeBatchResult {
  redistributed: number;
  skipped: number;
  totalRemaining: number;
  hasMore: boolean;
  errors: string[];
  /**
   * Lista granular de cada lead processado neste batch.
   * `agent_user_id`/`agent_name` são null para leads sem agente compatível (skipped).
   * Consumidores antigos ignoram este campo (aditivo).
   */
  assignments: Array<{
    lead_id: string;
    lead_nome: string;
    agent_user_id: string | null;
    agent_name: string | null;
  }>;
}

export async function redistributeBatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  options: RedistributeBatchOptions = {}
): Promise<RedistributeBatchResult> {
  const batchSize = options.batchSize ?? 100;
  const configIdFilter = options.configId ?? null;
  const batchId = options.batchId ?? null;
  const leadIdsFilter = options.leadIds && options.leadIds.length > 0 ? options.leadIds : null;
  const excludeUserIdsSet = options.excludeUserIds && options.excludeUserIds.length > 0
    ? new Set(options.excludeUserIds)
    : null;

  // 1. Buscar leads sem dono (excluir won/lost)
  const { data: closedStages, error: closedStagesErr } = await supabase
    .from('funnel_stages')
    .select('id, sales_funnels!inner(organization_id)')
    .eq('sales_funnels.organization_id', organizationId)
    .in('stage_type', ['won', 'lost']);
  if (closedStagesErr) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`closedStages: ${closedStagesErr.message}`], assignments: [] };
  }
  const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

  let leadsQuery = supabase
    .from('leads')
    .select('id, nome_lead, source, funnel_id')
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null)
    .limit(batchSize);
  if (closedStageIds.length > 0) {
    leadsQuery = leadsQuery.or(
      `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(',')})`
    );
  }
  if (leadIdsFilter) {
    leadsQuery = leadsQuery.in('id', leadIdsFilter);
  }
  const { data: unassignedLeads, error: leadsError } = await leadsQuery;
  if (leadsError) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [`leadsFetch: ${leadsError.message}`], assignments: [] };
  }

  if (!unassignedLeads || unassignedLeads.length === 0) {
    return { redistributed: 0, skipped: 0, totalRemaining: 0, hasMore: false, errors: [], assignments: [] };
  }

  // 2. Contar total restante (escopado tambem por leadIds quando aplicavel)
  let countQuery = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('responsavel_user_id', null);
  if (closedStageIds.length > 0) {
    countQuery = countQuery.or(
      `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(',')})`
    );
  }
  if (leadIdsFilter) {
    countQuery = countQuery.in('id', leadIdsFilter);
  }
  const { count: totalRemaining } = await countQuery;

  // 3. Buscar configs ativos da org
  const { data: configs, error: configsError } = await supabase
    .from('lead_distribution_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  if (configsError) {
    return { redistributed: 0, skipped: 0, totalRemaining: totalRemaining || 0, hasMore: false, errors: [`configsFetch: ${configsError.message}`], assignments: [] };
  }
  if (!configs || configs.length === 0) {
    // deno-lint-ignore no-explicit-any
    const skippedAssignments = (unassignedLeads as any[]).map((l: any) => ({
      lead_id: l.id,
      lead_nome: l.nome_lead || '(sem nome)',
      agent_user_id: null,
      agent_name: null,
    }));
    return { redistributed: 0, skipped: unassignedLeads.length, totalRemaining: totalRemaining || 0, hasMore: false, errors: ['Nenhuma roleta ativa'], assignments: skippedAssignments };
  }

  // 4. Buscar agentes por config
  // deno-lint-ignore no-explicit-any
  const agentsByConfig = new Map<string, any[]>();
  for (const config of configs) {
    const eligibleIds = config.eligible_agents as string[] | null;
    let agents = await getAvailableAgentsFast(supabase, organizationId, eligibleIds, config.team_id);
    // Remove agentes que devem ser excluidos do pool (ex.: o proprio colaborador
    // cujos leads estao sendo redistribuidos — para nao receber os leads de volta).
    if (excludeUserIdsSet) {
      // deno-lint-ignore no-explicit-any
      agents = agents.filter((a: any) => !excludeUserIdsSet.has(a.user_id));
    }
    agentsByConfig.set(config.id, agents);
  }

  // 5. Buscar primeiro estágio dos funis (para mover lead se config tem funil)
  const funnelIds = [...new Set(configs.filter((c: { funnel_id: string | null }) => c.funnel_id).map((c: { funnel_id: string }) => c.funnel_id))];
  const firstStages = new Map<string, string>();
  if (funnelIds.length > 0) {
    const { data: stages } = await supabase
      .from('funnel_stages')
      .select('id, funnel_id, position')
      .in('funnel_id', funnelIds)
      .not('stage_type', 'in', '("won","lost")')
      .order('position', { ascending: true });
    for (const s of (stages || [])) {
      if (!firstStages.has(s.funnel_id)) firstStages.set(s.funnel_id, s.id);
    }
  }

  // 6. Último agente por config (round-robin contínuo)
  const lastAgentByConfig = new Map<string, string>();
  for (const config of configs) {
    const { data: lastHistory } = await supabase
      .from('lead_distribution_history')
      .select('to_user_id')
      .eq('organization_id', organizationId)
      .eq('config_id', config.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastHistory) lastAgentByConfig.set(config.id, lastHistory.to_user_id);
  }

  // 7. Distribuir
  const effectiveConfig = configIdFilter
    // deno-lint-ignore no-explicit-any
    ? configs.find((c: any) => c.id === configIdFilter) || null
    : null;
  // deno-lint-ignore no-explicit-any
  const fallbackConfig = configs.find((c: any) => c.source_type === 'all' && !c.funnel_id)
    // deno-lint-ignore no-explicit-any
    || configs.find((c: any) => agentsByConfig.get(c.id)?.length > 0)
    || null;

  let redistributedCount = 0;
  let skippedCount = 0;
  const errors: string[] = [];
  const assignments: Array<{
    lead_id: string;
    lead_nome: string;
    agent_user_id: string | null;
    agent_name: string | null;
  }> = [];
  // deno-lint-ignore no-explicit-any
  const leadsByConfig = new Map<string, { leads: any[], agents: any[], agentIndex: number }>();

  for (const lead of unassignedLeads) {
    const config = effectiveConfig || findBestConfig(configs, lead) || fallbackConfig;
    if (!config) {
      skippedCount++;
      assignments.push({
        // deno-lint-ignore no-explicit-any
        lead_id: (lead as any).id,
        // deno-lint-ignore no-explicit-any
        lead_nome: (lead as any).nome_lead || '(sem nome)',
        agent_user_id: null,
        agent_name: null,
      });
      continue;
    }
    const agents = agentsByConfig.get(config.id);
    if (!agents || agents.length === 0) {
      skippedCount++;
      assignments.push({
        // deno-lint-ignore no-explicit-any
        lead_id: (lead as any).id,
        // deno-lint-ignore no-explicit-any
        lead_nome: (lead as any).nome_lead || '(sem nome)',
        agent_user_id: null,
        agent_name: null,
      });
      continue;
    }

    let group = leadsByConfig.get(config.id);
    if (!group) {
      const lastAgentId = lastAgentByConfig.get(config.id);
      let startIndex = 0;
      if (lastAgentId) {
        // deno-lint-ignore no-explicit-any
        const idx = agents.findIndex((a: any) => a.user_id === lastAgentId);
        if (idx !== -1) startIndex = (idx + 1) % agents.length;
      }
      group = { leads: [], agents, agentIndex: startIndex };
      leadsByConfig.set(config.id, group);
    }

    const selectedAgent = group.agents[group.agentIndex];
    group.agentIndex = (group.agentIndex + 1) % group.agents.length;
    group.leads.push({ ...lead, agent: selectedAgent, config });
  }

  // 8. Batch update por agente
  // deno-lint-ignore no-explicit-any
  const historyRecords: any[] = [];
  for (const [configId, group] of leadsByConfig) {
    const config = group.leads[0]?.config;
    if (!config || group.leads.length === 0) continue;

    // deno-lint-ignore no-explicit-any
    const agentLeadMap = new Map<string, any[]>();
    for (const item of group.leads) {
      if (!agentLeadMap.has(item.agent.user_id)) agentLeadMap.set(item.agent.user_id, []);
      agentLeadMap.get(item.agent.user_id)!.push(item);
    }

    for (const [agentId, items] of agentLeadMap) {
      const agent = items[0].agent;
      const leadIds = items.map((i: { id: string }) => i.id);
      // deno-lint-ignore no-explicit-any
      const update: Record<string, any> = {
        responsavel_user_id: agentId,
        responsavel: agent.full_name || agent.email,
      };
      if (config.funnel_id) {
        update.funnel_id = config.funnel_id;
        const stageId = config.funnel_stage_id || firstStages.get(config.funnel_id);
        if (stageId) update.funnel_stage_id = stageId;
      }
      const { error: updateError } = await supabase
        .from('leads')
        .update(update)
        .in('id', leadIds);
      if (updateError) {
        errors.push(`Update batch (${leadIds.length} leads): ${updateError.message}`);
        continue;
      }
      redistributedCount += leadIds.length;
      for (const item of items) {
        historyRecords.push({
          lead_id: item.id,
          organization_id: organizationId,
          config_id: configId,
          batch_id: batchId,
          to_user_id: agentId,
          distribution_method: config.distribution_method,
          trigger_source: 'manual',
          is_redistribution: true,
        });
        assignments.push({
          lead_id: item.id,
          lead_nome: item.nome_lead || '(sem nome)',
          agent_user_id: agentId,
          agent_name: agent.full_name || agent.email || '(sem nome)',
        });
      }
    }
  }

  // 9. Insert historico
  if (historyRecords.length > 0) {
    const { error: histError } = await supabase
      .from('lead_distribution_history')
      .insert(historyRecords);
    if (histError) errors.push(`History insert: ${histError.message}`);
  }

  const remainingAfter = (totalRemaining || 0) - redistributedCount;
  return {
    redistributed: redistributedCount,
    skipped: skippedCount,
    totalRemaining: remainingAfter,
    hasMore: remainingAfter > 0,
    errors,
    assignments,
  };
}

// deno-lint-ignore no-explicit-any
function findBestConfig(configs: any[], lead: { source?: string; funnel_id?: string | null }): any | null {
  const leadSource = lead.source?.toLowerCase() || '';
  let sourceType = 'all';
  if (leadSource.includes('whatsapp')) sourceType = 'whatsapp';
  else if (leadSource.includes('facebook')) sourceType = 'facebook';
  else if (leadSource.includes('webhook') || leadSource.includes('formulário')) sourceType = 'webhook';

  const funnelId = lead.funnel_id || null;

  // deno-lint-ignore no-explicit-any
  if (funnelId) {
    const c = configs.find((c: any) => c.source_type === sourceType && c.funnel_id === funnelId);
    if (c) return c;
  }
  // deno-lint-ignore no-explicit-any
  const c2 = configs.find((c: any) => c.source_type === sourceType && !c.funnel_id);
  if (c2) return c2;
  if (funnelId) {
    // deno-lint-ignore no-explicit-any
    const c3 = configs.find((c: any) => c.source_type === 'all' && c.funnel_id === funnelId);
    if (c3) return c3;
  }
  // deno-lint-ignore no-explicit-any
  const c4 = configs.find((c: any) => c.source_type === 'all' && !c.funnel_id);
  return c4 || null;
}

// deno-lint-ignore no-explicit-any
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
      // deno-lint-ignore no-explicit-any
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
    // deno-lint-ignore no-explicit-any
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

  // deno-lint-ignore no-explicit-any
  const userIds = settings.map((s: any) => s.user_id);
  const [profilesResult, membersResult] = await Promise.all([
    supabase.from('profiles').select('user_id, full_name').in('user_id', userIds),
    supabase.from('organization_members').select('user_id, email').in('user_id', userIds).eq('organization_id', organization_id),
  ]);
  // deno-lint-ignore no-explicit-any
  const profilesMap = new Map((profilesResult.data || []).map((p: any) => [p.user_id, p]));
  // deno-lint-ignore no-explicit-any
  const membersMap = new Map((membersResult.data || []).map((m: any) => [m.user_id, m]));

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5);

  // deno-lint-ignore no-explicit-any
  const available: any[] = [];
  for (const agent of settings) {
    if (agent.pause_until && new Date(agent.pause_until) > now) continue;
    // deno-lint-ignore no-explicit-any
    const workingHours = agent.working_hours as any;
    if (workingHours && workingHours[currentDay]) {
      const { start, end } = workingHours[currentDay];
      if (currentTime < start || currentTime > end) continue;
    }
    available.push({
      user_id: agent.user_id,
      // deno-lint-ignore no-explicit-any
      full_name: (profilesMap.get(agent.user_id) as any)?.full_name,
      // deno-lint-ignore no-explicit-any
      email: (membersMap.get(agent.user_id) as any)?.email,
      priority_weight: agent.priority_weight,
      current_load: 0,
      max_capacity: 0,
    });
  }

  return available;
}
