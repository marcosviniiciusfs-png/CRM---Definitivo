// Regras puras do "entrar como usuário" (Fase 6). Sem acesso a navegador nem ao Supabase,
// para poderem ser testadas em tests/impersonation.test.ts.

/** sessionStorage da aba que começou o acesso: guarda a sessão do super admin para voltar. */
export const IMPERSONATION_STORAGE_KEY = "kairoz-impersonation";
/** localStorage, sem tokens: avisa as outras abas que a sessão compartilhada é emprestada. */
export const IMPERSONATION_MARKER_KEY = "kairoz-impersonation-marker";
/** sessionStorage: aviso mostrado depois do recarregamento (volta, expiração, erro). */
export const IMPERSONATION_NOTICE_KEY = "kairoz-impersonation-notice";

export const IMPERSONATION_DURATION_MS = 60 * 60 * 1000;
/** Outras abas só encerram a sessão emprestada depois desta folga, para a aba de origem voltar primeiro. */
export const ORPHAN_GRACE_MS = 2 * 60 * 1000;
export const REASON_MIN_LENGTH = 5;
export const REASON_MAX_LENGTH = 500;
export const DEFAULT_RETURN_PATH = "/admin";

export interface ImpersonationTarget {
  userId: string;
  name: string;
  email: string;
  organizationName: string | null;
}

export interface ImpersonationPayload {
  version: 1;
  logId: string;
  actorUserId: string;
  adminAccessToken: string;
  adminRefreshToken: string;
  target: ImpersonationTarget;
  returnPath: string;
  startedAt: number;
  expiresAt: number;
}

export interface ImpersonationMarker {
  version: 1;
  logId: string;
  target: ImpersonationTarget;
  startedAt: number;
  expiresAt: number;
}

export interface ImpersonateResponse {
  tokenHash: string;
  logId: string;
  target: Omit<ImpersonationTarget, "userId">;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Só caminhos internos ("/admin/user/..."); qualquer outra coisa volta para o painel. */
export function sanitizeReturnPath(path: unknown): string {
  if (typeof path !== "string") return DEFAULT_RETURN_PATH;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) {
    return DEFAULT_RETURN_PATH;
  }
  if ([...trimmed].some((char) => char.charCodeAt(0) < 32)) return DEFAULT_RETURN_PATH;
  if (trimmed !== "/admin" && !trimmed.startsWith("/admin/") && !trimmed.startsWith("/admin?")) {
    return DEFAULT_RETURN_PATH;
  }
  return trimmed;
}

/** Devolve a mensagem de erro para o motivo, ou null se estiver bom. */
export function validateReason(reason: string): string | null {
  const length = reason.trim().length;
  if (length < REASON_MIN_LENGTH) return "Escreva o motivo do acesso, com pelo menos 5 letras.";
  if (length > REASON_MAX_LENGTH) return "Encurte o motivo para até 500 caracteres.";
  return null;
}

function parseTarget(value: unknown): ImpersonationTarget | null {
  if (!isRecord(value)) return null;
  if (!isUuid(value.userId) || !isNonEmptyString(value.name) || typeof value.email !== "string") return null;
  if (value.organizationName !== null && typeof value.organizationName !== "string") return null;
  return {
    userId: value.userId,
    name: value.name,
    email: value.email,
    organizationName: value.organizationName,
  };
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseImpersonationPayload(raw: string | null): ImpersonationPayload | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== 1) return null;
  const target = parseTarget(value.target);
  if (
    !target ||
    !isUuid(value.logId) ||
    !isUuid(value.actorUserId) ||
    !isNonEmptyString(value.adminAccessToken) ||
    !isNonEmptyString(value.adminRefreshToken) ||
    !isFiniteNumber(value.startedAt) ||
    !isFiniteNumber(value.expiresAt) ||
    value.expiresAt <= value.startedAt ||
    value.actorUserId === target.userId
  ) {
    return null;
  }
  return {
    version: 1,
    logId: value.logId,
    actorUserId: value.actorUserId,
    adminAccessToken: value.adminAccessToken,
    adminRefreshToken: value.adminRefreshToken,
    target,
    returnPath: sanitizeReturnPath(value.returnPath),
    startedAt: value.startedAt,
    expiresAt: value.expiresAt,
  };
}

export function parseImpersonationMarker(raw: string | null): ImpersonationMarker | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== 1) return null;
  const target = parseTarget(value.target);
  if (
    !target ||
    !isUuid(value.logId) ||
    !isFiniteNumber(value.startedAt) ||
    !isFiniteNumber(value.expiresAt) ||
    value.expiresAt <= value.startedAt
  ) {
    return null;
  }
  return { version: 1, logId: value.logId, target, startedAt: value.startedAt, expiresAt: value.expiresAt };
}

