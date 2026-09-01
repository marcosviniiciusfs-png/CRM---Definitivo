interface OAuthStatePayload {
  user_id: string
  organization_id: string
  origin: string
  redirect_uri?: string
  iat: number
  exp: number
  nonce: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

async function getSigningKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('OAUTH_STATE_SECRET')
  if (!secret || encoder.encode(secret).length < 32) {
    throw new Error('OAUTH_STATE_SECRET must contain at least 32 bytes')
  }

  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export function getAllowedFrontendOrigin(candidate?: string | null): string {
  const siteUrl = Deno.env.get('SITE_URL') || 'https://www.kairozcrm.com.br'
  const configured = (Deno.env.get('OAUTH_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const normalize = (value: string): string | null => {
    try {
      const url = new URL(value)
      return (url.protocol === 'https:' || url.protocol === 'http:') ? url.origin : null
    } catch {
      return null
    }
  }

  const fallback = normalize(siteUrl) || 'https://www.kairozcrm.com.br'
  const configuredOrigins = configured
    .map(normalize)
    .filter((origin): origin is string => Boolean(origin))
  const allowed = new Set([fallback, ...configuredOrigins])
  const normalizedCandidate = candidate ? normalize(candidate) : null
  return normalizedCandidate && allowed.has(normalizedCandidate)
    ? normalizedCandidate
    : fallback
}

export async function createOAuthState(
  values: Pick<OAuthStatePayload, 'user_id' | 'organization_id' | 'origin' | 'redirect_uri'>,
  lifetimeSeconds = 600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const payload: OAuthStatePayload = {
    ...values,
    origin: getAllowedFrontendOrigin(values.origin),
    iat: now,
    exp: now + lifetimeSeconds,
    nonce: crypto.randomUUID(),
  }
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)))
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    await getSigningKey(),
    encoder.encode(encodedPayload),
  ))
  return `${encodedPayload}.${base64UrlEncode(signature)}`
}

export async function verifyOAuthState(value: string): Promise<OAuthStatePayload> {
  const [encodedPayload, encodedSignature, extra] = value.split('.')
  if (!encodedPayload || !encodedSignature || extra) throw new Error('Invalid OAuth state format')

  const signatureBytes = base64UrlDecode(encodedSignature)
  const signatureBuffer = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength,
  ) as ArrayBuffer
  const verified = await crypto.subtle.verify(
    'HMAC',
    await getSigningKey(),
    signatureBuffer,
    encoder.encode(encodedPayload),
  )
  if (!verified) throw new Error('Invalid OAuth state signature')

  const payload = JSON.parse(decoder.decode(base64UrlDecode(encodedPayload))) as OAuthStatePayload
  const now = Math.floor(Date.now() / 1000)
  if (!payload.user_id || !payload.organization_id || !payload.nonce) {
    throw new Error('Incomplete OAuth state')
  }
  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.iat > now + 60 || payload.exp < now) {
    throw new Error('Expired OAuth state')
  }
  if (payload.exp - payload.iat > 900) throw new Error('OAuth state lifetime is invalid')

  payload.origin = getAllowedFrontendOrigin(payload.origin)
  return payload
}
