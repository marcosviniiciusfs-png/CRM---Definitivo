import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function decryptToken(encryptedToken: string, key: string): Promise<string> {
  if (!encryptedToken || encryptedToken === 'ENCRYPTED_IN_TOKENS_TABLE') return ''
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0))
    const iv = combined.slice(0, 12)
    const data = combined.slice(12)
    const keyData = new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32))
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, ['decrypt'])
    const result = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, data))
    return (result && result.length > 10) ? result : ''
  } catch { return '' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const startTime = Date.now()

  try {
    const body = await req.json().catch(() => ({}))
    const batchOffset = body.batch || 0
    const batchSize = body.batchSize || 60

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!'

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Step 1: Get user tokens with ads_read
    const { data: integrations } = await supabaseAdmin
      .from('facebook_integrations')
      .select('id, page_id, page_name')

    const { data: tokenRows } = await supabaseAdmin
      .from('facebook_integration_tokens')
      .select('integration_id, encrypted_access_token')

    const userTokenMap = new Map<string, string>() // page_id -> user token
    const allUserTokens: string[] = []

    for (const tr of tokenRows || []) {
      const intg = integrations?.find(i => i.id === tr.integration_id)
      if (!intg?.page_id) continue

      const userToken = await decryptToken(tr.encrypted_access_token || '', ENCRYPTION_KEY)
      if (!userToken) continue

      userTokenMap.set(intg.page_id, userToken)
      allUserTokens.push(userToken)
    }

    if (allUserTokens.length === 0) {
      return new Response(JSON.stringify({ error: 'Sem tokens' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
      })
    }

    // Step 2: Get distinct ad_ids from webhook logs (paginated)
    const allAdIds: { adId: string; pageId: string }[] = []
    const seenAdIds = new Set<string>()
    let logPage = 0

    while (true) {
      const from = logPage * 1000
      const { data: logs } = await supabaseAdmin
        .from('facebook_webhook_logs')
        .select('page_id, payload')
        .not('lead_id', 'is', null)
        .range(from, from + 999)

      if (!logs?.length) break

      for (const row of logs) {
        const changes = row.payload?.entry?.[0]?.changes?.[0]?.value
        if (!changes) continue
        const adId = changes.ad_id || changes.adgroup_id
        if (adId && row.page_id && !seenAdIds.has(adId)) {
          seenAdIds.add(adId)
          allAdIds.push({ adId, pageId: row.page_id })
        }
      }

      if (logs.length < 1000) break
      logPage++
    }

    // Apply batch offset
    const batchAdIds = allAdIds.slice(batchOffset, batchOffset + batchSize)
    const totalBatches = Math.ceil(allAdIds.length / batchSize)

    if (batchAdIds.length === 0) {
      return new Response(JSON.stringify({
        message: 'Nenhum ad_id para processar neste batch',
        totalAdIds: allAdIds.length,
        batchOffset,
        totalBatches,
        done: true
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
    }

    // Step 3: Resolve campaign names for this batch
    const campaignCache = new Map<string, { campaignName: string; campaignId: string | null }>()

    for (const { adId, pageId } of batchAdIds) {
      // Try tokens in order: specific page token first, then all others
      const tokensToTry = []
      const specificToken = userTokenMap.get(pageId)
      if (specificToken) tokensToTry.push(specificToken)
      for (const t of allUserTokens) {
        if (t !== specificToken) tokensToTry.push(t)
      }

      for (const token of tokensToTry) {
        try {
          const resp = await fetch(
            `https://graph.facebook.com/v21.0/${adId}?fields=name,campaign{id,name}&access_token=${token}`
          )
          const data = await resp.json()

          if (data.error) continue // try next token

          const campaignName = data.campaign?.name || data.name || 'N/A'
          const campaignId = data.campaign?.id || null

          if (campaignName !== 'N/A') {
            campaignCache.set(adId, { campaignName, campaignId })
          }
          break // resolved, no need to try more tokens
        } catch {
          continue
        }
      }
    }

    // Step 4: Update leads that match these ad_ids
    // Get lead_id -> ad_id mapping from webhook logs
    const leadAdIdMap = new Map<string, string>()
    let leadLogPage = 0

    while (true) {
      const from = leadLogPage * 1000
      const { data: logRows } = await supabaseAdmin
        .from('facebook_webhook_logs')
        .select('lead_id, payload')
        .not('lead_id', 'is', null)
        .range(from, from + 999)

      if (!logRows?.length) break

      for (const row of logRows) {
        if (!row.lead_id || leadAdIdMap.has(row.lead_id)) continue
        const changes = row.payload?.entry?.[0]?.changes?.[0]?.value
        const adId = changes?.ad_id || changes?.adgroup_id
        if (adId) leadAdIdMap.set(row.lead_id, adId)
      }

      if (logRows.length < 1000) break
      leadLogPage++
    }

    // Find lead_ids that have ad_ids in this batch
    const batchAdIdSet = new Set(batchAdIds.map(a => a.adId))
    const leadsToUpdate: { leadId: string; adId: string }[] = []

    for (const [leadId, adId] of leadAdIdMap) {
      if (batchAdIdSet.has(adId) && campaignCache.has(adId)) {
        leadsToUpdate.push({ leadId, adId })
      }
    }

    // Get lead data and update
    let updated = 0
    let skipped = 0

    if (leadsToUpdate.length > 0) {
      const leadIds = leadsToUpdate.map(l => l.leadId)
      const { data: leads } = await supabaseAdmin
        .from('leads')
        .select('id, additional_data, descricao_negocio')
        .in('id', leadIds)

      const leadMap = new Map((leads || []).map(l => [l.id, l]))

      const promises: Promise<any>[] = []

      for (const { leadId, adId } of leadsToUpdate) {
        const lead = leadMap.get(leadId)
        if (!lead) { skipped++; continue }

        const existingCampaign = lead.additional_data?.campaign_name
        if (existingCampaign && existingCampaign !== 'N/A' && existingCampaign !== '') {
          skipped++
          continue
        }

        const info = campaignCache.get(adId)!
        const additionalData = lead.additional_data || {}
        additionalData.campaign_name = info.campaignName
        additionalData.campaign_id = info.campaignId
        additionalData.ad_id = adId

        let descricao = lead.descricao_negocio || ''
        if (descricao.includes('Campanha: N/A')) {
          descricao = descricao.replace('Campanha: N/A', `Campanha: ${info.campaignName}`)
        }

        promises.push(
          supabaseAdmin
            .from('leads')
            .update({ additional_data: additionalData, descricao_negocio: descricao })
            .eq('id', leadId)
            .then(({ error }) => {
              if (error) console.error(`❌ ${leadId}: ${error.message}`)
              else updated++
            })
        )

        if (promises.length >= 50) {
          await Promise.all(promises)
          promises.length = 0
        }
      }

      if (promises.length > 0) await Promise.all(promises)
    }

    const duration = Date.now() - startTime
    const hasMore = batchOffset + batchSize < allAdIds.length

    return new Response(JSON.stringify({
      success: true,
      batch: batchOffset,
      batchSize,
      totalBatches,
      hasMore,
      adIdsProcessed: batchAdIds.length,
      campaignsResolved: campaignCache.size,
      leadsUpdated: updated,
      leadsSkipped: skipped,
      totalAdIds: allAdIds.length,
      tokensAvailable: allUserTokens.length,
      durationMs: duration,
      sampleCampaigns: [...campaignCache.entries()].slice(0, 5).map(([adId, info]) => ({
        adId,
        campaign: info.campaignName
      }))
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }
})
