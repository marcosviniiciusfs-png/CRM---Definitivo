import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const body = await req.json()
    const { target_user_id, admin_password, admin_token } = body

    if (!target_user_id) throw new Error('ID do usuário é obrigatório')

    let isAuthorized = false
    let adminEmail: string | null = null

    if (admin_token) {
      const { data: valid } = await supabaseAdmin.rpc('validate_admin_token', { p_token: admin_token })
      if (valid) {
        isAuthorized = true
        const { data: sess } = await supabaseAdmin
          .from('admin_sessions').select('admin_email')
          .eq('token', admin_token).maybeSingle()
        adminEmail = sess?.admin_email ?? null
      }
    }

    if (!isAuthorized) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const jwt = authHeader.replace('Bearer ', '')
        const userClient = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } }
        )
        const { data: { user } } = await userClient.auth.getUser(jwt)
        if (user) {
          const { data: role } = await supabaseAdmin
            .from('user_roles').select('role')
            .eq('user_id', user.id).eq('role', 'super_admin').maybeSingle()
          if (role) { isAuthorized = true; adminEmail = user.email ?? null }
        }
      }
    }

    if (!isAuthorized) throw new Error('Acesso negado: autenticação inválida')

    if (admin_password && adminEmail) {
      const { data: pwOk } = await supabaseAdmin
        .rpc('check_admin_password', { p_email: adminEmail, p_password: admin_password })
        .maybeSingle().catch(() => ({ data: null }))
      if (!pwOk) throw new Error('Senha incorreta')
    }

    const { data: membership } = await supabaseAdmin
      .from('organization_members').select('organization_id')
      .eq('user_id', target_user_id).maybeSingle()
    const orgId = membership?.organization_id ?? null

    let idsToDelete: string[] = [target_user_id]
    if (orgId) {
      const { data: members } = await supabaseAdmin
        .from('organization_members').select('user_id')
        .eq('organization_id', orgId).not('user_id', 'is', null)
      const ids = (members ?? []).map((m: any) => m.user_id).filter(Boolean)
      idsToDelete = [...new Set([...ids, target_user_id])]

      for (const tbl of ['whatsapp_instances', 'facebook_integrations', 'google_calendar_integrations', 'meta_pixel_integrations']) {
        await supabaseAdmin.from(tbl).delete().eq('organization_id', orgId)
      }
      const { error: orgErr } = await supabaseAdmin.from('organizations').delete().eq('id', orgId)
      if (orgErr) throw new Error('Erro ao deletar organização: ' + orgErr.message)
    }

    for (const uid of idsToDelete) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid)
      if (error) console.error('Erro deletar user', uid, ':', error.message)
    }

    return new Response(
      JSON.stringify({ success: true, deleted_users: idsToDelete.length, organization_id: orgId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro ao excluir usuário' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
