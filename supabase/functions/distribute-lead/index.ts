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

    const { lead_id, organization_id, trigger_source, is_redistribution, from_user_id } = await req.json() as DistributeLeadRequest;

    console.log('Distributing lead:', { lead_id, organization_id, trigger_source });

    // 1. Buscar lead para identificar o source
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('source')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      console.log('Lead not found');
      return new Response(
        JSON.stringify({ success: false, message: 'Lead not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 2. Buscar configuração específica da roleta baseada no source do lead
    const leadSource = lead.source?.toLowerCase() || '';
    let sourceType = 'all';
    
    if (leadSource.includes('whatsapp')) {
      sourceType = 'whatsapp';
    } else if (leadSource.includes('facebook')) {
      sourceType = 'facebook';
    } else if (leadSource.includes('webhook') || leadSource.includes('formulário')) {
      sourceType = 'webhook';
    }

    console.log(`Lead source: "${lead.source}" → mapped to sourceType: "${sourceType}"`);

    // Tentar buscar config específica para o source, senão buscar config 'all'
    let { data: config, error: configError } = await supabase
      .from('lead_distribution_configs')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('source_type', sourceType)
      .eq('is_active', true)
      .maybeSingle();

    // Se não encontrou config específica, buscar config 'all'
    if (!config) {
      console.log(`No specific config for "${sourceType}", trying "all"`);
      const { data: allConfig } = await supabase
        .from('lead_distribution_configs')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('source_type', 'all')
        .eq('is_active', true)
        .maybeSingle();
      
      config = allConfig;
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
    const triggers = config.triggers as string[];
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

    // 6. Selecionar agente baseado no método de distribuição
    const selectedAgent = await selectAgent(
      supabase,
      availableAgents,
      config.distribution_method,
      organization_id
    );

    if (!selectedAgent) {
      console.log('Could not select an agent');
      return new Response(
        JSON.stringify({ success: false, message: 'Could not select an agent' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Atribuir lead ao agente - ATUALIZADO: usar UUID + TEXT para compatibilidade
    const { error: updateError } = await supabase
      .from('leads')
      .update({ 
        responsavel_user_id: selectedAgent.user_id,
        responsavel: selectedAgent.full_name || selectedAgent.email // Mantém TEXT para compatibilidade
      })
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
        from_user_id: from_user_id || null,
        to_user_id: selectedAgent.user_id,
        distribution_method: config.distribution_method,
        trigger_source,
        is_redistribution: is_redistribution || false,
      });

    if (historyError) {
      console.error('Error recording history:', historyError);
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
  // 1. Buscar agent_distribution_settings
  let settingsQuery = supabase
    .from('agent_distribution_settings')
    .select('*')
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('is_paused', false);

  // Se há lista de agentes elegíveis, filtrar por ela
  if (eligibleAgentIds && eligibleAgentIds.length > 0) {
    settingsQuery = settingsQuery.in('user_id', eligibleAgentIds);
  }

  const { data: settings, error: settingsError } = await settingsQuery;

  if (settingsError || !settings || settings.length === 0) {
    console.error('Error fetching agent settings:', settingsError);
    return [];
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
    console.log(`Agent ${agentName} (${agent.user_id}): ${currentLoad}/${agent.max_capacity} leads`);

    if (currentLoad >= agent.max_capacity) {
      console.log(`Agent at capacity, skipping`);
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
  organization_id: string
) {
  switch (method) {
    case 'round_robin':
      return selectRoundRobin(supabase, agents, organization_id);
    
    case 'weighted':
      return selectWeighted(agents);
    
    case 'load_based':
      return selectLoadBased(agents);
    
    case 'random':
      return selectRandom(agents);
    
    default:
      return selectRoundRobin(supabase, agents, organization_id);
  }
}

async function selectRoundRobin(supabase: any, agents: any[], organization_id: string) {
  // Buscar o último agente que recebeu um lead
  const { data: lastDistribution } = await supabase
    .from('lead_distribution_history')
    .select('to_user_id')
    .eq('organization_id', organization_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!lastDistribution) {
    return agents[0];
  }

  // Encontrar o próximo agente na sequência
  const lastIndex = agents.findIndex(a => a.user_id === lastDistribution.to_user_id);
  const nextIndex = (lastIndex + 1) % agents.length;
  return agents[nextIndex];
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
