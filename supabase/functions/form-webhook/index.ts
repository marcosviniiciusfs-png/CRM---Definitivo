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

// Função para verificar duplicidade de lead
async function checkDuplicateLead(
  supabase: any,
  organizationId: string,
  telefone: string,
  email?: string
): Promise<{
  isDuplicate: boolean;
  existingLead: any | null;
  hasAdvancedInFunnel: boolean;
  matchType: 'phone' | 'email' | null;
}> {
  // Buscar por telefone (prioridade)
  const { data: leadByPhone } = await supabase
    .from('leads')
    .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history, email, empresa, valor, additional_data')
    .eq('organization_id', organizationId)
    .eq('telefone_lead', telefone)
    .maybeSingle();

  if (leadByPhone) {
    // Verificar se lead avançou no funil
    const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByPhone);
    return {
      isDuplicate: true,
      existingLead: leadByPhone,
      hasAdvancedInFunnel: hasAdvanced,
      matchType: 'phone'
    };
  }

  // Buscar por email como fallback
  if (email) {
    const { data: leadByEmail } = await supabase
      .from('leads')
      .select('id, nome_lead, funnel_id, funnel_stage_id, duplicate_attempts_count, duplicate_attempts_history, email, empresa, valor, additional_data')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle();

    if (leadByEmail) {
      const hasAdvanced = await checkIfLeadAdvanced(supabase, leadByEmail);
      return {
        isDuplicate: true,
        existingLead: leadByEmail,
        hasAdvancedInFunnel: hasAdvanced,
        matchType: 'email'
      };
    }
  }

  return {
    isDuplicate: false,
    existingLead: null,
    hasAdvancedInFunnel: false,
    matchType: null
  };
}

// Verificar se o lead avançou da primeira etapa do funil
async function checkIfLeadAdvanced(supabase: any, lead: any): Promise<boolean> {
  if (!lead.funnel_id || !lead.funnel_stage_id) return false;

  const { data: firstStage } = await supabase
    .from('funnel_stages')
    .select('id')
    .eq('funnel_id', lead.funnel_id)
    .order('position')
    .limit(1)
    .maybeSingle();

  return firstStage && firstStage.id !== lead.funnel_stage_id;
}

