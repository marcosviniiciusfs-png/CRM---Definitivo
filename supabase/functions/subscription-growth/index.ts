import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SUBSCRIPTION-GROWTH] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    if (!userData.user) throw new Error("User not authenticated");

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();

    if (!roleData || roleData.role !== "super_admin") throw new Error("Access denied");
    logStep("Super admin verified");

    // Get all subscriptions ordered by created_at
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from("subscriptions")
      .select("created_at, status")
      .order("created_at", { ascending: true });

    if (subError) throw subError;

    // Build chart data for last 30 days
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Count subs before the 30-day window
    let currentCount = (subscriptions || []).filter(s => {
      const d = new Date(s.created_at);
      return d < thirtyDaysAgo && (s.status === "authorized" || s.status === "pending");
    }).length;

    const chartData: { date: string; count: number }[] = [];

    for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split("T")[0];

      const newSubs = (subscriptions || []).filter(s => {
        const subDate = new Date(s.created_at).toISOString().split("T")[0];
        return subDate === dateKey && (s.status === "authorized" || s.status === "pending");
      }).length;

      currentCount += newSubs;
      const displayDate = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
      chartData.push({ date: displayDate, count: currentCount });
    }

    logStep("Chart data generated", { points: chartData.length });

    return new Response(JSON.stringify({ chartData }), {
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
