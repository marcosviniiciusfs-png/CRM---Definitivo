const META_TOKEN_ENCRYPTION_KEY = 'META_TOKEN_ENCRYPTION_KEY';
// Temporary read-only fallback. Remove after every Meta integration has been
// reconnected or its stored tokens have been re-encrypted with the Meta key.
const LEGACY_TOKEN_ENCRYPTION_KEY = 'GOOGLE_CALENDAR_ENCRYPTION_KEY';

function normalizeEncryptionKey(key: string): Uint8Array {
  return new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32));
}

function readRequiredMetaEncryptionKey(): string {
  const key = Deno.env.get(META_TOKEN_ENCRYPTION_KEY);

  if (!key?.trim()) {
    throw new Error(`${META_TOKEN_ENCRYPTION_KEY} not configured`);
  }

  return key;
}

function readMetaDecryptionKeys(): string[] {
  const primaryKey = readRequiredMetaEncryptionKey();
  const legacyKey = Deno.env.get(LEGACY_TOKEN_ENCRYPTION_KEY);

  return legacyKey && legacyKey.trim() && legacyKey !== primaryKey
    ? [primaryKey, legacyKey]
    : [primaryKey];
}

export async function encryptMetaTokenWithKey(
  token: string,
  key: string,
): Promise<string> {
  if (!token) return '';

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    normalizeEncryptionKey(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(token),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export async function decryptMetaTokenWithKeys(
  encryptedToken: string,
  keys: readonly string[],
): Promise<string> {
  if (!encryptedToken || encryptedToken === 'ENCRYPTED_IN_TOKENS_TABLE') {
    return '';
  }

  let combined: Uint8Array;
  try {
    combined = Uint8Array.from(atob(encryptedToken), (char) => char.charCodeAt(0));
  } catch {
    return '';
  }

  if (combined.length <= 12) return '';

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  for (const key of keys) {
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        normalizeEncryptionKey(key),
        { name: 'AES-GCM' },
        false,
        ['decrypt'],
      );
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data,
      );

      return new TextDecoder().decode(decrypted);
    } catch {
      // Try the optional legacy key before treating the token as unreadable.
    }
  }

  return '';
}

export async function encryptMetaToken(token: string): Promise<string> {
  return await encryptMetaTokenWithKey(token, readRequiredMetaEncryptionKey());
}

export async function decryptMetaToken(encryptedToken: string): Promise<string> {
  return await decryptMetaTokenWithKeys(encryptedToken, readMetaDecryptionKeys());
}
