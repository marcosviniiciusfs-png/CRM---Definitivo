import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
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

  try {
    logStep("Function started");

    const MP_ACCESS_TOKEN = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) throw new Error("MERCADOPAGO_ACCESS_TOKEN not configured");

    const { planId, extraCollaborators = 0 } = await req.json();
    if (!planId || !PLANS[planId]) throw new Error("Invalid planId");
    logStep("Request data", { planId, extraCollaborators });

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const plan = PLANS[planId];
    const totalAmount = plan.price + (extraCollaborators * EXTRA_COLLABORATOR_PRICE);
    const externalReference = `${user.id}|${planId}|${extraCollaborators}`;

    logStep("Creating preapproval", { totalAmount, externalReference });

    // Create preapproval (recurring subscription) via Mercado Pago API
    const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        reason: plan.title + (extraCollaborators > 0 ? ` + ${extraCollaborators} colaborador(es) extra(s)` : ""),
        external_reference: externalReference,
        payer_email: user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: totalAmount,
          currency_id: "BRL",
        },
        back_url: `${req.headers.get("origin")}/success`,
        status: "pending",
      }),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      logStep("MP API error", { status: mpResponse.status, error: errorText });
      throw new Error(`Mercado Pago error: ${mpResponse.status} - ${errorText}`);
    }

    const preapproval = await mpResponse.json();
    logStep("Preapproval created", { id: preapproval.id, init_point: preapproval.init_point });

    return new Response(JSON.stringify({ url: preapproval.init_point }), {
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
