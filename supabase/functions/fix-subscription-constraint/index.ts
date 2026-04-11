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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    console.log('[FIX-CONSTRAINT] Iniciando correção...')

    // Executar SQL para remover NOT NULL constraint
    const { error: alterError } = await supabaseAdmin.rpc('exec_sql', {
      query: `
        ALTER TABLE public.subscriptions
        ALTER COLUMN user_id DROP NOT NULL;
      `
    }).catch(() => ({ error: { message: 'RPC não disponível' } }))

    if (alterError) {
      console.log('[FIX-CONSTRAINT] Tentando abordagem alternativa...')

      // Tentar via raw SQL
      const { data, error } = await supabaseAdmin
        .from('subscriptions')
        .select('user_id')
        .limit(1)

      console.log('[FIX-CONSTRAINT] Teste de conexão:', { data, error: error?.message })

      return new Response(
        JSON.stringify({
          error: 'Não foi possível executar ALTER TABLE diretamente',
          details: alterError?.message || alterError,
          hint: 'Execute manualmente no SQL Editor: ALTER TABLE public.subscriptions ALTER COLUMN user_id DROP NOT NULL;'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    console.log('[FIX-CONSTRAINT] Constraint removida com sucesso')

    return new Response(
      JSON.stringify({ success: true, message: 'Constraint user_id NOT NULL removida' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error: any) {
    console.error('[FIX-CONSTRAINT] Erro:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Erro interno' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
