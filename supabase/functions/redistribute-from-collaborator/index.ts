import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { redistributeBatch } from "../_shared/redistribute-batch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Auth: JWT do owner ou admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse body
    const { organization_id, collaborator_user_ids, config_id } = await req.json();
    if (!organization_id || !Array.isArray(collaborator_user_ids) || collaborator_user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "organization_id e collaborator_user_ids (array não vazio) são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Caller é owner ou admin?
    const { data: callerMember, error: callerErr } = await supabase
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (callerErr) throw new Error(`Caller lookup: ${callerErr.message}`);
    if (!callerMember || (callerMember.role !== "owner" && callerMember.role !== "admin")) {
      return new Response(JSON.stringify({ error: "Apenas owner ou admin podem redistribuir leads" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Verificar que TODOS os colaboradores existem na org
    const { data: targets, error: targetsErr } = await supabase
      .from("organization_members")
      .select("user_id")
      .in("user_id", collaborator_user_ids)
      .eq("organization_id", organization_id);
    if (targetsErr) throw new Error(`Targets lookup: ${targetsErr.message}`);
    const foundIds = new Set((targets || []).map((t: { user_id: string }) => t.user_id));
    const missing = collaborator_user_ids.filter((id: string) => !foundIds.has(id));
    if (missing.length > 0) {
      return new Response(JSON.stringify({ error: `Colaborador(es) não encontrado(s) nesta organização: ${missing.join(", ")}` }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Identificar stages won/lost para excluir
    const { data: closedStages } = await supabase
      .from("funnel_stages")
      .select("id, sales_funnels!inner(organization_id)")
      .eq("sales_funnels.organization_id", organization_id)
      .in("stage_type", ["won", "lost"]);
    const closedStageIds = (closedStages || []).map((s: { id: string }) => s.id);

    // 6. Contar leads ainda atribuidos a esses colaboradores (para has_more + total na UI).
    // Cada chamada do cliente processa 1 batch; o cliente loopa ate has_more=false.
    let countQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .in("responsavel_user_id", collaborator_user_ids);
    if (closedStageIds.length > 0) {
      countQuery = countQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { count: totalRemaining, error: countErr } = await countQuery;
    if (countErr) throw new Error(`Count: ${countErr.message}`);

    if (!totalRemaining || totalRemaining === 0) {
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: 0,
        processed: 0,
        skipped: 0,
        has_more: false,
        assignments: [],
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7. Capturar 1 lead por chamada — cadência lead-a-lead.
    // O cliente loopa com delay adaptativo (2s/lead até 50, 500ms depois)
    // e usa cada `assignments[0]` retornado para alimentar o log do modal.
    const BATCH_SIZE = 1;
    let batchQuery = supabase
      .from("leads")
      .select("id")
      .eq("organization_id", organization_id)
      .in("responsavel_user_id", collaborator_user_ids)
      .limit(BATCH_SIZE);
    if (closedStageIds.length > 0) {
      batchQuery = batchQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { data: batchLeads, error: batchErr } = await batchQuery;
    if (batchErr) throw new Error(`Fetch batch: ${batchErr.message}`);
    const batchLeadsTyped: Array<{ id: string }> = batchLeads || [];
    const batchIds: string[] = batchLeadsTyped.map((l) => l.id);

    if (batchIds.length === 0) {
      // totalRemaining > 0 mas o batch retornou 0 — improvavel mas seguro retornar done
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total: totalRemaining,
        processed: 0,
        skipped: 0,
        has_more: false,
        assignments: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 8. Desatribuir SOMENTE este batch
    const { error: unassignErr } = await supabase
      .from("leads")
      .update({ responsavel_user_id: null, responsavel: null })
      .in("id", batchIds);
    if (unassignErr) throw new Error(`Unassign: ${unassignErr.message}`);

    // 9. Redistribuir SOMENTE este batch via helper (escopado por leadIds).
    // excludeUserIds garante que os leads nao voltem para os proprios colaboradores
    // selecionados (caso eles estejam na roleta como agentes).
    const result = await redistributeBatch(supabase, organization_id, {
      batchSize: BATCH_SIZE,
      configId: config_id || null,
      leadIds: batchIds,
      excludeUserIds: collaborator_user_ids,
    });

    // has_more: ainda existem leads dos colaboradores apos este batch
    const hasMore = totalRemaining > batchIds.length;

    console.log(`✅ [redistribute-from-collaborator] batch: ${result.redistributed}/${batchIds.length}, total_remaining: ${totalRemaining}, has_more: ${hasMore}`);

    return new Response(JSON.stringify({
      success: true,
      redistributed_count: result.redistributed,
      total: totalRemaining,
      processed: result.redistributed,
      skipped: result.skipped,
      has_more: hasMore,
      assignments: result.assignments,
      errors: result.errors.length > 0 ? result.errors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redistribute-from-collaborator] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
