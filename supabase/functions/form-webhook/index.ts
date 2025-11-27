import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookPayload {
  nome?: string;
  name?: string;
  nome_lead?: string;
  telefone?: string;
  phone?: string;
  telefone_lead?: string;
  email?: string;
  empresa?: string;
  company?: string;
  valor?: string | number;
  [key: string]: any;
}

// Simple validation function
function validateLeadData(nome: string, telefone: string): { valid: boolean; error?: string } {
  // Validate nome
  if (!nome || nome.trim().length === 0) {
    return { valid: false, error: 'Nome não pode estar vazio' };
  }
  if (nome.length > 200) {
    return { valid: false, error: 'Nome muito longo (máximo 200 caracteres)' };
  }

  // Validate telefone
  if (!telefone || telefone.trim().length === 0) {
    return { valid: false, error: 'Telefone não pode estar vazio' };
  }
  // Remove non-numeric characters for validation
  const cleanPhone = telefone.replace(/\D/g, '');
  if (cleanPhone.length < 8 || cleanPhone.length > 15) {
    return { valid: false, error: 'Telefone inválido (deve ter entre 8 e 15 dígitos)' };
  }

  return { valid: true };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const webhookToken = pathParts[pathParts.length - 1];

  console.log('🔗 Webhook chamado:', {
    method: req.method,
    path: url.pathname,
    webhookToken: webhookToken ? 'presente' : 'ausente',
    timestamp: new Date().toISOString(),
  });

  try {
    // Verificar se o token foi fornecido
    if (!webhookToken || webhookToken === 'form-webhook' || webhookToken.length < 32) {
      console.error('❌ Token inválido:', webhookToken);
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Token de webhook inválido ou ausente',
          message: 'Certifique-se de usar a URL completa do webhook fornecida nas configurações'
        }),
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
      .select('organization_id, is_active, tag_id')
      .eq('webhook_token', webhookToken)
      .single();

    if (webhookError || !webhookConfig) {
      console.error('❌ Webhook não encontrado para token');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Webhook não encontrado',
          message: 'O token fornecido não corresponde a nenhum webhook ativo'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!webhookConfig.is_active) {
      console.warn('⚠️ Webhook inativo');
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Webhook inativo',
          message: 'Este webhook foi desativado. Ative-o nas configurações do CRM.'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Webhook válido para organização:', webhookConfig.organization_id);

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

    console.log('📦 Payload recebido (campos):', Object.keys(payload));

    // Mapear campos longos para campos padrão
    const fieldMappings: Record<string, string> = {
      // Nome
      'nome': 'nome',
      'name': 'nome',
      'nome_lead': 'nome',
      'Nome Completo': 'nome',
      'nome completo': 'nome',
      'Nome': 'nome',
      
      // Telefone
      'telefone': 'telefone',
      'phone': 'telefone',
      'telefone_lead': 'telefone',
      'WhatsApp': 'telefone',
      'whatsapp': 'telefone',
      'WhatsApp para contato': 'telefone',
      
      // Email
      'email': 'email',
      'e-mail': 'email',
      'Email': 'email',
      
      // Empresa
      'empresa': 'empresa',
      'company': 'empresa',
      'Empresa': 'empresa',
      
      // Valor
      'valor': 'valor',
      'value': 'valor',
      'Valor Pretendido (R$)': 'valor',
      'valor_pretendido': 'valor',
    };

    // Extrair campos mapeados
    let nome = '';
    let telefone = '';
    let email = '';
    let empresa = '';
    let valor = 0;
    const additionalData: Record<string, any> = {};

    // Processar payload
    for (const [key, value] of Object.entries(payload)) {
      const mappedKey = fieldMappings[key] || fieldMappings[key.toLowerCase()];
      
      if (mappedKey === 'nome') {
        nome = String(value || '').trim();
      } else if (mappedKey === 'telefone') {
        telefone = String(value || '').trim();
      } else if (mappedKey === 'email') {
        email = String(value || '').trim();
      } else if (mappedKey === 'empresa') {
        empresa = String(value || '').trim();
      } else if (mappedKey === 'valor') {
        valor = Number(value) || 0;
      } else {
        // Todos os outros campos vão para additional_data
        additionalData[key] = value;
      }
    }

    console.log('📋 Campos mapeados:', { nome, telefone, email, empresa, valor });
    console.log('📝 Dados adicionais:', additionalData);

    // Validate data
    const validation = validateLeadData(nome, telefone);
    if (!validation.valid) {
      console.error('❌ Validação falhou:', validation.error);
      
      // Log validation error
      await supabase.from('form_webhook_logs').insert({
        organization_id: webhookConfig.organization_id,
        webhook_token: webhookToken,
        event_type: 'form_submission',
        status: 'error',
        payload: payload,
        error_message: validation.error
      });
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Dados inválidos', 
          message: validation.error,
          required_fields: {
            nome: 'string (obrigatório, máx 200 caracteres)',
            telefone: 'string (obrigatório, 8-15 dígitos)'
          },
          optional_fields: {
            email: 'string (opcional)',
            empresa: 'string (opcional)',
            valor: 'number (opcional)'
          }
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Preparar dados do lead com sanitização
    const leadData = {
      nome_lead: nome.substring(0, 200),
      telefone_lead: telefone.substring(0, 20),
      email: email ? email.substring(0, 255) : null,
      empresa: empresa ? empresa.substring(0, 200) : null,
      valor: valor,
      stage: 'NOVO',
      source: 'Webhook',
      organization_id: webhookConfig.organization_id,
      // Salvar dados adicionais como JSON
      additional_data: Object.keys(additionalData).length > 0 ? additionalData : null,
    };

    console.log('💾 Criando lead para organização:', webhookConfig.organization_id);

    // Inserir lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single();

    if (leadError) {
      console.error('❌ Erro ao criar lead:', leadError.message);
      
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
        JSON.stringify({ 
          success: false,
          error: 'Erro ao criar lead', 
          message: 'Ocorreu um erro ao salvar o lead no banco de dados. Tente novamente.'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Lead criado com sucesso:', lead.id);

    // Assign tag if webhook has one configured
    if (webhookConfig.tag_id) {
      const { error: tagError } = await supabase
        .from('lead_tag_assignments')
        .insert({
          lead_id: lead.id,
          tag_id: webhookConfig.tag_id
        });
      
      if (tagError) {
        console.error('⚠️ Erro ao atribuir tag ao lead:', tagError);
        // Não falhar a requisição se a tag não puder ser atribuída
      } else {
        console.log('✅ Tag atribuída ao lead');
      }
    }

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
        message: 'Lead criado com sucesso no CRM'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Erro interno do servidor',
        message: 'Ocorreu um erro inesperado. Entre em contato com o suporte.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});