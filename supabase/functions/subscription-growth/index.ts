import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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

    // Verificar autenticação de super admin
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Verificar se é super admin
    const { data: roleData } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || roleData.role !== 'super_admin') {
      throw new Error("Acesso negado: apenas super admins");
    }

    logStep("Super admin verified");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Buscar todos os owners
    const { data: owners } = await supabaseClient
      .from('organization_members')
      .select('email, user_id')
      .eq('role', 'owner')
      .not('email', 'is', null);

    if (!owners || owners.length === 0) {
      logStep("No owners found");
      return new Response(JSON.stringify({ chartData: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found owners", { count: owners.length });

    // Mapa para armazenar data de início de cada assinatura
    const subscriptionDates: Date[] = [];

    for (const owner of owners) {
      try {
        if (!owner.email) continue;

        const customers = await stripe.customers.list({ 
          email: owner.email, 
          limit: 1 
        });

        if (customers.data.length === 0) continue;

        const customerId = customers.data[0].id;

        // Buscar TODAS as assinaturas (ativas ou não)
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          limit: 100,
        });

        // Adicionar a data de início de cada assinatura
        for (const sub of subscriptions.data) {
          const startDate = new Date(sub.created * 1000);
          subscriptionDates.push(startDate);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logStep(`Error checking owner ${owner.email}`, { error: errorMsg });
      }
    }

    // Ordenar datas
    subscriptionDates.sort((a, b) => a.getTime() - b.getTime());

    logStep("Total subscriptions found", { count: subscriptionDates.length });

    // Agrupar por data e calcular acumulado
    const dateCountMap = new Map<string, number>();
    let cumulativeCount = 0;

    subscriptionDates.forEach(date => {
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      cumulativeCount++;
      dateCountMap.set(dateKey, cumulativeCount);
    });

    // Criar array de dados para o gráfico dos últimos 30 dias
    const chartData: { date: string; count: number }[] = [];
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    // Contar assinaturas que já existiam ANTES dos últimos 30 dias
    let currentCount = subscriptionDates.filter(date => date < thirtyDaysAgo).length;
    logStep("Base count before 30 days", { count: currentCount });

    // Preencher dados diários
    for (let d = new Date(thirtyDaysAgo); d <= today; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      
      // Contar quantas assinaturas foram criadas NESTE dia específico
      const newSubsThisDay = subscriptionDates.filter(date => {
        const subDateKey = date.toISOString().split('T')[0];
        return subDateKey === dateKey;
      }).length;

      // Acumular
      currentCount += newSubsThisDay;

      // Formatar data para exibição (dd/MMM)
      const displayDate = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      
      chartData.push({
        date: displayDate,
        count: currentCount
      });
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
