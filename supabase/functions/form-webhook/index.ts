import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  nome?: string;
  telefone?: string;
  email?: string;
  empresa?: string;
  valor?: string | number;
  [key: string]: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const webhookToken = url.pathname.split('/').pop();

  console.log('🔗 Webhook chamado:', {
    method: req.method,
    webhookToken,
    timestamp: new Date().toISOString(),
  });

  try {
    // Verificar se o token foi fornecido
    if (!webhookToken || webhookToken === 'form-webhook') {
      return new Response(
        JSON.stringify({ error: 'Token de webhook inválido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializar Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Buscar configuração do webhook
    const { data: webhookConfig, error: webhookError } = await supabase
      .from('webhook_configs')
      .select('organization_id, is_active')
      .eq('webhook_token', webhookToken)
      .single();

    if (webhookError || !webhookConfig) {
      console.error('❌ Webhook não encontrado:', webhookError);
      
      // Try to get payload for logging even on error
      let errorPayload: WebhookPayload = {};
      try {
        const contentType = req.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          errorPayload = await req.json();
        }
      } catch {
        // Ignore payload parsing errors for invalid webhook
      }
      
      return new Response(
        JSON.stringify({ error: 'Webhook não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhookConfig.is_active) {
      console.warn('⚠️ Webhook inativo');
      return new Response(
        JSON.stringify({ error: 'Webhook inativo' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload (suporta JSON e form data)
    let payload: WebhookPayload = {};
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      payload = await req.json();
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      // Tentar JSON como fallback
      try {
        payload = await req.json();
      } catch {
        return new Response(
          JSON.stringify({ error: 'Formato de dados não suportado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('📦 Payload recebido:', payload);

    // Validar campos obrigatórios
    const nome = payload.nome || payload.name || payload.nome_lead;
    const telefone = payload.telefone || payload.phone || payload.telefone_lead;

    if (!nome || !telefone) {
      // Log validation error
      await supabase.from('form_webhook_logs').insert({
        organization_id: webhookConfig.organization_id,
        webhook_token: webhookToken,
        event_type: 'form_submission',
        status: 'error',
        payload: payload,
        error_message: 'Campos obrigatórios ausentes: nome e telefone'
      });
      
      return new Response(
        JSON.stringify({ 
          error: 'Campos obrigatórios ausentes', 
          required: ['nome', 'telefone'],
          received: Object.keys(payload)
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Preparar dados do lead
    const leadData = {
      nome_lead: String(nome),
      telefone_lead: String(telefone),
      email: payload.email || null,
      empresa: payload.empresa || payload.company || null,
      valor: payload.valor ? Number(payload.valor) : 0,
      stage: 'NOVO',
      source: 'Webhook',
      organization_id: webhookConfig.organization_id,
    };

    // Inserir lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (leadError) {
      console.error('❌ Erro ao criar lead:', leadError);
      
      // Log failure
      await supabase.from('form_webhook_logs').insert({
        organization_id: webhookConfig.organization_id,
        webhook_token: webhookToken,
        event_type: 'form_submission',
        status: 'error',
        payload: payload,
        error_message: leadError.message
      });
      
      return new Response(
        JSON.stringify({ error: 'Erro ao criar lead', details: leadError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Lead criado com sucesso:', lead.id);

    // Log success
    await supabase.from('form_webhook_logs').insert({
      organization_id: webhookConfig.organization_id,
      webhook_token: webhookToken,
      event_type: 'form_submission',
      status: 'success',
      payload: payload,
      lead_id: lead.id
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        lead_id: lead.id,
        message: 'Lead criado com sucesso'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});