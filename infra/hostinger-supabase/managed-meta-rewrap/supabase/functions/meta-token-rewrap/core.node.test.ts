import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptCiphertext, encryptCiphertext } from './crypto.ts';
import {
  EXPECTED_PROJECT_REF,
  handleMetaTokenRewrap,
  MAX_BATCH_SIZE,
} from './core.ts';

const rowId = '11111111-1111-4111-8111-111111111111';
const legacyKey = 'legacy-meta-key-used-by-managed';
const metaKey = 'a'.repeat(64);
const oneTimeSecret = 'b'.repeat(64);
const plaintext = 'EAAB-meta-token-never-return-this-1234567890';

function environment(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    SUPABASE_URL: `https://${EXPECTED_PROJECT_REF}.supabase.co`,
    GOOGLE_CALENDAR_ENCRYPTION_KEY: legacyKey,
    META_TOKEN_ENCRYPTION_KEY: metaKey,
    META_REWRAP_ONE_TIME_SECRET: oneTimeSecret,
    ...overrides,
  };
  return (name: string) => values[name];
}

function request(body: unknown, bearer = oneTimeSecret): Request {
  return new Request('https://example.invalid/functions/v1/meta-token-rewrap', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearer}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

test('rewraps legacy ciphertext without returning plaintext', async () => {
  const legacyCiphertext = await encryptCiphertext(plaintext, legacyKey);
  const response = await handleMetaTokenRewrap(request({
    items: [{ row_id: rowId, field: 'encrypted_access_token', ciphertext: legacyCiphertext }],
  }), environment());
  const rawResponse = await response.text();
  const body = JSON.parse(rawResponse);

  assert.equal(response.status, 200);
  assert.equal(rawResponse.includes(plaintext), false);
  assert.equal(body.results[0].status, 'rewrapped');
  assert.notEqual(body.results[0].ciphertext, legacyCiphertext);
  assert.equal(await decryptCiphertext(body.results[0].ciphertext, metaKey), plaintext);
  assert.equal(await decryptCiphertext(body.results[0].ciphertext, legacyKey), null);
});

test('is idempotent for ciphertext already encrypted with the Meta key', async () => {
  const currentCiphertext = await encryptCiphertext(plaintext, metaKey);
  const response = await handleMetaTokenRewrap(request({
    items: [{ row_id: rowId, field: 'encrypted_page_access_token', ciphertext: currentCiphertext }],
  }), environment());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.results[0].status, 'already_current');
  assert.equal('ciphertext' in body.results[0], false);
});

test('never echoes plaintext or unreadable ciphertext', async () => {
  const response = await handleMetaTokenRewrap(request({
    items: [{ row_id: rowId, field: 'encrypted_access_token', ciphertext: plaintext }],
  }), environment());
  const rawResponse = await response.text();
  const body = JSON.parse(rawResponse);

  assert.equal(response.status, 200);
  assert.equal(body.results[0].status, 'unreadable');
  assert.equal('ciphertext' in body.results[0], false);
  assert.equal(rawResponse.includes(plaintext), false);
});

test('rejects an invalid bearer and the wrong managed project', async () => {
  const unauthorized = await handleMetaTokenRewrap(request({ items: [] }, 'c'.repeat(64)), environment());
  assert.equal(unauthorized.status, 401);

  const wrongProject = await handleMetaTokenRewrap(
    request({ items: [] }),
    environment({ SUPABASE_URL: 'https://another-project.supabase.co' }),
  );
  assert.equal(wrongProject.status, 503);
});

test('rejects weak configuration and AES-equivalent old/new keys', async () => {
  const weakBearer = await handleMetaTokenRewrap(
    request({ items: [] }, 'short'),
    environment({ META_REWRAP_ONE_TIME_SECRET: 'short' }),
  );
  assert.equal(weakBearer.status, 503);

  const equivalentLegacyKey = metaKey.slice(0, 32);
  const equivalentKeys = await handleMetaTokenRewrap(
    request({
      items: [{
        row_id: rowId,
        field: 'encrypted_access_token',
        ciphertext: await encryptCiphertext(plaintext, equivalentLegacyKey),
      }],
    }),
    environment({ GOOGLE_CALENDAR_ENCRYPTION_KEY: equivalentLegacyKey }),
  );
  assert.equal(equivalentKeys.status, 503);
});

test('rejects oversized batches, duplicate slots and unknown fields', async () => {
  const ciphertext = await encryptCiphertext(plaintext, legacyKey);
  const oversized = Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, index) => ({
    row_id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    field: 'encrypted_access_token',
    ciphertext,
  }));
  assert.equal((await handleMetaTokenRewrap(request({ items: oversized }), environment())).status, 400);

  const duplicate = { row_id: rowId, field: 'encrypted_access_token', ciphertext };
  assert.equal((await handleMetaTokenRewrap(
    request({ items: [duplicate, duplicate] }),
    environment(),
  )).status, 400);

  assert.equal((await handleMetaTokenRewrap(request({
    items: [{ row_id: rowId, field: 'other_token', ciphertext }],
  }), environment())).status, 400);
});
