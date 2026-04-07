import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function logStep(step: string, details: Record<string, unknown> = {}) {
  const detailsStr = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      }
    );

    // Get the current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      logStep("ERROR", { message: "Usuário não autenticado" });
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    // Buscar organização do usuário
    const { data: memberData } = await supabaseClient
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    // Fallback inteligente: novas contas = 5 colaboradores, contas existentes = 20 ou mais
    let maxCollaborators = 5; // Default para novas contas

    if (memberData?.organization_id) {
      // Contar membros existentes na organização
      const { count } = await supabaseClient
        .from("organization_members")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", memberData.organization_id);

      if (count && count > 0) {
        // Conta existente: mínimo 20, ou mais se já tiver mais membros
        maxCollaborators = Math.max(20, count);
        logStep("Organização existente", { members: count, limit: maxCollaborators });
      } else {
        logStep("Nova organização", { limit: maxCollaborators });
      }
    } else {
      logStep("Sem organização", { limit: maxCollaborators });
    }

    // Buscar assinatura ativa (se existir)
    const { data: subscription } = await supabaseClient
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    let totalCollaborators = maxCollaborators;

    if (subscription) {
      // Se tem assinatura, usar limite da assinatura
      totalCollaborators = 5 + (subscription.extra_collaborators || 0);
      logStep("Assinatura ativa encontrada", { total: totalCollaborators });
    }

    return new Response(JSON.stringify({
      subscribed: !!subscription,
      product_id: subscription?.plan_id || "free",
      subscription_end: subscription?.end_date || null,
      max_collaborators: totalCollaborators,
      extra_collaborators: subscription?.extra_collaborators || 0,
      total_collaborators: totalCollaborators,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
