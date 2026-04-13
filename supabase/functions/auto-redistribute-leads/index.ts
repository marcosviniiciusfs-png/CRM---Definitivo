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

    const now = new Date();
    console.log(`🔄 [auto-redistribute-leads] Verificando redistribuições às: ${now.toISOString()}`);

    // 1. Buscar todas as configs com auto_redistribute ativo e timeout definido
    const { data: configs, error: configsError } = await supabase
      .from('lead_distribution_configs')
      .select('id, organization_id, redistribution_timeout_minutes, is_active')
      .eq('auto_redistribute', true)
      .eq('is_active', true)
      .gt('redistribution_timeout_minutes', 0);

    if (configsError) throw configsError;
    if (!configs || configs.length === 0) {
      console.log('✅ Nenhuma roleta com auto-redistribuição ativa');
      return new Response(JSON.stringify({ success: true, redistributed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📋 ${configs.length} roleta(s) com auto-redistribuição ativa`);

    let totalRedistributed = 0;

    for (const config of configs) {
      const timeoutMs = config.redistribution_timeout_minutes * 60 * 1000;
      const cutoffTime = new Date(now.getTime() - timeoutMs).toISOString();

      // 2. Para esta config, buscar distribuições mais recentes por lead
      //    (apenas a última distribuição para cada lead nesta roleta)
      const { data: recentDistributions, error: distError } = await supabase
        .from('lead_distribution_history')
        .select('lead_id, to_user_id, created_at, is_redistribution')
        .eq('organization_id', config.organization_id)
        .eq('config_id', config.id)
        .order('created_at', { ascending: false });

      if (distError) {
        console.error(`❌ Erro ao buscar histórico para config ${config.id}:`, distError);
        continue;
      }
      if (!recentDistributions || recentDistributions.length === 0) continue;

      // Pegar a distribuição mais recente por lead
      const latestByLead = new Map<string, typeof recentDistributions[0]>();
      for (const row of recentDistributions) {
        if (!latestByLead.has(row.lead_id)) {
          latestByLead.set(row.lead_id, row);
        }
      }

      // 3. Filtrar: distribuições mais antigas que o cutoff (sem interação no prazo)
      const eligibleLeadIds: string[] = [];
      const eligibleFromUserIds: Record<string, string> = {};
      for (const [leadId, row] of latestByLead.entries()) {
        if (row.created_at < cutoffTime) {
          eligibleLeadIds.push(leadId);
          eligibleFromUserIds[leadId] = row.to_user_id;
        }
      }

      if (eligibleLeadIds.length === 0) continue;

      // 4. Verificar se houve atividade nos leads elegíveis após a última distribuição
      //    (se houve atividade, o colaborador interagiu — não redistribuir)
      const { data: activities } = await supabase
        .from('lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', eligibleLeadIds)
        .gte('created_at', cutoffTime);

      const leadsWithActivity = new Set((activities || []).map((a: any) => a.lead_id));

      // Filtrar leads sem atividade recente
      const leadsToRedistribute = eligibleLeadIds.filter(id => !leadsWithActivity.has(id));

      if (leadsToRedistribute.length === 0) continue;

      console.log(`🔁 Config ${config.id}: ${leadsToRedistribute.length} lead(s) para redistribuir`);

      // 5. Buscar a URL do projeto para chamar distribute-lead
      const projectUrl = supabaseUrl.replace('/rest/v1', '');

      // 6. Redistribuir cada lead elegível
      for (const leadId of leadsToRedistribute) {
        try {
          const fromUserId = eligibleFromUserIds[leadId];

          const resp = await fetch(`${projectUrl}/functions/v1/distribute-lead`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              lead_id: leadId,
              organization_id: config.organization_id,
              trigger_source: 'auto_redistribution',
              is_redistribution: true,
              from_user_id: fromUserId || null,
            }),
          });

          if (!resp.ok) {
            const errText = await resp.text();
            console.error(`❌ Falha ao redistribuir lead ${leadId}: ${errText}`);
          } else {
            const result = await resp.json();
            if (result.success) {
              console.log(`✅ Lead ${leadId} redistribuído com sucesso`);
              totalRedistributed++;
            } else {
              console.warn(`⚠️ distribute-lead retornou falha para lead ${leadId}: ${result.message || result.error}`);
            }
          }
        } catch (leadErr) {
          console.error(`❌ Erro ao redistribuir lead ${leadId}:`, leadErr);
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2: Distribuir leads que NUNCA foram atribuídos (sem dono)
    // ═══════════════════════════════════════════════════════════════
    const UNASSIGNED_LIMIT = 50;

    // Buscar orgs que têm pelo menos uma roleta ativa
    const { data: orgsWithConfigs } = await supabase
      .from('lead_distribution_configs')
      .select('organization_id')
      .eq('is_active', true);

    const uniqueOrgIds = [...new Set((orgsWithConfigs || []).map((c: any) => c.organization_id))];
    const projectUrl = supabaseUrl.replace('/rest/v1', '');

    console.log(`📋 [PHASE 2] ${uniqueOrgIds.length} organização(ões) com roletas ativas`);

    for (const orgId of uniqueOrgIds) {
      try {
        // Buscar leads sem dono nesta org (limitado para evitar timeout)
        const { data: unassignedLeads } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', orgId)
          .is('responsavel_user_id', null)
          .limit(UNASSIGNED_LIMIT);

        if (!unassignedLeads || unassignedLeads.length === 0) continue;

        console.log(`📋 [PHASE 2] Org ${orgId}: ${unassignedLeads.length} lead(s) sem dono`);

        let phase2Count = 0;

        for (const lead of unassignedLeads) {
          try {
            const resp = await fetch(`${projectUrl}/functions/v1/distribute-lead`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                lead_id: lead.id,
                organization_id: orgId,
                trigger_source: 'auto_redistribution',
              }),
            });

            const result = resp.ok ? await resp.json() : null;
            if (result?.success) {
              phase2Count++;
              totalRedistributed++;
            } else {
              // distribute-lead retorna success=false quando não há config, agentes, etc.
              // Não é erro — apenas log detalhado
              console.log(`📋 [PHASE 2] Lead ${lead.id}: ${result?.message || 'sem config/agente'}`);
            }
          } catch (leadErr) {
            console.error(`❌ [PHASE 2] Erro ao distribuir lead ${lead.id}:`, leadErr);
          }
        }

        if (phase2Count > 0) {
          console.log(`✅ [PHASE 2] Org ${orgId}: ${phase2Count} lead(s) distribuído(s)`);
        }
      } catch (orgErr) {
        console.error(`❌ [PHASE 2] Erro na org ${orgId}:`, orgErr);
      }
    }

    console.log(`✅ [auto-redistribute-leads] ${totalRedistributed} lead(s) redistribuído(s) (Phase 1 + Phase 2)`);

    return new Response(
      JSON.stringify({ success: true, redistributed: totalRedistributed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em auto-redistribute-leads:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
