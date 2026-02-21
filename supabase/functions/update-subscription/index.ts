import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-SUBSCRIPTION] ${step}${detailsStr}`);
};

const PLANS: Record<string, { price: number; maxCollaborators: number; title: string }> = {
  star: { price: 47.99, maxCollaborators: 5, title: "Kairoz Star" },
  pro: { price: 197.99, maxCollaborators: 15, title: "Kairoz Pro" },
  elite: { price: 499.00, maxCollaborators: 30, title: "Kairoz Elite" },
};

const EXTRA_COLLABORATOR_PRICE = 25.00;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { action, quantity, newPlanId } = await req.json();
    logStep("Request data", { action, quantity, newPlanId });

    // Get current subscription
    const { data: currentSub, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "authorized")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw subError;
    if (!currentSub) throw new Error("No active subscription found");
    logStep("Current subscription", { planId: currentSub.plan_id, mpId: currentSub.mp_preapproval_id });

    if (action === "add_collaborators") {
      if (!quantity || quantity < 1) throw new Error("Quantity must be at least 1");

      const newExtraCount = (currentSub.extra_collaborators || 0) + quantity;
      const plan = PLANS[currentSub.plan_id];
      if (!plan) throw new Error("Invalid plan in subscription");

      const newAmount = plan.price + (newExtraCount * EXTRA_COLLABORATOR_PRICE);

      // Update preapproval amount in Mercado Pago
      const mpResponse = await fetch(
        `https://api.mercadopago.com/preapproval/${currentSub.mp_preapproval_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({
            auto_recurring: {
              transaction_amount: newAmount,
            },
            reason: plan.title + ` + ${newExtraCount} colaborador(es) extra(s)`,
          }),
        }
      );

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        logStep("MP update error", { status: mpResponse.status, error: errorText });
        throw new Error(`Mercado Pago error: ${mpResponse.status}`);
      }

      // Update local DB
      await supabaseAdmin
        .from("subscriptions")
        .update({
          extra_collaborators: newExtraCount,
          amount: newAmount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentSub.id);

      logStep("Collaborators added", { newExtraCount, newAmount });

      return new Response(JSON.stringify({
        success: true,
        message: `${quantity} colaborador(es) extra(s) adicionado(s)! Novo valor: R$ ${newAmount.toFixed(2)}/mês`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "upgrade_plan") {
      if (!newPlanId || !PLANS[newPlanId]) throw new Error("Invalid newPlanId");

      const planOrder = ["star", "pro", "elite"];
      const currentIndex = planOrder.indexOf(currentSub.plan_id);
      const newIndex = planOrder.indexOf(newPlanId);
      if (newIndex <= currentIndex) throw new Error("Can only upgrade to a higher plan");

      // Cancel current preapproval
      await fetch(
        `https://api.mercadopago.com/preapproval/${currentSub.mp_preapproval_id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        }
      );

      // Mark old subscription as cancelled
      await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", currentSub.id);

      // Create new preapproval with upgraded plan
      const newPlan = PLANS[newPlanId];
      const extraCollabs = currentSub.extra_collaborators || 0;
      const newAmount = newPlan.price + (extraCollabs * EXTRA_COLLABORATOR_PRICE);
      const externalReference = `${user.id}|${newPlanId}|${extraCollabs}`;

      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          reason: newPlan.title + (extraCollabs > 0 ? ` + ${extraCollabs} colaborador(es) extra(s)` : ""),
          external_reference: externalReference,
          payer_email: user.email,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: newAmount,
            currency_id: "BRL",
          },
          back_url: `${req.headers.get("origin")}/success`,
          status: "pending",
        }),
      });

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        throw new Error(`Mercado Pago error: ${mpResponse.status} - ${errorText}`);
      }

      const newPreapproval = await mpResponse.json();
      logStep("New preapproval created for upgrade", { id: newPreapproval.id });

      return new Response(JSON.stringify({
        success: true,
        url: newPreapproval.init_point,
        message: "Redirecionando para o checkout do novo plano...",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
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
