import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Verificar autenticação super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !userData.user) {
      throw new Error("Authentication failed");
    }

    logStep("User authenticated", { userId: userData.user.id });

    // Verificar se é super_admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "super_admin")
      .single();

    if (roleError || !roleData) {
      throw new Error("Access denied: super_admin role required");
    }

    logStep("Super admin verified");

    // Buscar todos os owners (usuários principais)
    const { data: owners, error: ownersError } = await supabaseClient
      .from("organization_members")
      .select("user_id, email")
      .eq("role", "owner");

    if (ownersError) {
      throw new Error(`Failed to fetch owners: ${ownersError.message}`);
    }

    logStep("Fetched owners", { count: owners?.length || 0 });

    // Inicializar Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    
    let totalMRR = 0;
    let activeSubscriptionsCount = 0;
    const planCounts = {
      basico: 0,
      profissional: 0,
      enterprise: 0
    };

    // Para cada owner, buscar assinaturas ativas
    for (const owner of owners || []) {
      if (!owner.email) continue;

      try {
        // Buscar customer no Stripe
        const customers = await stripe.customers.list({
          email: owner.email,
          limit: 1,
        });

        if (customers.data.length === 0) {
          logStep("No customer found for owner", { email: owner.email });
          continue;
        }

        const customerId = customers.data[0].id;
        logStep("Found customer", { email: owner.email, customerId });

        // Buscar assinaturas ativas
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
        });

        logStep("Subscriptions found", { 
          email: owner.email, 
          count: subscriptions.data.length 
        });

        // Calcular MRR das assinaturas ativas
        for (const subscription of subscriptions.data) {
          for (const item of subscription.items.data) {
            // Valor em centavos (ou menor unidade da moeda)
            const amount = item.price.unit_amount || 0;
            
            // Converter para valor mensal se necessário
            let monthlyAmount = amount;
            if (item.price.recurring?.interval === "year") {
              monthlyAmount = amount / 12;
            }

            totalMRR += monthlyAmount;
            activeSubscriptionsCount++;

            // Identificar o plano baseado no valor mensal
            if (monthlyAmount === 20000) { // R$ 200 em centavos
              planCounts.basico++;
            } else if (monthlyAmount === 50000) { // R$ 500 em centavos
              planCounts.profissional++;
            } else if (monthlyAmount === 200000) { // R$ 2000 em centavos
              planCounts.enterprise++;
            }

            logStep("Subscription item processed", {
              email: owner.email,
              amount: amount / 100,
              interval: item.price.recurring?.interval,
              monthlyAmount: monthlyAmount / 100
            });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logStep("Error processing owner", { 
          email: owner.email, 
          error: errorMessage
        });
      }
    }

    // Converter de centavos para reais
    const mrrInReais = totalMRR / 100;

    // Preparar dados do gráfico de barras
    const planChartData = [
      { name: 'Básico', count: planCounts.basico, color: '#FFC107' },
      { name: 'Profissional', count: planCounts.profissional, color: '#2196F3' },
      { name: 'Enterprise', count: planCounts.enterprise, color: '#4CAF50' }
    ];

    logStep("MRR calculation complete", { 
      totalMRR: mrrInReais,
      activeSubscriptionsCount,
      planCounts
    });

    return new Response(
      JSON.stringify({ 
        mrr: mrrInReais,
        activeSubscriptionsCount,
        planChartData
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});