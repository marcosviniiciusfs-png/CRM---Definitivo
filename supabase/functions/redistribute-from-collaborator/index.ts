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

    // 6. Contar leads ativos dos colaboradores (intent)
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
    const { count: totalIntended, error: countErr } = await countQuery;
    if (countErr) throw new Error(`Count intended: ${countErr.message}`);

    if (!totalIntended || totalIntended === 0) {
      return new Response(JSON.stringify({
        success: true,
        redistributed_count: 0,
        total_intended: 0,
        skipped: 0,
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7a. Capturar os IDs dos leads que serao desatribuidos.
    // Necessario antes do UPDATE para escopar a redistribuicao posterior
    // SOMENTE a esses leads (evita varrer toda a fila de unassigned da org,
    // que pode ter centenas de leads pre-existentes e fazer a funcao timeout).
    let targetLeadsQuery = supabase
      .from("leads")
      .select("id")
      .eq("organization_id", organization_id)
      .in("responsavel_user_id", collaborator_user_ids);
    if (closedStageIds.length > 0) {
      targetLeadsQuery = targetLeadsQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { data: targetLeads, error: targetLeadsErr } = await targetLeadsQuery;
    if (targetLeadsErr) throw new Error(`Fetch target leads: ${targetLeadsErr.message}`);
    const leadIdsToProcess: string[] = (targetLeads || []).map((l: { id: string }) => l.id);

    if (leadIdsToProcess.length === 0) {
      return new Response(JSON.stringify({
        success: true, redistributed_count: 0, total_intended: 0, skipped: 0,
        message: "Nenhum lead ativo para redistribuir"
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 7b. Desatribuir esses leads (operacao unica, escopada por id)
    const { error: unassignErr } = await supabase
      .from("leads")
      .update({ responsavel_user_id: null, responsavel: null })
      .in("id", leadIdsToProcess);
    if (unassignErr) throw new Error(`Unassign: ${unassignErr.message}`);

    // 8. Loop: redistribuir SOMENTE os leads que acabamos de desatribuir
    let totalRedistributed = 0;
    let totalSkipped = 0;
    let iteration = 0;
    const MAX_ITERATIONS = 500;
    const startTime = Date.now();
    const allErrors: string[] = [];

    while (iteration < MAX_ITERATIONS) {
      iteration++;
      const result = await redistributeBatch(supabase, organization_id, {
        batchSize: 100,
        configId: config_id || null,
        leadIds: leadIdsToProcess,
      });
      totalRedistributed += result.redistributed;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);

      if (!result.hasMore) break;
      // Anti-loop: se nao processou nada mas hasMore, sai
      if (result.redistributed === 0) break;
    }

    const durationMs = Date.now() - startTime;
    console.log(`✅ [redistribute-from-collaborator] ${totalRedistributed}/${totalIntended} redistribuidos de ${collaborator_user_ids.length} colaborador(es) em ${durationMs}ms (skipped: ${totalSkipped}, iteracoes: ${iteration})`);

    return new Response(JSON.stringify({
      success: true,
      redistributed_count: totalRedistributed,
      total_intended: totalIntended,
      skipped: totalSkipped,
      duration_ms: durationMs,
      iterations: iteration,
      errors: allErrors.length > 0 ? allErrors : undefined,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[redistribute-from-collaborator] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
