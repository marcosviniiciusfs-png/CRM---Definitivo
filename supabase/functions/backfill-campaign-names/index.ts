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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!'

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: secureTokens } = await supabaseAdmin
      .from('facebook_integration_tokens')
      .select('encrypted_page_access_token, encrypted_access_token')
      .limit(1)

    let token = await decryptToken(secureTokens?.[0]?.encrypted_page_access_token || '', ENCRYPTION_KEY)
    if (!token) {
      token = await decryptToken(secureTokens?.[0]?.encrypted_access_token || '', ENCRYPTION_KEY)
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Sem token válido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
      })
    }

    // Testar com um ID real do banco
    const testId = '120243638776130628'

    // Teste 1: como ad
    const adResp = await fetch(`https://graph.facebook.com/v21.0/${testId}?fields=name,campaign{id,name}&access_token=${token}`)
    const adData = await adResp.json()

    // Teste 2: como campanha
    const campResp = await fetch(`https://graph.facebook.com/v21.0/${testId}?fields=name&access_token=${token}`)
    const campData = await campResp.json()

    // Teste 3: token info
    const meResp = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${token}`)
    const meData = await meResp.json()

    return new Response(JSON.stringify({
      tokenPrefix: token.substring(0, 15) + '...',
      testId,
      asAd: adData,
      asCampaign: campData,
      tokenIdentity: meData
    }, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }
})
