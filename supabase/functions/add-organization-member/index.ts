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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { email, password, name, role, organizationId } = await req.json()

    if (!email || !password || !name || !role || !organizationId) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const emailLower = email.toLowerCase().trim()

    // Verify the user is part of the organization and has permission
    const { data: memberData, error: memberCheckError } = await supabaseClient
      .from('organization_members')
      .select('role, organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .single()

    if (memberCheckError || !memberData) {
      return new Response(
        JSON.stringify({ error: 'Você não tem permissão para adicionar membros a esta organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Only owners and admins can add members - members cannot invite other users
    if (memberData.role !== 'owner' && memberData.role !== 'admin') {
      console.log(`❌ Usuário ${user.id} com role '${memberData.role}' tentou adicionar membro - NEGADO`);
      return new Response(
        JSON.stringify({ error: 'Acesso negado: apenas proprietários e administradores podem adicionar colaboradores à organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      )
    }

    // Check if user already exists in THIS organization
    const { data: existingInOrg } = await supabaseClient
      .from('organization_members')
      .select('email')
      .eq('organization_id', organizationId)
      .eq('email', emailLower)
      .maybeSingle()

    if (existingInOrg) {
      return new Response(
        JSON.stringify({ error: 'Este email já está cadastrado nesta organização' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    let userId: string | null = null

    // Try to find existing user by email using Admin API
    const { data: existingUsers, error: listError } = await supabaseClient.auth.admin.listUsers()
    
    if (!listError && existingUsers) {
      const existingUser = existingUsers.users.find(u => u.email?.toLowerCase() === emailLower)
      
      if (existingUser) {
        userId = existingUser.id
        console.log('Found existing user:', existingUser.id)
      }
    }

    // If user doesn't exist, create new user
    if (!userId) {
      // IMPORTANTE: Inserir em organization_members ANTES de criar o usuário
      // Isso permite que o trigger handle_new_user detecte que o usuário foi convidado
      const { error: preInsertError } = await supabaseClient
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: null, // Será atualizado pelo trigger após criar o usuário
          role: role,
          email: emailLower
        })

      if (preInsertError) {
        console.error('Error pre-inserting member:', preInsertError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível preparar o convite' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      // Agora cria o usuário - o trigger handle_new_user detectará o email e atualizará o user_id
      const { data: newUser, error: signUpError } = await supabaseClient.auth.admin.createUser({
        email: emailLower,
        password: password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          name: name.trim()
        }
      })

      if (signUpError) {
        console.error('Error creating user:', signUpError)
        // Remove o registro pré-inserido
        await supabaseClient
          .from('organization_members')
          .delete()
          .match({ email: emailLower, organization_id: organizationId })
        
        return new Response(
          JSON.stringify({ error: `Erro ao criar usuário: ${signUpError.message}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      if (!newUser.user) {
        // Remove o registro pré-inserido
        await supabaseClient
          .from('organization_members')
          .delete()
          .match({ email: emailLower, organization_id: organizationId })
        
        return new Response(
          JSON.stringify({ error: 'Não foi possível criar o usuário' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }

      userId = newUser.user.id
      console.log('Created new user:', userId)
    } else {
      // Se o usuário já existe, apenas adiciona à organização
      const { error: memberError } = await supabaseClient
        .from('organization_members')
        .insert({
          organization_id: organizationId,
          user_id: userId,
          role: role,
          email: emailLower
        })

      if (memberError) {
        console.error('Error adding existing member:', memberError)
        return new Response(
          JSON.stringify({ error: 'Não foi possível adicionar o colaborador à organização' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
      }
    }


    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${name} foi adicionado à organização`,
        userId: userId
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno do servidor' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
