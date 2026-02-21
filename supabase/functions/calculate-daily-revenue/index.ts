import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get subscriptions created today
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const { data: todaySubs, error } = await supabaseAdmin
      .from("subscriptions")
      .select("amount, status")
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .in("status", ["authorized", "pending"]);

    if (error) throw error;

    let dailyRevenue = 0;
    for (const sub of todaySubs || []) {
      if (sub.status === "authorized") {
        dailyRevenue += Number(sub.amount) || 0;
      }
    }

    console.log(`[calculate-daily-revenue] Receita do dia: R$ ${dailyRevenue.toFixed(2)}, Assinaturas hoje: ${todaySubs?.length || 0}`);

    return new Response(JSON.stringify({
      dailyRevenue,
      subscriptionsToday: todaySubs?.length || 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("[calculate-daily-revenue] Erro:", errorMessage);
    return new Response(JSON.stringify({
      error: errorMessage,
      dailyRevenue: 0,
      subscriptionsToday: 0,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