export function buildImpersonationPayload(input: {
  logId: string;
  actorUserId: string;
  adminAccessToken: string;
  adminRefreshToken: string;
  target: ImpersonationTarget;
  returnPath: string;
  now: number;
}): ImpersonationPayload {
  return {
    version: 1,
    logId: input.logId,
    actorUserId: input.actorUserId,
    adminAccessToken: input.adminAccessToken,
    adminRefreshToken: input.adminRefreshToken,
    target: input.target,
    returnPath: sanitizeReturnPath(input.returnPath),
    startedAt: input.now,
    expiresAt: input.now + IMPERSONATION_DURATION_MS,
  };
}

/** Marcador para as outras abas: mesmo conteúdo, sem tokens. */
export function markerFromPayload(payload: ImpersonationPayload): ImpersonationMarker {
  return {
    version: 1,
    logId: payload.logId,
    target: payload.target,
    startedAt: payload.startedAt,
    expiresAt: payload.expiresAt,
  };
}

/** Valida a resposta da Edge Function impersonate-user. */
export function parseImpersonateResponse(value: unknown): ImpersonateResponse | null {
  if (!isRecord(value) || !isNonEmptyString(value.token_hash) || !isUuid(value.log_id)) return null;
  const target = value.target;
  if (!isRecord(target) || !isNonEmptyString(target.email)) return null;
  const name = isNonEmptyString(target.name) ? target.name.trim() : target.email;
  const organizationName = isNonEmptyString(target.organization_name) ? target.organization_name.trim() : null;
  return { tokenHash: value.token_hash, logId: value.log_id, target: { name, email: target.email, organizationName } };
}

export function remainingMs(expiresAt: number, now: number): number {
  return Math.max(0, expiresAt - now);
}

/** "59 min" enquanto falta pelo menos 1 minuto; "45 s" no último minuto. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "0 s";
  if (ms < 60_000) return `${Math.ceil(ms / 1000)} s`;
  return `${Math.ceil(ms / 60_000)} min`;
}

/** "Fulano (Organização X)" ou só "Fulano" quando não há organização. */
export function targetLabel(target: Pick<ImpersonationTarget, "name" | "organizationName">): string {
  return target.organizationName ? `${target.name} (${target.organizationName})` : target.name;
}

export type ImpersonationView =
  | { kind: "none" }
  /** Aba de origem, na conta emprestada. */
  | { kind: "active"; payload: ImpersonationPayload; remainingMs: number; expired: boolean }
  /** Aba de origem sem a sessão emprestada (alguém saiu): tenta voltar para a conta do super admin. */
  | { kind: "restore"; payload: ImpersonationPayload }
  /** Aba de origem que já voltou (em outra aba duplicada): só fecha o registro e limpa. */
  | { kind: "returned"; payload: ImpersonationPayload }
  /** Dados guardados que não batem com a sessão atual: limpar sem mexer na sessão. */
  | { kind: "stale" }
  /** Outra aba usando a sessão emprestada, sem como voltar daqui. */
  | { kind: "orphan"; marker: ImpersonationMarker; remainingMs: number; shouldSignOut: boolean };

/**
 * Decide o que a faixa mostra e faz, a partir do que está guardado e de quem está logado agora.
 * currentUserId null = ninguém logado.
 */
export function resolveImpersonationView(input: {
  payload: ImpersonationPayload | null;
  marker: ImpersonationMarker | null;
  currentUserId: string | null;
  now: number;
}): ImpersonationView {
  const { payload, marker, currentUserId, now } = input;

  if (payload) {
    if (currentUserId === payload.target.userId) {
      const left = remainingMs(payload.expiresAt, now);
      return { kind: "active", payload, remainingMs: left, expired: left <= 0 };
    }
    if (currentUserId === null) return { kind: "restore", payload };
    if (currentUserId === payload.actorUserId) return { kind: "returned", payload };
    return { kind: "stale" };
  }

  if (marker && currentUserId !== null && currentUserId === marker.target.userId) {
    const left = remainingMs(marker.expiresAt, now);
    return {
      kind: "orphan",
      marker,
      remainingMs: left,
      shouldSignOut: now >= marker.expiresAt + ORPHAN_GRACE_MS,
    };
  }

  return { kind: "none" };
}

/** Se a sessão atual é emprestada, de acordo com o que está guardado. */
export function isImpersonatingUserFrom(
  payload: ImpersonationPayload | null,
  marker: ImpersonationMarker | null,
  userId: string | null | undefined,
): boolean {
  if (!userId) return false;
  return payload?.target.userId === userId || marker?.target.userId === userId;
}
