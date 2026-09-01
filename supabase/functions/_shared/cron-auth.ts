const encoder = new TextEncoder()

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  const length = Math.max(leftBytes.length, rightBytes.length)
  let difference = leftBytes.length ^ rightBytes.length

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }

  return difference === 0
}

/**
 * Enforces the target VPS cron secret without changing the managed-project
 * behavior until REQUIRE_CRON_SECRET=true is explicitly configured.
 */
export function rejectUnauthorizedCron(req: Request): Response | null {
  if (Deno.env.get('REQUIRE_CRON_SECRET') !== 'true') return null

  const expected = Deno.env.get('CRON_SECRET')
  const provided = req.headers.get('x-cron-secret')

  if (!expected) {
    console.error('CRON_SECRET is required but is not configured')
  }

  if (!expected || !provided || !constantTimeEqual(provided, expected)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  return null
}
