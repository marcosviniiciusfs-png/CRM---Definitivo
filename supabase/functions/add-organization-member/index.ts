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
        JSON.stringify({ error: 'Token não fornecido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    let currentUserId: string
    try {
      const payload = JSON.parse(atob(authHeader.replace('Bearer ', '').split('.')[1]))
      currentUserId = payload.sub
      if (!currentUserId) throw new Error('sub vazio')
    } catch {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { email, password, name, role, organizationId, custom_role_id } = await req.json()

    if (!email || !password || !name || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos: email, senha, nome, cargo e organização são obrigatórios' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const emailLower = email.toLowerCase().trim()

    const { data: callerMember, error: callerErr } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', currentUserId)
      .eq('organization_id', organizationId)
      .single()

    if (callerErr || !callerMember) {
      console.error('Caller não é membro da org:', callerErr?.message)
      return new Response(
        JSON.stringify({ error: 'Você não tem permissão para adicionar membros a esta organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    if (callerMember.role !== 'owner' && callerMember.role !== 'admin') {
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

    // CORREÇÃO PRINCIPAL: listUsers() sem paginação causava timeout em produção
    // Substituído por RPC que faz SELECT direto em auth.users por email
    let userId: string | null = null

    try {
      const { data: foundId, error: rpcErr } = await supabaseAdmin.rpc(
        'get_auth_user_id_by_email',
        { p_email: emailLower }
      )
      if (!rpcErr && foundId) {
        userId = foundId as string
        console.log('Usuário existente encontrado via RPC:', userId)
      }
    } catch (e) {
      console.warn('RPC get_auth_user_id_by_email não disponível:', e)
    }

    if (userId) {
      const { error: insertErr } = await supabaseAdmin
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

      if (insertErr) {
        return new Response(
          JSON.stringify({ error: `Erro ao adicionar à organização: ${insertErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    } else {
      const { error: preErr } = await supabaseAdmin
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: null,
          role,
          email: emailLower,
          display_name: name.trim(),
          custom_role_id: custom_role_id || null
        })

      if (preErr) {
        return new Response(
          JSON.stringify({ error: `Erro ao preparar cadastro: ${preErr.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      const { data: newUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: emailLower,
        password,
        email_confirm: true,
        user_metadata: { name: name.trim(), full_name: name.trim() }
      })

      if (createErr || !newUser?.user) {
        await supabaseAdmin
          .from('organization_members')
          .delete()
          .eq('email', emailLower)
          .eq('organization_id', organizationId)
          .is('user_id', null)

        return new Response(
          JSON.stringify({ error: createErr?.message || 'Não foi possível criar o usuário' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = newUser.user.id

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
