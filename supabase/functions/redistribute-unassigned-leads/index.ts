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

    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-unassigned-leads] Iniciando para org: ${organization_id}`);

    // 1. Buscar leads sem responsável na organização
    const { data: unassignedLeads, error: leadsError } = await supabase
      .from('leads')
      .select('id, source, funnel_id')
      .eq('organization_id', organization_id)
      .is('responsavel_user_id', null);

    if (leadsError) throw leadsError;

    if (!unassignedLeads || unassignedLeads.length === 0) {
      console.log('✅ Nenhum lead sem responsável encontrado');
      return new Response(
        JSON.stringify({ success: true, redistributed_count: 0, message: 'Nenhum lead sem responsável' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 ${unassignedLeads.length} lead(s) sem responsável encontrado(s)`);

    // 2. Buscar roletas ativas da organização
    const { data: configs, error: configsError } = await supabase
      .from('lead_distribution_configs')
      .select('*')
      .eq('organization_id', organization_id)
      .eq('is_active', true);

    if (configsError) throw configsError;

    if (!configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, redistributed_count: 0, message: 'Nenhuma roleta ativa encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Para cada lead, encontrar a roleta mais específica e distribuir
    const projectUrl = supabaseUrl.replace('/rest/v1', '');
    let redistributedCount = 0;
    const errors: string[] = [];

    for (const lead of unassignedLeads) {
      try {
        // Determinar source_type do lead
        const leadSource = lead.source?.toLowerCase() || '';
        let sourceType = 'all';
        if (leadSource.includes('whatsapp')) {
          sourceType = 'whatsapp';
        } else if (leadSource.includes('facebook')) {
          sourceType = 'facebook';
        } else if (leadSource.includes('webhook') || leadSource.includes('formulário')) {
          sourceType = 'webhook';
        }

        // Encontrar roleta mais específica (mesma lógica do distribute-lead)
        let selectedConfig = null;

        // Prioridade 1: source_type + funnel_id
        if (lead.funnel_id) {
          selectedConfig = configs.find(c =>
            c.source_type === sourceType && c.funnel_id === lead.funnel_id
          );
        }

        // Prioridade 2: source_type sem funil
        if (!selectedConfig) {
          selectedConfig = configs.find(c =>
            c.source_type === sourceType && !c.funnel_id
          );
        }

        // Prioridade 3: "all" + funnel_id
        if (!selectedConfig && lead.funnel_id) {
          selectedConfig = configs.find(c =>
            c.source_type === 'all' && c.funnel_id === lead.funnel_id
          );
        }

        // Prioridade 4: "all" genérica
        if (!selectedConfig) {
          selectedConfig = configs.find(c =>
            c.source_type === 'all' && !c.funnel_id
          );
        }

        if (!selectedConfig) {
          console.log(`⚠️ Nenhuma roleta encontrada para lead ${lead.id}`);
          continue;
        }

        // Chamar distribute-lead para este lead
        const resp = await fetch(`${projectUrl}/functions/v1/distribute-lead`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            lead_id: lead.id,
            organization_id: organization_id,
            trigger_source: 'manual',
            is_redistribution: false,
          }),
        });

        if (resp.ok) {
          const result = await resp.json();
          if (result.success) {
            redistributedCount++;
            console.log(`✅ Lead ${lead.id} distribuído`);
          } else {
            errors.push(`Lead ${lead.id}: ${result.message || result.error}`);
          }
        } else {
          const errText = await resp.text();
          errors.push(`Lead ${lead.id}: ${errText}`);
        }
      } catch (leadErr: any) {
        console.error(`❌ Erro ao distribuir lead ${lead.id}:`, leadErr);
        errors.push(`Lead ${lead.id}: ${leadErr.message}`);
      }
    }

    console.log(`✅ [redistribute-unassigned-leads] ${redistributedCount} lead(s) redistribuído(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: redistributedCount,
        total_unassigned: unassignedLeads.length,
        processed: redistributedCount, // Para compatibilidade com polling
        total: unassignedLeads.length, // Para compatibilidade com polling
        batch_complete: true, // Por enquanto, processa tudo de uma vez
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('❌ Erro em redistribute-unassigned-leads:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
