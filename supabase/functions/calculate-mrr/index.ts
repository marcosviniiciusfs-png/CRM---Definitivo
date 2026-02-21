import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CALCULATE-MRR] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Verify super_admin auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Authentication failed");

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .single();

    if (!roleData) throw new Error("Access denied: super_admin required");
    logStep("Super admin verified");

    // Query active subscriptions from local table
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_id, amount, extra_collaborators")
      .eq("status", "authorized");

    if (subError) throw subError;

    let totalMRR = 0;
    const planCounts = { star: 0, pro: 0, elite: 0 };

    for (const sub of subscriptions || []) {
      totalMRR += Number(sub.amount) || 0;
      if (sub.plan_id in planCounts) {
        planCounts[sub.plan_id as keyof typeof planCounts]++;
      }
    }

    const planChartData = [
      { name: 'Star', count: planCounts.star, color: '#3B82F6' },
      { name: 'Pro', count: planCounts.pro, color: '#F59E0B' },
      { name: 'Elite', count: planCounts.elite, color: '#8B5CF6' },
    ];

    logStep("MRR calculated", { totalMRR, planCounts, activeCount: subscriptions?.length || 0 });

    return new Response(JSON.stringify({
      mrr: totalMRR,
      activeSubscriptionsCount: subscriptions?.length || 0,
      planChartData,
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
