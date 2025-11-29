import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-SUBSCRIPTION] ${step}${detailsStr}`);
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
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { action, quantity, newPriceId } = await req.json();
    logStep("Request data", { action, quantity, newPriceId });

    if (!action || !["add_collaborators", "upgrade_plan"].includes(action)) {
      throw new Error("Invalid action. Must be 'add_collaborators' or 'upgrade_plan'");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No Stripe customer found");
    }
    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Find active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    
    if (subscriptions.data.length === 0) {
      throw new Error("No active subscription found");
    }

    const subscription = subscriptions.data[0];
    logStep("Found active subscription", { subscriptionId: subscription.id });

    // Product IDs
    const EXTRA_COLLABORATOR_PRODUCT_ID = "prod_TVqy95fQXCZsWI";
    const PLAN_PRODUCT_IDS = [
      "prod_TVqqdFt1DYCcCI", // Básico
      "prod_TVqr72myTFqI39", // Profissional
      "prod_TVqrhrzuIdUDcS"  // Enterprise
    ];

    if (action === "add_collaborators") {
      // Add or update extra collaborators
      if (!quantity || quantity < 1) {
        throw new Error("Quantity must be at least 1");
      }

      // Find existing extra collaborator item
      const extraItem = subscription.items.data.find((item: any) => 
        item.price.product === EXTRA_COLLABORATOR_PRODUCT_ID
      );

      const items: any[] = [];
      
      if (extraItem) {
        // Update existing item quantity
        items.push({
          id: extraItem.id,
          quantity: (extraItem.quantity || 0) + quantity,
        });
        logStep("Updating existing extra collaborators", { 
          currentQuantity: extraItem.quantity,
          addingQuantity: quantity,
          newQuantity: (extraItem.quantity || 0) + quantity
        });
      } else {
        // Add new item - need to get the price_id for extra collaborators
        const prices = await stripe.prices.list({
          product: EXTRA_COLLABORATOR_PRODUCT_ID,
          active: true,
          limit: 1,
        });
        
        if (prices.data.length === 0) {
          throw new Error("Extra collaborator price not found");
        }

        items.push({
          price: prices.data[0].id,
          quantity: quantity,
        });
        logStep("Adding new extra collaborators item", { quantity });
      }

      // Update subscription
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.id,
        {
          items: items,
          proration_behavior: 'create_prorations',
        }
      );
      
      logStep("Subscription updated with extra collaborators", { 
        subscriptionId: updatedSubscription.id 
      });

      return new Response(JSON.stringify({ 
        success: true, 
        message: `${quantity} colaborador(es) extra(s) adicionado(s) com sucesso!`,
        subscription: updatedSubscription
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });

    } else if (action === "upgrade_plan") {
      // Upgrade to a different plan
      if (!newPriceId) {
        throw new Error("newPriceId is required for upgrade");
      }

      // Find current plan item
      const currentPlanItem = subscription.items.data.find((item: any) => 
        PLAN_PRODUCT_IDS.includes(item.price.product)
      );

      if (!currentPlanItem) {
        throw new Error("Current plan item not found");
      }

      // Verify new price exists
      const newPrice = await stripe.prices.retrieve(newPriceId);
      if (!PLAN_PRODUCT_IDS.includes(newPrice.product as string)) {
        throw new Error("Invalid plan price ID");
      }

      logStep("Upgrading plan", { 
        currentPriceId: currentPlanItem.price.id,
        newPriceId 
      });

      // Update subscription with new plan
      const items: any[] = [
        {
          id: currentPlanItem.id,
          deleted: true, // Remove old plan
        },
        {
          price: newPriceId,
          quantity: 1, // Add new plan
        }
      ];

      const updatedSubscription = await stripe.subscriptions.update(
        subscription.id,
        {
          items: items,
          proration_behavior: 'create_prorations',
        }
      );
      
      logStep("Subscription upgraded successfully", { 
        subscriptionId: updatedSubscription.id 
      });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Plano atualizado com sucesso!",
        subscription: updatedSubscription
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    // Fallback (should not reach here)
    return new Response(JSON.stringify({ error: "Invalid action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in update-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
