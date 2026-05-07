import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { redistributeBatch } from "../_shared/redistribute-batch.ts";

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

    const { organization_id, config_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'organization_id é obrigatório' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`🔄 [redistribute-unassigned] Iniciando para org: ${organization_id}`);

    // 1. Criar registro de lote (preserva comportamento legado: o histórico
    //    da UI 'RedistributionBatches' depende disso).
    const { data: batchRecord, error: batchError } = await supabase
      .from('redistribution_batches')
      .insert({
        organization_id,
        config_id: config_id || null,
        created_by: null,
        batch_type: 'manual',
        total_leads: 0,
        status: 'completed',
      })
      .select('id')
      .single();
    const batchId = batchRecord?.id || null;
    if (batchError) {
      console.error('⚠️ Erro ao criar lote (não crítico):', batchError);
    }

    // 2. Delegar processamento para o helper compartilhado
    const result = await redistributeBatch(supabase, organization_id, {
      batchSize: 100,
      configId: config_id || null,
      batchId,
    });

    // 3. Atualizar total_leads do lote (acumulado por chamada — o cliente
    //    chama varias vezes em loop; por chamada, atualizamos so o desta).
    if (batchId && result.redistributed > 0) {
      await supabase
        .from('redistribution_batches')
        .update({ total_leads: result.redistributed })
        .eq('id', batchId);
    }

    console.log(`✅ [redistribute-unassigned] ${result.redistributed} redistribuidos, ${result.skipped} skipped, has_more: ${result.hasMore}`);

    return new Response(
      JSON.stringify({
        success: true,
        redistributed_count: result.redistributed,
        total: result.totalRemaining + result.redistributed,
        processed: result.redistributed,
        skipped: result.skipped,
        has_more: result.hasMore,
        batch_complete: true,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('❌ Erro em redistribute-unassigned-leads:', message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
