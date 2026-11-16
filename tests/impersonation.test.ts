import assert from "node:assert/strict";
import test from "node:test";

import {
  IMPERSONATION_DURATION_MS,
  ORPHAN_GRACE_MS,
  buildImpersonationPayload,
  formatRemaining,
  isImpersonatingUserFrom,
  markerFromPayload,
  parseImpersonateResponse,
  parseImpersonationMarker,
  parseImpersonationPayload,
  remainingMs,
  resolveImpersonationView,
  sanitizeReturnPath,
  targetLabel,
  validateReason,
} from "../src/lib/impersonation.ts";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const LOG = "33333333-3333-4333-8333-333333333333";
const NOW = 1_800_000_000_000;

const target = { userId: TARGET, name: "Fulano", email: "fulano@exemplo.com", organizationName: "Org X" };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    ...buildImpersonationPayload({
      logId: LOG,
      actorUserId: ADMIN,
      adminAccessToken: "access",
      adminRefreshToken: "refresh",
      target,
      returnPath: `/admin/user/${TARGET}`,
      now: NOW,
    }),
    ...overrides,
  };
}

test("payload completo passa e expira em 1 hora", () => {
  const parsed = parseImpersonationPayload(JSON.stringify(payload()));
  assert.ok(parsed);
  assert.equal(parsed.expiresAt - parsed.startedAt, IMPERSONATION_DURATION_MS);
  assert.equal(parsed.returnPath, `/admin/user/${TARGET}`);
  assert.equal(parsed.target.organizationName, "Org X");
});

test("payload inválido vira null", () => {
  assert.equal(parseImpersonationPayload(null), null);
  assert.equal(parseImpersonationPayload("{"), null);
  assert.equal(parseImpersonationPayload(JSON.stringify([])), null);
  assert.equal(parseImpersonationPayload(JSON.stringify(payload({ version: 2 }))), null);
  assert.equal(parseImpersonationPayload(JSON.stringify(payload({ logId: "x" }))), null);
  assert.equal(parseImpersonationPayload(JSON.stringify(payload({ adminRefreshToken: "" }))), null);
  assert.equal(parseImpersonationPayload(JSON.stringify(payload({ expiresAt: NOW }))), null);
  assert.equal(parseImpersonationPayload(JSON.stringify(payload({ actorUserId: TARGET }))), null);
  assert.equal(
    parseImpersonationPayload(JSON.stringify(payload({ target: { ...target, userId: "nao-e-uuid" } }))),
    null,
  );
});

test("caminho de volta só aceita o painel admin", () => {
  assert.equal(sanitizeReturnPath(`/admin/user/${TARGET}`), `/admin/user/${TARGET}`);
  assert.equal(sanitizeReturnPath("/admin"), "/admin");
  assert.equal(sanitizeReturnPath("https://exemplo.com/admin"), "/admin");
  assert.equal(sanitizeReturnPath("//exemplo.com/admin"), "/admin");
  assert.equal(sanitizeReturnPath("/\\exemplo.com"), "/admin");
  assert.equal(sanitizeReturnPath("/dashboard"), "/admin");
  assert.equal(sanitizeReturnPath("/administrativo/colaboradores"), "/admin");
  assert.equal(sanitizeReturnPath(42), "/admin");
  const parsed = parseImpersonationPayload(JSON.stringify(payload({ returnPath: "javascript:alert(1)" })));
  assert.equal(parsed?.returnPath, "/admin");
});

test("marcador não carrega tokens", () => {
  const marker = markerFromPayload(payload() as ReturnType<typeof buildImpersonationPayload>);
  const raw = JSON.stringify(marker);
  assert.ok(!raw.includes("access"));
  assert.ok(!raw.includes("refresh"));
  assert.deepEqual(parseImpersonationMarker(raw), marker);
  assert.equal(parseImpersonationMarker(JSON.stringify({ ...marker, expiresAt: 0 })), null);
});

test("motivo precisa de 5 a 500 caracteres", () => {
  assert.ok(validateReason("abc"));
  assert.ok(validateReason("    abcd   "));
  assert.equal(validateReason("Cliente pediu ajuda"), null);
  assert.ok(validateReason("a".repeat(501)));
});

