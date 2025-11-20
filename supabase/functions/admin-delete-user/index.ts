import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteUserRequest {
  target_user_id: string
  admin_password: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('[admin-delete-user] Iniciando processamento...')

    // Criar cliente com service role para operações administrativas
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Criar cliente normal para validação de senha
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Obter o token de autorização
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Token de autorização não fornecido')
    }

    // Verificar usuário autenticado
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      console.error('[admin-delete-user] Erro ao obter usuário:', userError)
      throw new Error('Não autorizado')
    }

    console.log('[admin-delete-user] Usuário autenticado:', user.id)

    // Verificar se é super admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .single()

    if (roleError || !roleData) {
      console.error('[admin-delete-user] Usuário não é super admin:', roleError)
      throw new Error('Acesso negado: apenas super admins podem excluir usuários')
    }

    console.log('[admin-delete-user] Verificação de super admin passou')

    // Parse do body
    const { target_user_id, admin_password }: DeleteUserRequest = await req.json()

    if (!target_user_id || !admin_password) {
      throw new Error('ID do usuário e senha do admin são obrigatórios')
    }

    console.log('[admin-delete-user] Validando senha do super admin...')

    // Validar senha do super admin
    const { error: passwordError } = await supabaseAuth.auth.signInWithPassword({
      email: user.email!,
      password: admin_password
    })

    if (passwordError) {
      console.error('[admin-delete-user] Senha inválida:', passwordError)
      throw new Error('Senha incorreta')
    }

    console.log('[admin-delete-user] Senha validada com sucesso')

    // Buscar informações do usuário alvo
    const { data: targetUserData, error: targetUserError } = await supabaseAdmin.rpc(
      'get_user_details',
      { _target_user_id: target_user_id }
    )

    if (targetUserError || !targetUserData || targetUserData.length === 0) {
      console.error('[admin-delete-user] Erro ao buscar usuário alvo:', targetUserError)
      throw new Error('Usuário não encontrado')
    }

    const targetUser = targetUserData[0]
    console.log('[admin-delete-user] Usuário alvo encontrado:', {
      email: targetUser.email,
      organization_id: targetUser.organization_id
    })

    // Buscar todos os membros da organização (se houver)
    let organizationMembers: any[] = []
    if (targetUser.organization_id) {
      const { data: membersData, error: membersError } = await supabaseAdmin.rpc(
        'get_organization_members',
        { _organization_id: targetUser.organization_id }
      )

      if (!membersError && membersData) {
        organizationMembers = membersData
        console.log('[admin-delete-user] Membros da organização encontrados:', organizationMembers.length)
      }
    }

    // Deletar organização (irá em cascata deletar todos os dados relacionados)
    if (targetUser.organization_id) {
      console.log('[admin-delete-user] Deletando organização:', targetUser.organization_id)
      
      const { error: orgDeleteError } = await supabaseAdmin
        .from('organizations')
        .delete()
        .eq('id', targetUser.organization_id)

      if (orgDeleteError) {
        console.error('[admin-delete-user] Erro ao deletar organização:', orgDeleteError)
        throw new Error(`Erro ao deletar organização: ${orgDeleteError.message}`)
      }

      console.log('[admin-delete-user] Organização deletada com sucesso')
    }

    // Deletar todos os usuários da organização da auth.users
    const userIdsToDelete = organizationMembers
      .filter(m => m.user_id !== null)
      .map(m => m.user_id)

    console.log('[admin-delete-user] Deletando usuários da auth:', userIdsToDelete)

    for (const userId of userIdsToDelete) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)
      
      if (authDeleteError) {
        console.error(`[admin-delete-user] Erro ao deletar usuário ${userId}:`, authDeleteError)
        // Continuar mesmo se houver erro, pois o usuário pode não existir mais
      } else {
        console.log(`[admin-delete-user] Usuário ${userId} deletado com sucesso`)
      }
    }

    console.log('[admin-delete-user] Exclusão concluída com sucesso')

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Usuário, organização e colaboradores excluídos com sucesso',
        deleted_users: userIdsToDelete.length,
        organization_id: targetUser.organization_id
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    console.error('[admin-delete-user] Erro:', error)
    const errorMessage = error instanceof Error ? error.message : 'Erro ao excluir usuário'
    return new Response(
      JSON.stringify({
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
