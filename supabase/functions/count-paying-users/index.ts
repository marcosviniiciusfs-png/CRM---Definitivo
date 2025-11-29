import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verificar se é super admin
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleData?.role !== "super_admin") {
      throw new Error("Access denied: super admin only");
    }

    console.log("[COUNT-PAYING-USERS] Iniciando contagem de usuários pagantes...");

    // Buscar todos os owners
    const { data: owners, error: ownersError } = await supabaseClient
      .from("organization_members")
      .select(`
        user_id,
        email,
        organization_id
      `)
      .eq("role", "owner");

    if (ownersError) {
      console.error("[COUNT-PAYING-USERS] Erro ao buscar owners:", ownersError);
      throw ownersError;
    }

    console.log(`[COUNT-PAYING-USERS] Encontrados ${owners?.length || 0} owners`);

    // Configurar Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.warn("[COUNT-PAYING-USERS] STRIPE_SECRET_KEY não configurada");
      return new Response(
        JSON.stringify({ count: 0, error: "Stripe não configurado" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Verificar quantos têm subscription ativa
    let payingUsersCount = 0;

    for (const owner of owners || []) {
      try {
        // Buscar email do owner
        const ownerEmail = owner.email;
        if (!ownerEmail) continue;

        // Buscar customer no Stripe
        const customers = await stripe.customers.list({ email: ownerEmail, limit: 1 });
        if (customers.data.length === 0) continue;

        const customerId = customers.data[0].id;

        // Verificar subscriptions ativas
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          payingUsersCount++;
          console.log(`[COUNT-PAYING-USERS] ✅ Owner ${ownerEmail} tem subscription ativa`);
        }
      } catch (error) {
        console.warn(`[COUNT-PAYING-USERS] Erro ao verificar owner ${owner.email}:`, error);
        // Continuar para o próximo owner
      }
    }

    console.log(`[COUNT-PAYING-USERS] Total de usuários pagantes: ${payingUsersCount}`);

    return new Response(
      JSON.stringify({ count: payingUsersCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[COUNT-PAYING-USERS] Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
