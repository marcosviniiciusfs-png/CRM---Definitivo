import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

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

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header - returning unsubscribed");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      logStep("Auth failed - returning unsubscribed", { error: userError?.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, updating unsubscribed state");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;
    let maxCollaborators = 0;
    let extraCollaborators = 0;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      
      // Safely handle subscription end date
      if (subscription.current_period_end) {
        try {
          subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logStep("Error parsing subscription end date", { error: errorMsg, rawValue: subscription.current_period_end });
          subscriptionEnd = null;
        }
      }
      
      logStep("Active subscription found", { subscriptionId: subscription.id, endDate: subscriptionEnd });
      
      // Get the main plan product
      const mainItem = subscription.items.data.find((item: any) => 
        item.price.product === "prod_TVqqdFt1DYCcCI" || // Básico
        item.price.product === "prod_TVqr72myTFqI39" || // Profissional
        item.price.product === "prod_TVqrhrzuIdUDcS"    // Enterprise
      );
      
      if (mainItem) {
        productId = mainItem.price.product as string;
        
        // Determine max collaborators based on plan
        if (productId === "prod_TVqqdFt1DYCcCI") maxCollaborators = 5;       // Básico
        else if (productId === "prod_TVqr72myTFqI39") maxCollaborators = 15; // Profissional
        else if (productId === "prod_TVqrhrzuIdUDcS") maxCollaborators = 30; // Enterprise
      }
      
      // Check for extra collaborators
      const extraItem = subscription.items.data.find((item: any) => 
        item.price.product === "prod_TVqy95fQXCZsWI" // Colaborador Extra
      );
      
      if (extraItem) {
        extraCollaborators = extraItem.quantity || 0;
      }
      
      logStep("Determined subscription details", { 
        productId, 
        maxCollaborators, 
        extraCollaborators,
        totalCollaborators: maxCollaborators + extraCollaborators
      });
    } else {
      logStep("No active subscription found");
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd,
      max_collaborators: maxCollaborators,
      extra_collaborators: extraCollaborators,
      total_collaborators: maxCollaborators + extraCollaborators
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
