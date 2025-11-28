import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessAutomationRequest {
  trigger_type: string;
  trigger_data: {
    lead_id?: string;
    message_id?: string;
    message_content?: string;
    organization_id: string;
    [key: string]: any;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { trigger_type, trigger_data } = await req.json() as ProcessAutomationRequest;

    console.log('Processing automation for trigger:', trigger_type, trigger_data);

    // Buscar regras ativas para este gatilho e organização
    const { data: rules, error: rulesError } = await supabase
      .from('automation_rules')
      .select('*')
      .eq('organization_id', trigger_data.organization_id)
      .eq('trigger_type', trigger_type)
      .eq('is_active', true);

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      throw rulesError;
    }

    if (!rules || rules.length === 0) {
      console.log('No active rules found for this trigger');
      return new Response(
        JSON.stringify({ success: true, message: 'No active rules found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Found ${rules.length} active rules to process`);

    // Processar cada regra
    for (const rule of rules) {
      try {
        console.log(`Processing rule: ${rule.name} (${rule.id})`);

        // Avaliar condições
        const conditionsMet = await evaluateConditions(
          rule.conditions,
          trigger_data,
          supabase
        );

        console.log(`Rule ${rule.name}: conditions met = ${conditionsMet}`);

        // Executar ações se as condições forem atendidas
        const actionsExecuted: any[] = [];
        let executionStatus = 'success';
        let errorMessage = null;

        if (conditionsMet) {
          for (const action of rule.actions) {
            try {
              console.log(`Executing action: ${action.type}`);
              const result = await executeAction(action, trigger_data, supabase);
              actionsExecuted.push({ action: action.type, result, success: true });
            } catch (actionError: any) {
              console.error(`Error executing action ${action.type}:`, actionError);
              actionsExecuted.push({
                action: action.type,
                error: actionError.message,
                success: false,
              });
              executionStatus = 'partial_failure';
              errorMessage = actionError.message;
            }
          }
        }

        // Registrar log de execução
        await supabase.from('automation_logs').insert({
          organization_id: trigger_data.organization_id,
          rule_id: rule.id,
          lead_id: trigger_data.lead_id || null,
          trigger_data,
          conditions_met: conditionsMet,
          actions_executed: actionsExecuted,
          status: executionStatus,
          error_message: errorMessage,
        });

        console.log(`Rule ${rule.name} processed successfully`);
      } catch (ruleError: any) {
        console.error(`Error processing rule ${rule.name}:`, ruleError);
        
        // Registrar falha no log
        await supabase.from('automation_logs').insert({
          organization_id: trigger_data.organization_id,
          rule_id: rule.id,
          lead_id: trigger_data.lead_id || null,
          trigger_data,
          conditions_met: false,
          actions_executed: [],
          status: 'error',
          error_message: ruleError.message,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed_rules: rules.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Critical error in automation processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function evaluateConditions(
  conditions: any[],
  triggerData: any,
  supabase: any
): Promise<boolean> {
  if (!conditions || conditions.length === 0) {
    return true; // Nenhuma condição = sempre verdadeiro
  }

  for (const condition of conditions) {
    switch (condition.type) {
      case 'ALWAYS_TRUE':
        continue;

      case 'MESSAGE_CONTENT':
        if (!triggerData.message_content) return false;
        const content = triggerData.message_content.toLowerCase();
        const value = condition.value.toLowerCase();

        if (condition.operator === 'CONTAINS') {
          const keywords = value.split(',').map((k: string) => k.trim());
          const hasKeyword = keywords.some((keyword: string) => content.includes(keyword));
          if (!hasKeyword) return false;
        } else if (condition.operator === 'EQUALS') {
          if (content !== value) return false;
        }
        break;

      case 'LAST_CONVERSATION_ACTIVITY':
        if (!triggerData.lead_id) return false;
        const { data: lead } = await supabase
          .from('leads')
          .select('last_message_at')
          .eq('id', triggerData.lead_id)
          .single();

        if (lead && lead.last_message_at) {
          const lastActivity = new Date(lead.last_message_at);
          const daysSinceActivity = Math.floor(
            (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceActivity < condition.days) return false;
        }
        break;

      case 'AGENT_RESPONSE_TIME':
        if (!triggerData.lead_id) return false;
        const { data: messages } = await supabase
          .from('mensagens_chat')
          .select('data_hora, direcao')
          .eq('id_lead', triggerData.lead_id)
          .order('data_hora', { ascending: false })
          .limit(10);

        if (messages && messages.length > 0) {
          const lastIncoming = messages.find((m: any) => m.direcao === 'ENTRADA');
          const lastOutgoing = messages.find((m: any) => m.direcao === 'SAIDA');

          if (lastIncoming && (!lastOutgoing || new Date(lastIncoming.data_hora) > new Date(lastOutgoing.data_hora))) {
            const minutesSinceIncoming = Math.floor(
              (Date.now() - new Date(lastIncoming.data_hora).getTime()) / (1000 * 60)
            );
            if (minutesSinceIncoming < condition.minutes) return false;
          }
        }
        break;

      case 'TIME_OF_DAY':
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const [startHour, startMin] = condition.start_time.split(':').map(Number);
        const [endHour, endMin] = condition.end_time.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;

        if (currentTime < startTime || currentTime > endTime) return false;
        break;
    }
  }

  return true;
}

async function executeAction(
  action: any,
  triggerData: any,
  supabase: any
): Promise<any> {
  switch (action.type) {
    case 'SET_TYPING_STATUS': {
      if (!triggerData.lead_id) throw new Error('Lead ID required for typing status');
      
      const { data: lead } = await supabase
        .from('leads')
        .select('telefone_lead, organization_id')
        .eq('id', triggerData.lead_id)
        .single();

      if (!lead) throw new Error('Lead not found');

      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('organization_id', lead.organization_id)
        .eq('status', 'CONNECTED')
        .single();

      if (!instance) {
        console.log('No connected WhatsApp instance found, skipping typing status');
        return { skipped: true, reason: 'No connected instance' };
      }

      let evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL') || '';
      const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

      if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
        console.warn('EVOLUTION_API_URL inválida. Usando URL padrão.');
        evolutionApiUrl = 'https://evolution01.kairozspace.com.br';
      }

      if (!evolutionApiKey) {
        console.warn('EVOLUTION_API_KEY não configurada');
        return { skipped: true, reason: 'No API key' };
      }

      const sanitizedNumber = lead.telefone_lead.replace(/\D/g, '');
      const enabled = action.config?.enabled ?? true;
      const durationSeconds = action.config?.duration_seconds || 10;
      const durationMs = durationSeconds * 1000;

      if (enabled) {
        console.log(`SET_TYPING_STATUS: Sending typing with delay ${durationSeconds}s for lead ${lead.telefone_lead}`);
        
        try {
          const presenceResponse = await fetch(
            `${evolutionApiUrl}/chat/sendPresence/${instance.instance_name}`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: evolutionApiKey,
              },
              body: JSON.stringify({
                number: sanitizedNumber,
                delay: durationMs,
                presence: 'composing',
              }),
            }
          );

          const responseBody = await presenceResponse.text();
          console.log('Evolution API sendPresence response status:', presenceResponse.status);
          console.log('Evolution API sendPresence response body:', responseBody);

          if (!presenceResponse.ok) {
            throw new Error(`sendPresence failed: ${responseBody}`);
          }

          return { typing_enabled: true, duration_seconds: durationSeconds };
        } catch (error: any) {
          console.error('Error setting typing status:', error);
          throw error;
        }
      }
      
      return { typing_enabled: false };
    }


    case 'SEND_PREDEFINED_MESSAGE': {
      console.log('SEND_PREDEFINED_MESSAGE:', action.config?.message);
      return await sendMessage(
        action.config.message,
        triggerData,
        supabase
      );
    }

    case 'CHANGE_FUNNEL_STAGE':
      if (!triggerData.lead_id) throw new Error('Lead ID required for stage change');
      const { error: stageError } = await supabase
        .from('leads')
        .update({ stage: action.config.stage })
        .eq('id', triggerData.lead_id);

      if (stageError) throw stageError;
      return { stage_changed: action.config.stage };

    case 'ASSIGN_TO_AGENT':
      if (!triggerData.lead_id) throw new Error('Lead ID required for agent assignment');
      
      const { data: member } = await supabase
        .from('organization_members')
        .select('user_id')
        .eq('email', action.config.agent_email)
        .single();

      if (member) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', member.user_id)
          .single();

        const agentName = profile?.full_name || action.config.agent_email;

        const { error: assignError } = await supabase
          .from('leads')
          .update({ responsavel: agentName })
          .eq('id', triggerData.lead_id);

        if (assignError) throw assignError;
        return { assigned_to: agentName };
      }
      return { assigned_to: action.config.agent_email };

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

async function sendMessage(
  message: string,
  triggerData: any,
  supabase: any
): Promise<any> {
  if (!triggerData.lead_id) throw new Error('Lead ID required to send message');

  const { data: lead } = await supabase
    .from('leads')
    .select('telefone_lead, organization_id')
    .eq('id', triggerData.lead_id)
    .single();

  if (!lead) throw new Error('Lead not found');

  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('instance_name')
    .eq('organization_id', lead.organization_id)
    .eq('status', 'CONNECTED')
    .single();

  if (!instance) {
    console.log('No connected WhatsApp instance found, skipping message send');
    return { skipped: true, reason: 'No connected instance' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const response = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
    },
    body: JSON.stringify({
      instance_name: instance.instance_name,
      remoteJid: lead.telefone_lead,
      message_text: message,
      leadId: triggerData.lead_id,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  const result = await response.json();
  return result;
}
