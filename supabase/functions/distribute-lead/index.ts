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
      const { data: allConfig } = await supabase
        .from('lead_distribution_configs')
        .select('*')
        .eq('organization_id', organization_id)
        .eq('source_type', 'all')
        .eq('is_active', true)
        .maybeSingle();
      
      config = allConfig;
    }

    if (!config) {
      console.log('No active distribution config found for source:', sourceType);
      return new Response(
        JSON.stringify({ success: false, message: 'Distribution not configured or not active' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verificar se o trigger_source está habilitado
    const triggers = config.triggers as string[];
    if (!triggers.includes(trigger_source)) {
      console.log('Trigger source not enabled:', trigger_source);
      return new Response(
        JSON.stringify({ success: false, message: 'Trigger source not enabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Buscar agentes disponíveis (filtrados pelos elegíveis da roleta)
    const eligibleAgentIds = config.eligible_agents as string[] | null;
    const availableAgents = await getAvailableAgents(supabase, organization_id, eligibleAgentIds);
    
    if (availableAgents.length === 0) {
      console.log('No available agents found');
      return new Response(
        JSON.stringify({ success: false, message: 'No available agents' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Selecionar agente baseado no método de distribuição
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

    // 6. Atribuir lead ao agente
    const { error: updateError } = await supabase
      .from('leads')
      .update({ responsavel: selectedAgent.full_name || selectedAgent.email })
      .eq('id', lead_id);

    if (updateError) {
      console.error('Error updating lead:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 7. Registrar no histórico
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

    console.log('Lead distributed successfully to:', selectedAgent.full_name || selectedAgent.email);

    return new Response(
      JSON.stringify({ 
        success: true, 
        agent: selectedAgent.full_name || selectedAgent.email,
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
  let query = supabase
    .from('agent_distribution_settings')
    .select(`
      *,
      profiles:user_id (
        full_name,
        user_id
      ),
      organization_members!inner (
        email,
        user_id
      )
    `)
    .eq('organization_id', organization_id)
    .eq('is_active', true)
    .eq('is_paused', false);

  // Se há lista de agentes elegíveis, filtrar por ela
  if (eligibleAgentIds && eligibleAgentIds.length > 0) {
    query = query.in('user_id', eligibleAgentIds);
  }

  const { data: settings, error } = await query;

  if (error) {
    console.error('Error fetching agent settings:', error);
    return [];
  }

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM

  // Filtrar agentes disponíveis
  const available = [];
  for (const agent of settings || []) {
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

    // Verificar capacidade máxima
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('responsavel', agent.profiles?.full_name || agent.organization_members?.email)
      .neq('stage', 'GANHO')
      .neq('stage', 'PERDIDO')
      .neq('stage', 'DESCARTADO');

    if (count >= agent.max_capacity) {
      continue;
    }

    available.push({
      user_id: agent.user_id,
      full_name: agent.profiles?.full_name,
      email: agent.organization_members?.email,
      priority_weight: agent.priority_weight,
      current_load: count || 0,
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