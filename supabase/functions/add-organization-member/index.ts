import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    // Cliente admin para operações privilegiadas
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Pegar o header de autorização
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      console.log('[ADD-MEMBER] Sem header Authorization')
      return new Response(
        JSON.stringify({ error: 'Token de autorização não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // Cliente com o token do usuário para verificar autenticação
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      console.log('[ADD-MEMBER] Auth failed:', authError?.message)
      return new Response(
        JSON.stringify({ error: 'Token inválido ou expirado. Faça login novamente.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const currentUserId = user.id
    console.log('[ADD-MEMBER] User autenticado:', currentUserId)

    const body = await req.json()
    const { email, password, name, role, organizationId, custom_role_id } = body

    if (!email || !password || !name || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos: email, senha, nome, cargo e organização são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const emailLower = email.toLowerCase().trim()

    // Verificar se o usuário atual é owner/admin na organização
    const { data: memberData, error: memberCheckError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', currentUserId)
      .eq('organization_id', organizationId)
      .single()

    if (memberCheckError || !memberData) {
      console.log('[ADD-MEMBER] Permissão negada:', memberCheckError?.message)
      return new Response(
        JSON.stringify({ error: 'Sem permissão para esta organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (memberData.role !== 'owner' && memberData.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Apenas proprietários e administradores podem adicionar colaboradores' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Calcular limite inteligente de colaboradores
    const { count: totalCount } = await supabaseAdmin
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    let maxCollaborators = 5 // Default para novas contas
    if (totalCount && totalCount > 0) {
      maxCollaborators = Math.max(20, totalCount)
    }
    console.log(`[ADD-MEMBER] Limite: ${maxCollaborators}, Total membros: ${totalCount}`)

    // Verificar limite de colaboradores ativos (excluindo o owner)
    const { count: activeCount, error: countError } = await supabaseAdmin
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .neq('role', 'owner')

    if (!countError && activeCount !== null && activeCount >= maxCollaborators) {
      return new Response(
        JSON.stringify({ error: `Limite de ${maxCollaborators} colaboradores atingido para esta organização` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Verificar se email já existe na organização
    const { data: existingInOrg } = await supabaseAdmin
      .from('organization_members')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', emailLower)
      .maybeSingle()

    if (existingInOrg) {
      return new Response(
        JSON.stringify({ error: 'Este email já está cadastrado nesta organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Verificar se já existe um usuário com esse email
    let userId: string | null = null

    try {
      const { data: existingId } = await supabaseAdmin.rpc(
        'get_auth_user_id_by_email',
        { p_email: emailLower }
      )
      if (existingId) {
        userId = existingId as string
        console.log('[ADD-MEMBER] Usuário existente encontrado:', userId)
      }
    } catch (rpcErr) {
      console.warn('[ADD-MEMBER] RPC indisponível:', rpcErr)
    }

    if (userId) {
      // Usuário já existe - apenas adicionar à organização
      console.log('[ADD-MEMBER] Inserindo membro existente na organização...')
      const { error: memberError } = await supabaseAdmin
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: userId,
          role,
          email: emailLower,
          display_name: name.trim(),
          custom_role_id: custom_role_id || null,
          is_active: true
        })

      if (memberError) {
        console.error('[ADD-MEMBER] Erro ao adicionar membro existente:', memberError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível adicionar o colaborador à organização', details: memberError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      console.log('[ADD-MEMBER] Membro existente adicionado com sucesso')
    } else {
      // Criar novo usuário
      // Primeiro, pré-cadastrar na organização
      console.log('[ADD-MEMBER] Pré-cadastrando na organização (sem user_id)...')
      const { error: preInsertError } = await supabaseAdmin
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: null,
          role,
          email: emailLower,
          display_name: name.trim(),
          custom_role_id: custom_role_id || null
        })

      if (preInsertError) {
        console.error('[ADD-MEMBER] Erro no pré-cadastro:', preInsertError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível preparar o cadastro do colaborador', details: preInsertError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
      console.log('[ADD-MEMBER] Pré-cadastro realizado com sucesso')

      // Criar o usuário no auth
      console.log('[ADD-MEMBER] Criando usuário no auth...')
      let newUser
      try {
        const result = await supabaseAdmin.auth.admin.createUser({
          email: emailLower,
          password,
          email_confirm: true,
          user_metadata: { name: name.trim(), full_name: name.trim() }
        })
        newUser = result.data
        if (result.error) {
          throw result.error
        }
        console.log('[ADD-MEMBER] Resultado createUser:', {
          success: !!newUser?.user,
          error: result.error?.message,
          userId: newUser?.user?.id
        })
      } catch (authError: any) {
        // Limpar pré-cadastro em caso de erro
        console.log('[ADD-MEMBER] Limpando pré-cadastro devido a erro no auth...')
        await supabaseAdmin
          .from('organization_members')
          .delete()
          .eq('email', emailLower)
          .eq('organization_id', organizationId)
          .is('user_id', null)

        // Verificar se é erro de subscription constraint (auth hook configurado)
        const errorMsg = authError?.message || String(authError)
        if (errorMsg.includes('subscriptions') && errorMsg.includes('user_id')) {
          console.error('[ADD-MEMBER] Erro de subscription detectado - auth hook pode estar mal configurado')
          return new Response(
            JSON.stringify({
              error: 'Erro de configuração: Auth Hook está tentando criar subscription incorretamente. Contate o administrador.',
              phase: 'createUser',
              details: errorMsg
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
          )
        }

        console.error('[ADD-MEMBER] Erro ao criar usuário:', errorMsg)
        return new Response(
          JSON.stringify({ error: errorMsg || 'Não foi possível criar o usuário', phase: 'createUser' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      if (!newUser?.user) {
        // Limpar pré-cadastro em caso de erro
        await supabaseAdmin
          .from('organization_members')
          .delete()
          .eq('email', emailLower)
          .eq('organization_id', organizationId)
          .is('user_id', null)

        console.error('[ADD-MEMBER] createUser retornou sem usuário')
        return new Response(
          JSON.stringify({ error: 'Não foi possível criar o usuário - resposta vazia', phase: 'createUser' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = newUser.user.id
      console.log('[ADD-MEMBER] Novo usuário criado:', userId)

      // Criar subscription para o novo usuário (evita erro de auth hooks)
      console.log('[ADD-MEMBER] Criando subscription para novo usuário...')
      const { error: subscriptionError } = await supabaseAdmin
        .from('subscriptions')
        .upsert(
          {
            user_id: userId,
            organization_id: organizationId,
            plan_id: 'enterprise_free',
            status: 'authorized',
            amount: 0,
            start_date: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        )

      if (subscriptionError) {
        console.warn('[ADD-MEMBER] Aviso ao criar subscription:', subscriptionError.message)
        // Não falha o processo - subscription pode já existir ou ter outro tratamento
      } else {
        console.log('[ADD-MEMBER] Subscription criada com sucesso')
      }

      // Atualizar o registro de membro com o user_id
      console.log('[ADD-MEMBER] Atualizando organization_members com user_id...')
      const { error: updateMemberError } = await supabaseAdmin
        .from('organization_members')
        .update({ user_id: userId, is_active: true })
        .eq('email', emailLower)
        .eq('organization_id', organizationId)
        .is('user_id', null)

      if (updateMemberError) {
        console.error('[ADD-MEMBER] Erro ao atualizar membro:', updateMemberError)
      } else {
        console.log('[ADD-MEMBER] Membro atualizado com sucesso')
      }

      // Criar/atualizar profile
      console.log('[ADD-MEMBER] Criando/atualizando profile...')
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert(
          { user_id: userId, full_name: name.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )

      if (profileError) {
        console.error('[ADD-MEMBER] Erro ao criar profile:', profileError)
      } else {
        console.log('[ADD-MEMBER] Profile criado/atualizado com sucesso')
      }
    }

    console.log('[ADD-MEMBER] Sucesso! Colaborador adicionado:', emailLower)

    return new Response(
      JSON.stringify({ success: true, message: `${name} foi adicionado à organização com sucesso`, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('[ADD-MEMBER] Erro inesperado:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
