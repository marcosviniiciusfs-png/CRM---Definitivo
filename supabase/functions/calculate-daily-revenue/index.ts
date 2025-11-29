import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    if (!STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY não configurada');
    }

    // Obter início e fim do dia atual
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime() / 1000;

    console.log(`[calculate-daily-revenue] Buscando assinaturas criadas hoje entre ${new Date(startOfDay * 1000).toISOString()} e ${new Date(endOfDay * 1000).toISOString()}`);

    // Buscar todas as assinaturas criadas hoje
    const subscriptionsResponse = await fetch(
      `https://api.stripe.com/v1/subscriptions?created[gte]=${Math.floor(startOfDay)}&created[lte]=${Math.floor(endOfDay)}&limit=100`,
      {
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );

    if (!subscriptionsResponse.ok) {
      const errorText = await subscriptionsResponse.text();
      console.error('[calculate-daily-revenue] Erro ao buscar assinaturas:', errorText);
      throw new Error(`Erro ao buscar assinaturas do Stripe: ${subscriptionsResponse.status}`);
    }

    const subscriptionsData = await subscriptionsResponse.json();
    console.log(`[calculate-daily-revenue] Total de assinaturas criadas hoje: ${subscriptionsData.data.length}`);

    // Calcular receita do dia (soma dos valores das assinaturas criadas hoje)
    let dailyRevenue = 0;
    for (const subscription of subscriptionsData.data) {
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        // Somar o valor de todos os items da assinatura
        for (const item of subscription.items.data) {
          const amount = item.price.unit_amount || 0;
          dailyRevenue += amount;
        }
      }
    }

    // Converter de centavos para reais
    const dailyRevenueInReais = dailyRevenue / 100;

    console.log(`[calculate-daily-revenue] Receita do dia: R$ ${dailyRevenueInReais.toFixed(2)}`);

    return new Response(
      JSON.stringify({ 
        dailyRevenue: dailyRevenueInReais,
        subscriptionsToday: subscriptionsData.data.length
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('[calculate-daily-revenue] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        dailyRevenue: 0,
        subscriptionsToday: 0
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});