import {
  decryptCiphertext,
  encryptCiphertext,
  isPlausibleMetaToken,
  MAX_CIPHERTEXT_LENGTH,
  normalizedKeysMatch,
} from './crypto.ts';

export const EXPECTED_PROJECT_REF = 'uxttihjsxfowursjyult';
export const MAX_BATCH_SIZE = 25;
const MAX_REQUEST_BYTES = 256 * 1024;
const ALLOWED_FIELDS = new Set([
  'encrypted_access_token',
  'encrypted_page_access_token',
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type EnvGetter = (name: string) => string | undefined;

interface RewrapItem {
  row_id: string;
  field: 'encrypted_access_token' | 'encrypted_page_access_token';
  ciphertext: string;
}

interface RewrapResult {
  row_id: string;
  field: RewrapItem['field'];
  status: 'rewrapped' | 'already_current' | 'unreadable';
  ciphertext?: string;
}

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
};

function jsonResponse(body: unknown, status: number, extraHeaders = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...responseHeaders, ...extraHeaders },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(record).every((key) => allowedSet.has(key));
}

function constantTimeEqual(provided: string, expected: string): boolean {
  if (provided.length > 256 || expected.length === 0) return false;

  const providedBytes = new TextEncoder().encode(provided);
  const expectedBytes = new TextEncoder().encode(expected);
  const maximumLength = Math.max(providedBytes.length, expectedBytes.length);
  let difference = providedBytes.length ^ expectedBytes.length;

  for (let index = 0; index < maximumLength; index += 1) {
    difference |= (providedBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }

  return difference === 0;
}

function projectRefFromUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;

  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    const suffix = '.supabase.co';
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  } catch {
    return null;
  }
}

function parseAuthorization(request: Request): string {
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

function parseItems(body: unknown): RewrapItem[] | null {
  if (!isRecord(body) || !hasOnlyKeys(body, ['items']) || !Array.isArray(body.items)) {
    return null;
  }
  if (body.items.length === 0 || body.items.length > MAX_BATCH_SIZE) return null;

  const items: RewrapItem[] = [];
  const seen = new Set<string>();

  for (const rawItem of body.items) {
    if (!isRecord(rawItem) || !hasOnlyKeys(rawItem, ['row_id', 'field', 'ciphertext'])) {
      return null;
    }
    if (
      typeof rawItem.row_id !== 'string' ||
      !UUID_PATTERN.test(rawItem.row_id) ||
      typeof rawItem.field !== 'string' ||
      !ALLOWED_FIELDS.has(rawItem.field) ||
      typeof rawItem.ciphertext !== 'string' ||
      rawItem.ciphertext.length === 0 ||
      rawItem.ciphertext.length > MAX_CIPHERTEXT_LENGTH
    ) {
      return null;
    }

    const identity = `${rawItem.row_id}:${rawItem.field}`;
    if (seen.has(identity)) return null;
    seen.add(identity);
    items.push(rawItem as unknown as RewrapItem);
  }

  return items;
}

export async function handleMetaTokenRewrap(
  request: Request,
  getEnv: EnvGetter,
): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'method_not_allowed' }, 405, { Allow: 'POST' });
    }

    if (projectRefFromUrl(getEnv('SUPABASE_URL')) !== EXPECTED_PROJECT_REF) {
      return jsonResponse({ error: 'service_unavailable' }, 503);
    }

    const oneTimeSecret = getEnv('META_REWRAP_ONE_TIME_SECRET') ?? '';
    if (!/^[0-9a-f]{64,128}$/i.test(oneTimeSecret)) {
      return jsonResponse({ error: 'service_unavailable' }, 503);
    }
    if (!constantTimeEqual(parseAuthorization(request), oneTimeSecret)) {
      return jsonResponse({ error: 'unauthorized' }, 401);
    }

    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return jsonResponse({ error: 'invalid_request' }, 415);
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'request_too_large' }, 413);
    }

    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
      return jsonResponse({ error: 'request_too_large' }, 413);
    }

    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return jsonResponse({ error: 'invalid_request' }, 400);
    }

    const legacyKey = getEnv('GOOGLE_CALENDAR_ENCRYPTION_KEY') ?? '';
    const metaKey = getEnv('META_TOKEN_ENCRYPTION_KEY') ?? '';
    if (
      legacyKey.length < 16 ||
      legacyKey.length > 256 ||
      /\s/.test(legacyKey) ||
      !/^[0-9a-f]{64}$/i.test(metaKey) ||
      normalizedKeysMatch(legacyKey, metaKey)
    ) {
      return jsonResponse({ error: 'service_unavailable' }, 503);
    }

    const items = parseItems(parsedBody);
    if (!items) return jsonResponse({ error: 'invalid_request' }, 400);

    const results: RewrapResult[] = [];
    let rewrapped = 0;
    let alreadyCurrent = 0;
    let unreadable = 0;

    for (const item of items) {
      let plaintext = await decryptCiphertext(item.ciphertext, metaKey);
      if (plaintext !== null && isPlausibleMetaToken(plaintext)) {
        results.push({ row_id: item.row_id, field: item.field, status: 'already_current' });
        alreadyCurrent += 1;
        plaintext = '';
        continue;
      }
      plaintext = '';

      plaintext = await decryptCiphertext(item.ciphertext, legacyKey);
      if (plaintext === null || !isPlausibleMetaToken(plaintext)) {
        results.push({ row_id: item.row_id, field: item.field, status: 'unreadable' });
        unreadable += 1;
        plaintext = '';
        continue;
      }

      const ciphertext = await encryptCiphertext(plaintext, metaKey);
      plaintext = '';
      results.push({ row_id: item.row_id, field: item.field, status: 'rewrapped', ciphertext });
      rewrapped += 1;
    }

    return jsonResponse({
      results,
      counts: {
        received: items.length,
        rewrapped,
        already_current: alreadyCurrent,
        unreadable,
      },
    }, 200);
  } catch {
    return jsonResponse({ error: 'internal_error' }, 500);
  }
}
