import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const PLAN_CONFIG: Record<string, { maxCollaborators: number }> = {
  star: { maxCollaborators: 5 },
  pro: { maxCollaborators: 15 },
  elite: { maxCollaborators: 30 },
};

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header - returning unsubscribed");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      logStep("Auth failed", { error: userError?.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse request body for organization_id
    let organizationId: string | null = null;
    try {
      const body = await req.json();
      organizationId = body.organization_id || null;
    } catch {
      // No body - that's okay
    }

    // Determine which user to check subscription for
    let userIdToCheck = user.id;

    if (organizationId) {
      logStep("Organization ID provided, fetching owner", { organizationId });
      const { data: ownerUserId } = await supabaseClient.rpc(
        'get_organization_owner',
        { p_organization_id: organizationId }
      );
      if (ownerUserId) {
        userIdToCheck = ownerUserId;
        logStep("Using owner for subscription check", { ownerUserId });
      }
    }

    // Query local subscriptions table
    const { data: subscription, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("*")
      .eq("user_id", userIdToCheck)
      .eq("status", "authorized")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      logStep("Error querying subscriptions", { error: subError.message });
      throw subError;
    }

    if (!subscription) {
      logStep("No active subscription found", { userIdChecked: userIdToCheck });
      return new Response(JSON.stringify({
        subscribed: false,
        product_id: null,
        plan_id: null,
        subscription_end: null,
        max_collaborators: 0,
        extra_collaborators: 0,
        total_collaborators: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const planConfig = PLAN_CONFIG[subscription.plan_id] || { maxCollaborators: 0 };
    const extraCollaborators = subscription.extra_collaborators || 0;

    logStep("Active subscription found", {
      planId: subscription.plan_id,
      maxCollaborators: planConfig.maxCollaborators,
      extraCollaborators,
      totalCollaborators: planConfig.maxCollaborators + extraCollaborators,
    });

    return new Response(JSON.stringify({
      subscribed: true,
      product_id: subscription.plan_id, // Keep backward compatibility
      plan_id: subscription.plan_id,
      subscription_end: subscription.end_date,
      max_collaborators: planConfig.maxCollaborators,
      extra_collaborators: extraCollaborators,
      total_collaborators: planConfig.maxCollaborators + extraCollaborators,
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
