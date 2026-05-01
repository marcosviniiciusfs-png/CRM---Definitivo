import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Validar JWT do caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse body
    const { member_id, organization_id } = await req.json();
    if (!member_id || !organization_id) {
      return new Response(JSON.stringify({ error: "member_id e organization_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Caller é owner da org?
    const { data: callerMember } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!callerMember || callerMember.role !== "owner") {
      return new Response(JSON.stringify({ error: "Apenas o owner pode excluir colaboradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Buscar membro alvo
    const { data: target } = await adminClient
      .from("organization_members")
      .select("id, user_id, role")
      .eq("id", member_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.role === "owner") {
      return new Response(JSON.stringify({ error: "Não é permitido excluir o proprietário" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Não é permitido excluir a si mesmo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUserId = target.user_id; // pode ser null se convite pendente
    const summary = {
      active_leads_unassigned: 0,
      closed_leads_preserved: 0,
      teams_as_leader_cleared: 0,
      roulettes_cleaned: 0,
      auth_deleted: false,
    };

    if (targetUserId) {
      // Passo 1: limpar liderança em equipes (set leader_id = NULL)
      const { count: leaderCount, error: leaderErr } = await adminClient
        .from("teams")
        .update({ leader_id: null })
        .eq("leader_id", targetUserId)
        .eq("organization_id", organization_id)
        .select("*", { count: "exact", head: true });
      if (leaderErr) throw new Error(`Step 1 (teams.leader_id): ${leaderErr.message}`);
      summary.teams_as_leader_cleared = leaderCount ?? 0;

      // Passo 2: remover de team_members (apenas equipes desta org)
      const { data: teamRows, error: teamsReadErr } = await adminClient
        .from("teams")
        .select("id")
        .eq("organization_id", organization_id);
      if (teamsReadErr) throw new Error(`Step 2 (teams read): ${teamsReadErr.message}`);
      const teamIds = (teamRows ?? []).map((t: { id: string }) => t.id);
      if (teamIds.length > 0) {
        const { error: tmErr } = await adminClient
          .from("team_members")
          .delete()
          .eq("user_id", targetUserId)
          .in("team_id", teamIds);
        if (tmErr) throw new Error(`Step 2 (team_members): ${tmErr.message}`);
      }

      // Passo 3: remover das roletas (eligible_agents é text[])
      const { data: configs, error: cfgErr } = await adminClient
        .from("lead_distribution_configs")
        .select("id, eligible_agents")
        .eq("organization_id", organization_id);
      if (cfgErr) throw new Error(`Step 3 (lead_distribution_configs read): ${cfgErr.message}`);

      for (const cfg of configs ?? []) {
        const agents: string[] = Array.isArray(cfg.eligible_agents) ? cfg.eligible_agents : [];
        if (agents.includes(targetUserId)) {
          const novo = agents.filter((id) => id !== targetUserId);
          const { error: updErr } = await adminClient
            .from("lead_distribution_configs")
            .update({ eligible_agents: novo })
            .eq("id", cfg.id);
          if (updErr) throw new Error(`Step 3 (config ${cfg.id} update): ${updErr.message}`);
          summary.roulettes_cleaned++;
        }
      }

      // Passo 4a: identificar estágios won/lost
      const { data: closedStages, error: stagesErr } = await adminClient
        .from("funnel_stages")
        .select("id")
        .in("stage_type", ["won", "lost"]);
      if (stagesErr) throw new Error(`Step 4a (funnel_stages): ${stagesErr.message}`);
      const closedStageIds = (closedStages ?? []).map((s: { id: string }) => s.id);

      // Passo 4b: leads ativos — zerar responsavel_user_id E responsavel (texto)
      // Filtro: funnel_stage_id IS NULL OR NOT IN (won/lost) — 3VL-safe via .or()
      let activeQuery = adminClient
        .from("leads")
        .update({ responsavel_user_id: null, responsavel: null })
        .eq("organization_id", organization_id)
        .eq("responsavel_user_id", targetUserId);
      if (closedStageIds.length > 0) {
        activeQuery = activeQuery.or(
          `funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedStageIds.join(",")})`
        );
      }
      const { count: activeCount, error: activeErr } = await activeQuery
        .select("*", { count: "exact", head: true });
      if (activeErr) throw new Error(`Step 4b (active leads): ${activeErr.message}`);
      summary.active_leads_unassigned = activeCount ?? 0;

      // Passo 4c: leads fechados — zerar SÓ responsavel_user_id; campo "responsavel" (texto) preserva nome
      if (closedStageIds.length > 0) {
        const { count: closedCount, error: closedErr } = await adminClient
          .from("leads")
          .update({ responsavel_user_id: null })
          .eq("organization_id", organization_id)
          .eq("responsavel_user_id", targetUserId)
          .in("funnel_stage_id", closedStageIds)
          .select("*", { count: "exact", head: true });
        if (closedErr) throw new Error(`Step 4c (closed leads): ${closedErr.message}`);
        summary.closed_leads_preserved = closedCount ?? 0;
      }
    }

    // Passo 5: deletar o vínculo organization_members
    const { error: memDelErr } = await adminClient
      .from("organization_members")
      .delete()
      .eq("id", member_id);
    if (memDelErr) throw new Error(`Step 5 (organization_members delete): ${memDelErr.message}`);

    // Passo 6: hard-delete do usuário em auth.users (só se tiver user_id)
    if (targetUserId) {
      const { error: authDelErr } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (authDelErr) {
        // Não rollback — o vínculo já foi removido. Log e retorna sucesso parcial.
        console.error(`[delete-organization-member] Step 6 falhou:`, authDelErr);
        return new Response(JSON.stringify({
          success: true,
          summary: { ...summary, auth_deleted: false },
          warning: `Vínculo removido, mas auth.users não foi deletado: ${authDelErr.message}. Use o admin panel para finalizar.`,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      summary.auth_deleted = true;
    }

    return new Response(JSON.stringify({ success: true, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[delete-organization-member] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
