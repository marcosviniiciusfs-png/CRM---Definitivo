const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
export const MAX_CIPHERTEXT_LENGTH = 8192;

function normalizeKey(key: string): Uint8Array {
  return new TextEncoder().encode(key.padEnd(32, '0').slice(0, 32));
}

export function normalizedKeysMatch(first: string, second: string): boolean {
  const firstBytes = normalizeKey(first);
  const secondBytes = normalizeKey(second);
  let difference = 0;

  for (let index = 0; index < firstBytes.length; index += 1) {
    difference |= firstBytes[index] ^ secondBytes[index];
  }

  return difference === 0;
}

function decodeCiphertext(ciphertext: string): Uint8Array | null {
  if (
    ciphertext.length === 0 ||
    ciphertext.length > MAX_CIPHERTEXT_LENGTH ||
    ciphertext.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(ciphertext)
  ) {
    return null;
  }

  try {
    const decoded = Uint8Array.from(atob(ciphertext), (character) =>
      character.charCodeAt(0)
    );
    return decoded.length > IV_LENGTH + AUTH_TAG_LENGTH ? decoded : null;
  } catch {
    return null;
  }
}

export async function decryptCiphertext(
  ciphertext: string,
  key: string,
): Promise<string | null> {
  const combined = decodeCiphertext(ciphertext);
  if (!combined) return null;

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      normalizeKey(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt'],
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: combined.slice(0, IV_LENGTH) },
      cryptoKey,
      combined.slice(IV_LENGTH),
    );

    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    return null;
  }
}

export async function encryptCiphertext(
  plaintext: string,
  key: string,
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    normalizeKey(key),
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

export function isPlausibleMetaToken(plaintext: string): boolean {
  return plaintext.length >= 20 &&
    plaintext.length <= 4096 &&
    !/[\u0000-\u0020\u007f]/.test(plaintext);
}
