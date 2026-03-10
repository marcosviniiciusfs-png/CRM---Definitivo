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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Token de autorização não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }
    const token = authHeader.replace('Bearer ', '')

    let currentUserId: string
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      currentUserId = payload.sub
      if (!currentUserId) throw new Error('No sub in token')
    } catch {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const body = await req.json()
    const { email, password, name, role, organizationId, custom_role_id } = body

    if (!email || !password || !name || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos: email, senha, nome, cargo e organização são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const emailLower = email.toLowerCase().trim()

    const { data: memberData, error: memberCheckError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', currentUserId)
      .eq('organization_id', organizationId)
      .single()

    if (memberCheckError || !memberData) {
      console.error('Permissão negada:', memberCheckError?.message)
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

    // CORREÇÃO PRINCIPAL: substituído listUsers() por RPC direta em auth.users
    // listUsers() sem paginação causava timeout em produção
    let userId: string | null = null

    try {
      const { data: existingId } = await supabaseAdmin.rpc(
        'get_auth_user_id_by_email',
        { p_email: emailLower }
      )
      if (existingId) {
        userId = existingId as string
        console.log('Usuário existente encontrado:', userId)
      }
    } catch (rpcErr) {
      console.warn('RPC indisponível, prosseguindo para criar novo usuário:', rpcErr)
    }

    if (userId) {
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
        console.error('Erro ao adicionar membro existente:', memberError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível adicionar o colaborador à organização' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    } else {
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
        console.error('Erro no pré-cadastro:', preInsertError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível preparar o cadastro do colaborador' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const { data: newUser, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
        email: emailLower,
        password,
        email_confirm: true,
        user_metadata: { name: name.trim(), full_name: name.trim() }
      })

      if (signUpError || !newUser?.user) {
        await supabaseAdmin
          .from('organization_members')
          .delete()
          .eq('email', emailLower)
          .eq('organization_id', organizationId)
          .is('user_id', null)

        return new Response(
          JSON.stringify({ error: signUpError?.message || 'Não foi possível criar o usuário' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = newUser.user.id
      console.log('Novo usuário criado:', userId)

      await supabaseAdmin
        .from('organization_members')
        .update({ user_id: userId, is_active: true })
        .eq('email', emailLower)
        .eq('organization_id', organizationId)
        .is('user_id', null)

      await supabaseAdmin
        .from('profiles')
        .upsert(
          { user_id: userId, full_name: name.trim(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        )
    }

    return new Response(
      JSON.stringify({ success: true, message: `${name} foi adicionado à organização com sucesso`, userId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Erro inesperado:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
