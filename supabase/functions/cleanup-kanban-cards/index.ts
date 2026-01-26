import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    console.log('[CLEANUP] Starting kanban cards cleanup...')

    // Buscar colunas com auto-delete habilitado
    const { data: columns, error: colError } = await supabaseAdmin
      .from('kanban_columns')
      .select('id, title, auto_delete_hours')
      .eq('auto_delete_enabled', true)
      .not('auto_delete_hours', 'is', null)

    if (colError) {
      console.error('[CLEANUP] Error fetching columns:', colError)
      throw colError
    }

    console.log('[CLEANUP] Found columns with auto-delete:', columns?.length || 0)

    let totalDeleted = 0
    const deletedDetails: { columnTitle: string; count: number }[] = []

    for (const column of columns || []) {
      // Calcular threshold time baseado em auto_delete_hours
      const hoursAgo = new Date()
      hoursAgo.setHours(hoursAgo.getHours() - (column.auto_delete_hours || 72))

      console.log(`[CLEANUP] Processing column "${column.title}" - deleting cards older than ${column.auto_delete_hours}h (threshold: ${hoursAgo.toISOString()})`)

      // Buscar cards antigos para log
      const { data: oldCards, error: findError } = await supabaseAdmin
        .from('kanban_cards')
        .select('id, content, created_at')
        .eq('column_id', column.id)
        .lt('created_at', hoursAgo.toISOString())

      if (findError) {
        console.error(`[CLEANUP] Error finding old cards in column ${column.id}:`, findError)
        continue
      }

      if (!oldCards || oldCards.length === 0) {
        console.log(`[CLEANUP] No old cards found in column "${column.title}"`)
        continue
      }

      console.log(`[CLEANUP] Found ${oldCards.length} cards to delete in column "${column.title}"`)

      // Primeiro, deletar os assignees dos cards (para evitar FK constraint)
      const cardIds = oldCards.map(c => c.id)
      
      const { error: assigneesError } = await supabaseAdmin
        .from('kanban_card_assignees')
        .delete()
        .in('card_id', cardIds)

      if (assigneesError) {
        console.error(`[CLEANUP] Error deleting assignees:`, assigneesError)
      }

      // Deletar os cards
      const { data: deleted, error: delError } = await supabaseAdmin
        .from('kanban_cards')
        .delete()
        .in('id', cardIds)
        .select('id')

      if (delError) {
        console.error(`[CLEANUP] Error deleting cards in column ${column.id}:`, delError)
        continue
      }

      if (deleted) {
        totalDeleted += deleted.length
        deletedDetails.push({ columnTitle: column.title, count: deleted.length })
        console.log(`[CLEANUP] Deleted ${deleted.length} cards from column "${column.title}"`)
      }
    }

    console.log(`[CLEANUP] Cleanup complete. Total deleted: ${totalDeleted}`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: totalDeleted,
        details: deletedDetails,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    console.error('[CLEANUP] Error:', error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