// Registrar tentativa de duplicação
async function registerDuplicateAttempt(
  supabase: any,
  existingLeadId: string,
  source: string,
  originalPayload: any
) {
  // Buscar dados atuais
  const { data: lead } = await supabase
    .from('leads')
    .select('duplicate_attempts_count, duplicate_attempts_history')
    .eq('id', existingLeadId)
    .single();

  const currentCount = lead?.duplicate_attempts_count || 0;
  const currentHistory = Array.isArray(lead?.duplicate_attempts_history) ? lead.duplicate_attempts_history : [];

  // Adicionar nova entrada no histórico
  const newEntry = {
    source,
    attempted_at: new Date().toISOString(),
    webhook_token: originalPayload.webhookToken || null,
    original_data: originalPayload.payload || null
  };

  const updatedHistory = [...currentHistory, newEntry];

  // Atualizar lead
  await supabase
    .from('leads')
    .update({
      duplicate_attempts_count: currentCount + 1,
      last_duplicate_attempt_at: new Date().toISOString(),
      duplicate_attempts_history: updatedHistory,
      updated_at: new Date().toISOString()
    })
    .eq('id', existingLeadId);

  console.log(`📊 Tentativa de duplicação registrada para lead ${existingLeadId}. Total: ${currentCount + 1}`);
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

    // Buscar configuração do webhook (incluindo funnel_id direto)
    const { data: webhookConfig, error: webhookError } = await supabase
      .from('webhook_configs')
      .select('id, organization_id, is_active, tag_id, funnel_id, funnel_stage_id')
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

    // Parse payload — preserva TODAS as entradas, inclusive chaves duplicadas
    // (Object.fromEntries descartaria duplicatas; usamos um array de pares)
    let rawEntries: Array<[string, string]> = [];
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const jsonPayload = await req.json();
      // JSON não tem chaves duplicadas; flatten simples serve
      rawEntries = Object.entries(jsonPayload).map(([k, v]) => [k, String(v ?? '')]);
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      // formData.entries() itera TODAS as entradas, inclusive duplicatas
      for (const [key, value] of formData.entries()) {
        rawEntries.push([key, typeof value === 'string' ? value : (value as File).name]);
      }
    } else {
      // Tentar JSON como fallback
      try {
        const jsonPayload = await req.json();
        rawEntries = Object.entries(jsonPayload).map(([k, v]) => [k, String(v ?? '')]);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Formato de dados não suportado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Objeto de payload para logging (última ocorrência de cada chave)
    const payload: WebhookPayload = Object.fromEntries(rawEntries);

    console.log('📦 Payload recebido (campos):', rawEntries.map(([k]) => k));

    // Mapeamento normalizado (tudo em minúsculas) para matching case-insensitive
    // Chave = nome do campo em lowercase; Valor = campo padrão do CRM
    const fieldMappings: Record<string, string> = {
      // Nome
      'nome': 'nome',
      'name': 'nome',
      'nome_lead': 'nome',
      'nome completo': 'nome',
      'full name': 'nome',
      'nome do cliente': 'nome',

      // Telefone / WhatsApp
      'telefone': 'telefone',
      'phone': 'telefone',
      'telefone_lead': 'telefone',
      'whatsapp': 'telefone',
      'whatsapp para contato': 'telefone',
      'celular': 'telefone',
      'mobile': 'telefone',
      'número de whatsapp': 'telefone',
      'numero de whatsapp': 'telefone',
      'seu whatsapp': 'telefone',

      // Email
      'email': 'email',
      'e-mail': 'email',
      'e_mail': 'email',
      'seu email': 'email',
      'seu e-mail': 'email',

      // Empresa
      'empresa': 'empresa',
      'company': 'empresa',
      'nome da empresa': 'empresa',
      'razão social': 'empresa',
      'razao social': 'empresa',

      // Valor
      'valor': 'valor',
      'value': 'valor',
      'valor pretendido (r$)': 'valor',
      'valor_pretendido': 'valor',
      'investimento': 'valor',
      'budget': 'valor',
    };

    // Extrair campos padrão (first-match-wins) e armazenar TUDO em additionalData
    let nome = '';
    let telefone = '';
    let email = '';
    let empresa = '';
    let valor = 0;
    // additionalData recebe TODOS os campos originais (inclusive os mapeados para campos padrão)
    // para que nenhuma pergunta do formulário seja perdida na visualização do CRM
    const additionalData: Record<string, any> = {};

    for (const [key, rawValue] of rawEntries) {
      const value = String(rawValue ?? '').trim();
      const normalizedKey = key.toLowerCase().trim();
      const mappedField = fieldMappings[normalizedKey];

      // ── Sempre armazenar em additionalData com a chave original ──────────────
      // Se a chave já existe (entrada duplicada), converter para array
      if (Object.prototype.hasOwnProperty.call(additionalData, key)) {
        const existing = additionalData[key];
        additionalData[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
      } else {
        additionalData[key] = value;
      }

      // ── Mapear para campo padrão (first-match-wins: só preenche se vazio) ────
      if (mappedField === 'nome' && !nome) {
        nome = value;
      } else if (mappedField === 'telefone' && !telefone) {
        telefone = value;
      } else if (mappedField === 'email' && !email) {
        email = value;
      } else if (mappedField === 'empresa' && !empresa) {
        empresa = value;
      } else if (mappedField === 'valor' && !valor) {
        valor = Number(value) || 0;
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

    // ⚡ VERIFICAR DUPLICIDADE
    console.log('🔍 Verificando duplicidade do lead Webhook...');
    const duplicateCheck = await checkDuplicateLead(
      supabase,
      webhookConfig.organization_id,
      telefone,
      email || undefined
    );

    if (duplicateCheck.isDuplicate && duplicateCheck.existingLead) {
      console.log(`⚠️ Lead duplicado detectado via ${duplicateCheck.matchType}:`, duplicateCheck.existingLead.id);

      // Registrar tentativa de duplicação
      await registerDuplicateAttempt(
        supabase,
        duplicateCheck.existingLead.id,
        'Webhook',
        { payload, webhookToken }
      );

      // Se lead NÃO avançou no funil, atualizar dados
      if (!duplicateCheck.hasAdvancedInFunnel) {
        console.log('📝 Atualizando dados do lead existente (não avançou no funil)');
        
        // Mesclar additional_data
        const existingAdditionalData = duplicateCheck.existingLead.additional_data || {};
        const mergedAdditionalData = {
          ...existingAdditionalData,
          ...additionalData,
          _last_updated_at: new Date().toISOString()
        };

        await supabase
          .from('leads')
          .update({
            email: email || duplicateCheck.existingLead.email,
            empresa: empresa || duplicateCheck.existingLead.empresa,
            valor: valor > 0 ? valor : duplicateCheck.existingLead.valor,
            additional_data: Object.keys(mergedAdditionalData).length > 0 ? mergedAdditionalData : null,
            updated_at: new Date().toISOString()
          })
          .eq('id', duplicateCheck.existingLead.id);
      }

      // Log como duplicado
      await supabase.from('form_webhook_logs').insert({
        organization_id: webhookConfig.organization_id,
        webhook_token: webhookToken,
        event_type: 'form_submission',
        status: 'duplicate',
        payload: payload,
        lead_id: duplicateCheck.existingLead.id,
        error_message: `Lead já existe no CRM (match: ${duplicateCheck.matchType})`
      });

      // Retornar sucesso (para o formulário externo não mostrar erro)
      return new Response(
        JSON.stringify({ 
          success: true, 
          lead_id: duplicateCheck.existingLead.id,
          message: 'Lead atualizado (já existia no CRM)',
          is_duplicate: true
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 🎯 DETERMINAR FUNIL DE DESTINO DO LEAD
    // Ordem de prioridade:
    // 1. funnel_id diretamente no webhook_config (mais confiável)
    // 2. funnel_source_mappings específico (source_identifier = webhook.id)
    // 3. Funil padrão da organização (fallback final)

    console.log('[FORM-WEBHOOK] Webhook ID:', webhookConfig.id);

    let funnelId: string | null = null;
    let funnelStageId: string | null = null;

    // ── 1º: Verificar funnel_id diretamente no webhook_config ──────────────────
    if (webhookConfig.funnel_id) {
      funnelId = webhookConfig.funnel_id;
      funnelStageId = webhookConfig.funnel_stage_id || null;
      console.log('[FORM-WEBHOOK] ✅ Funil obtido diretamente do webhook_config:', funnelId);

      // Se não há stage configurado, buscar a primeira etapa do funil
      if (!funnelStageId) {
        const { data: firstStage } = await supabase
          .from('funnel_stages')
          .select('id')
          .eq('funnel_id', funnelId)
          .order('position')
          .limit(1)
          .maybeSingle();
        if (firstStage) funnelStageId = firstStage.id;
      }
    }

    // ── 2º: Fallback — funnel_source_mappings específico ──────────────────────
    if (!funnelId) {
      console.log('[FORM-WEBHOOK] Sem funnel_id no webhook_config, buscando em funnel_source_mappings...');

      const { data: specificMappings } = await supabase
        .from('funnel_source_mappings')
        .select('funnel_id, target_stage_id')
        .eq('source_type', 'webhook')
        .eq('source_identifier', webhookConfig.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const specificMapping = specificMappings && specificMappings.length > 0 ? specificMappings[0] : null;

      if (specificMapping) {
        funnelId = specificMapping.funnel_id;
        funnelStageId = specificMapping.target_stage_id || null;
        console.log('[FORM-WEBHOOK] ✅ Funil obtido de funnel_source_mappings específico:', funnelId);

        if (!funnelStageId) {
          const { data: firstStage } = await supabase
            .from('funnel_stages')
            .select('id')
            .eq('funnel_id', funnelId)
            .order('position')
            .limit(1)
            .maybeSingle();
          if (firstStage) funnelStageId = firstStage.id;
        }
      }
    }

    // ── 3º: Fallback final — funil padrão da organização ──────────────────────
    if (!funnelId) {
      console.log('[FORM-WEBHOOK] ⚠️ Nenhum funil configurado para webhook', webhookConfig.id, '— usando funil padrão');

      const { data: defaultFunnels } = await supabase
        .from('sales_funnels')
        .select('id')
        .eq('organization_id', webhookConfig.organization_id)
        .eq('is_default', true)
        .order('created_at', { ascending: true })
        .limit(1);

      const defaultFunnel = defaultFunnels && defaultFunnels.length > 0 ? defaultFunnels[0] : null;

      if (defaultFunnel) {
        funnelId = defaultFunnel.id;
        console.log('[FORM-WEBHOOK] Funil padrão encontrado:', funnelId);

        const { data: firstStage } = await supabase
          .from('funnel_stages')
          .select('id')
          .eq('funnel_id', defaultFunnel.id)
          .order('position')
          .limit(1)
          .maybeSingle();

        if (firstStage) funnelStageId = firstStage.id;
      }
    }

    console.log('[FORM-WEBHOOK] Funil final:', funnelId, '| Etapa:', funnelStageId);

    // Preparar dados do lead com sanitização
    const leadData = {
      nome_lead: nome.substring(0, 200),
      telefone_lead: telefone.substring(0, 20),
      email: email ? email.substring(0, 255) : null,
      empresa: empresa ? empresa.substring(0, 200) : null,
      valor: valor,
      stage: 'NOVO',
      source: 'Webhook',
      funnel_id: funnelId,
      funnel_stage_id: funnelStageId,
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

    // ✅ DISTRIBUIR LEAD NA ROLETA
    supabase.functions.invoke('distribute-lead', {
      body: {
        lead_id: lead.id,
        organization_id: webhookConfig.organization_id,
        trigger_source: 'webhook',
        webhook_token: webhookToken,
      },
    }).then(({ data, error }) => {
      if (error) {
        console.error('⚠️ Erro ao distribuir lead:', error);
      } else {
        console.log('✅ Lead distribuído:', data);
      }
    }).catch(err => {
      console.error('⚠️ Falha ao invocar distribute-lead:', err);
    });

    // Processar automações (não bloqueia o retorno)
    supabase.functions.invoke('process-automation-rules', {
      body: {
        trigger_type: 'LEAD_CREATED_FORM_WEBHOOK',
        trigger_data: {
          lead_id: lead.id,
          organization_id: webhookConfig.organization_id,
          webhook_token: webhookToken,
        },
      },
    }).then(({ data, error }) => {
      if (error) {
        console.error('⚠️ Erro ao processar automações:', error);
      } else {
        console.log('✅ Automações processadas:', data);
      }
    }).catch(err => {
      console.error('⚠️ Falha ao invocar process-automation-rules:', err);
    });

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