test("resposta da função é validada", () => {
  const ok = parseImpersonateResponse({
    token_hash: "hash",
    log_id: LOG,
    target: { name: "Fulano", email: "fulano@exemplo.com", organization_name: "Org X" },
  });
  assert.deepEqual(ok, {
    tokenHash: "hash",
    logId: LOG,
    target: { name: "Fulano", email: "fulano@exemplo.com", organizationName: "Org X" },
  });
  const noName = parseImpersonateResponse({
    token_hash: "hash",
    log_id: LOG,
    target: { name: "", email: "f@e.com", organization_name: null },
  });
  assert.equal(noName?.target.name, "f@e.com");
  assert.equal(noName?.target.organizationName, null);
  assert.equal(parseImpersonateResponse({ log_id: LOG, target: { email: "f@e.com" } }), null);
  assert.equal(parseImpersonateResponse(null), null);
});

test("tempo restante e formato", () => {
  assert.equal(remainingMs(NOW + 1000, NOW), 1000);
  assert.equal(remainingMs(NOW - 1000, NOW), 0);
  assert.equal(formatRemaining(IMPERSONATION_DURATION_MS), "60 min");
  assert.equal(formatRemaining(59 * 60_000 + 1), "60 min");
  assert.equal(formatRemaining(61_000), "2 min");
  assert.equal(formatRemaining(45_000), "45 s");
  assert.equal(formatRemaining(0), "0 s");
});

test("rótulo do usuário acessado", () => {
  assert.equal(targetLabel(target), "Fulano (Org X)");
  assert.equal(targetLabel({ name: "Fulano", organizationName: null }), "Fulano");
});

test("faixa: aba de origem", () => {
  const p = parseImpersonationPayload(JSON.stringify(payload()));
  assert.ok(p);
  const active = resolveImpersonationView({ payload: p, marker: null, currentUserId: TARGET, now: NOW + 1000 });
  assert.equal(active.kind, "active");
  assert.equal(active.kind === "active" && active.expired, false);

  const expired = resolveImpersonationView({
    payload: p,
    marker: null,
    currentUserId: TARGET,
    now: NOW + IMPERSONATION_DURATION_MS,
  });
  assert.equal(expired.kind === "active" && expired.expired, true);

  assert.equal(resolveImpersonationView({ payload: p, marker: null, currentUserId: null, now: NOW }).kind, "restore");
  assert.equal(resolveImpersonationView({ payload: p, marker: null, currentUserId: ADMIN, now: NOW }).kind, "returned");
  assert.equal(
    resolveImpersonationView({ payload: p, marker: null, currentUserId: LOG, now: NOW }).kind,
    "stale",
  );
});

test("faixa: outras abas", () => {
  const p = parseImpersonationPayload(JSON.stringify(payload()));
  assert.ok(p);
  const marker = markerFromPayload(p);
  const orphan = resolveImpersonationView({ payload: null, marker, currentUserId: TARGET, now: NOW });
  assert.equal(orphan.kind, "orphan");
  assert.equal(orphan.kind === "orphan" && orphan.shouldSignOut, false);

  const afterExpiry = resolveImpersonationView({
    payload: null,
    marker,
    currentUserId: TARGET,
    now: marker.expiresAt + 1000,
  });
  assert.equal(afterExpiry.kind === "orphan" && afterExpiry.shouldSignOut, false);

  const afterGrace = resolveImpersonationView({
    payload: null,
    marker,
    currentUserId: TARGET,
    now: marker.expiresAt + ORPHAN_GRACE_MS,
  });
  assert.equal(afterGrace.kind === "orphan" && afterGrace.shouldSignOut, true);

  assert.equal(resolveImpersonationView({ payload: null, marker, currentUserId: ADMIN, now: NOW }).kind, "none");
  assert.equal(resolveImpersonationView({ payload: null, marker, currentUserId: null, now: NOW }).kind, "none");
  assert.equal(resolveImpersonationView({ payload: null, marker: null, currentUserId: TARGET, now: NOW }).kind, "none");
});

test("sessão emprestada é reconhecida pelo usuário atual", () => {
  const p = parseImpersonationPayload(JSON.stringify(payload()));
  assert.ok(p);
  assert.equal(isImpersonatingUserFrom(p, null, TARGET), true);
  assert.equal(isImpersonatingUserFrom(null, markerFromPayload(p), TARGET), true);
  assert.equal(isImpersonatingUserFrom(p, null, ADMIN), false);
  assert.equal(isImpersonatingUserFrom(p, null, null), false);
});
