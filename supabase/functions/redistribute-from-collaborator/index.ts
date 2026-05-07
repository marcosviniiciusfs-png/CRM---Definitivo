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
    const { organization_id, collaborator_user_id, config_id } = await req.json();
    if (!organization_id || !collaborator_user_id) {
      return new Response(JSON.stringify({ error: "organization_id e collaborator_user_id são obrigatórios" }), {
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

    // 4. Verificar que o colaborador existe na org
    const { data: target, error: targetErr } = await supabase
      .from("organization_members")
      .select("id, user_id")
      .eq("user_id", collaborator_user_id)
      .eq("organization_id", organization_id)
      .maybeSingle();
    if (targetErr) throw new Error(`Target lookup: ${targetErr.message}`);
    if (!target) {
      return new Response(JSON.stringify({ error: "Colaborador não encontrado nesta organização" }), {
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

    // 6. Contar leads ativos do colaborador (intent)
    let countQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization_id)
      .eq("responsavel_user_id", collaborator_user_id);
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

    // 7. Desatribuir TODOS os leads ativos do colaborador (operação única)
    let unassignQuery = supabase
      .from("leads")
      .update({ responsavel_user_id: null, responsavel: null })
      .eq("organization_id", organization_id)
      .eq("responsavel_user_id", collaborator_user_id);
    if (closedStageIds.length > 0) {
      unassignQuery = unassignQuery.or(
        `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
      );
    }
    const { error: unassignErr } = await unassignQuery;
    if (unassignErr) throw new Error(`Unassign: ${unassignErr.message}`);

    // 8. Loop: chamar redistributeBatch até esgotar
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
      });
      totalRedistributed += result.redistributed;
      totalSkipped += result.skipped;
      allErrors.push(...result.errors);

      if (!result.hasMore) break;
      // Anti-loop: se nao processou nada mas hasMore, sai
      if (result.redistributed === 0) break;
    }

    const durationMs = Date.now() - startTime;
    console.log(`✅ [redistribute-from-collaborator] ${totalRedistributed}/${totalIntended} redistribuidos em ${durationMs}ms (skipped: ${totalSkipped}, iteracoes: ${iteration})`);

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
