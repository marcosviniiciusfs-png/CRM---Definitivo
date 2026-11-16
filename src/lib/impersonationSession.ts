// Lado do navegador do "entrar como usuário" (Fase 6): guarda a sessão do super admin,
// troca para a sessão emprestada e volta. As regras puras ficam em ./impersonation.ts.
//
// Toda troca de identidade termina num recarregamento completo da página (window.location),
// para não sobrar nada em memória (React Query, contextos, canais do Realtime) da outra conta.

import { supabase } from "@/integrations/supabase/client";
import { logger } from "@/lib/logger";
import {
  IMPERSONATION_MARKER_KEY,
  IMPERSONATION_NOTICE_KEY,
  IMPERSONATION_STORAGE_KEY,
  buildImpersonationPayload,
  isImpersonatingUserFrom,
  markerFromPayload,
  parseImpersonateResponse,
  parseImpersonationMarker,
  parseImpersonationPayload,
  sanitizeReturnPath,
  validateReason,
  type ImpersonationMarker,
  type ImpersonationPayload,
} from "@/lib/impersonation";

export class ImpersonationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImpersonationError";
  }
}

export type ImpersonationNotice = { type: "success" | "info" | "error"; message: string };

// Caches que dependem de quem está logado. Mantenha alinhado com AuthContext e OrganizationContext.
const LOCAL_IDENTITY_KEYS = ["kairoz_org_cache"];
const SESSION_IDENTITY_KEYS = ["kairoz_section_access_cache", "kairoz_fast_access_cache"];
const SESSION_IDENTITY_PREFIXES = ["kairoz_subscription_cache", "profile_"];

let transitionInProgress = false;

/** true enquanto esta aba troca de identidade; a faixa não deve reagir nesse meio-tempo. */
export function isImpersonationTransitionInProgress(): boolean {
  return transitionInProgress;
}

function safeGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    // Armazenamento bloqueado: a faixa simplesmente não aparece nas outras abas.
  }
}

function safeRemove(storage: () => Storage, key: string): void {
  try {
    storage().removeItem(key);
  } catch {
    // Nada a fazer.
  }
}

const session = () => window.sessionStorage;
const local = () => window.localStorage;

export function readImpersonationPayload(): ImpersonationPayload | null {
  return parseImpersonationPayload(safeGet(session, IMPERSONATION_STORAGE_KEY));
}

export function readImpersonationMarker(): ImpersonationMarker | null {
  return parseImpersonationMarker(safeGet(local, IMPERSONATION_MARKER_KEY));
}

/** Se a sessão deste usuário é emprestada (nesta aba ou em outra). */
export function isImpersonatingUser(userId: string | null | undefined): boolean {
  return isImpersonatingUserFrom(readImpersonationPayload(), readImpersonationMarker(), userId);
}

export function clearIdentityCaches(): void {
  LOCAL_IDENTITY_KEYS.forEach((key) => safeRemove(local, key));
  SESSION_IDENTITY_KEYS.forEach((key) => safeRemove(session, key));
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && SESSION_IDENTITY_PREFIXES.some((prefix) => key.startsWith(prefix))) keys.push(key);
    }
    keys.forEach((key) => safeRemove(session, key));
  } catch {
    // Nada a fazer.
  }
}

function clearImpersonationState(): void {
  safeRemove(session, IMPERSONATION_STORAGE_KEY);
  safeRemove(local, IMPERSONATION_MARKER_KEY);
  clearIdentityCaches();
}

export function setImpersonationNotice(notice: ImpersonationNotice): void {
  safeSet(session, IMPERSONATION_NOTICE_KEY, JSON.stringify(notice));
}

/** Lê e apaga o aviso guardado antes do recarregamento. */
export function takeImpersonationNotice(): ImpersonationNotice | null {
  const raw = safeGet(session, IMPERSONATION_NOTICE_KEY);
  if (!raw) return null;
  safeRemove(session, IMPERSONATION_NOTICE_KEY);
  try {
    const value = JSON.parse(raw) as ImpersonationNotice;
    if (typeof value?.message === "string" && ["success", "info", "error"].includes(value.type)) return value;
  } catch {
    // Aviso corrompido: ignora.
  }
  return null;
}

async function functionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      if (typeof body?.error === "string" && body.error.trim()) return body.error;
    } catch {
      // Corpo sem JSON.
    }
  }
  return null;
}

async function closeLog(logId: string): Promise<void> {
  const { error } = await supabase.rpc("end_impersonation", { p_log_id: logId });
  if (error) logger.error("[IMPERSONATION] Não foi possível fechar o registro do acesso:", error);
}

/**
 * Entra na conta de outro usuário. Em caso de sucesso a página recarrega em /dashboard
 * e a promessa não volta; em caso de erro, lança ImpersonationError com o texto para o usuário.
 */
export async function startImpersonation(input: {
  targetUserId: string;
  reason: string;
  returnPath: string;
}): Promise<void> {
  const reasonError = validateReason(input.reason);
  if (reasonError) throw new ImpersonationError(reasonError);
  if (readImpersonationPayload()) {
    throw new ImpersonationError("Volte para sua conta antes de entrar em outra.");
  }

  const { data: before } = await supabase.auth.getSession();
  if (!before.session) throw new ImpersonationError("Sua sessão expirou. Entre de novo e tente outra vez.");
  const actorUserId = before.session.user.id;

  const { data, error } = await supabase.functions.invoke("impersonate-user", {
    body: { target_user_id: input.targetUserId, reason: input.reason.trim() },
  });
  if (error) {
    throw new ImpersonationError(
      (await functionErrorMessage(error)) ?? "Não foi possível entrar na conta. Tente novamente.",
    );
  }
  const response = parseImpersonateResponse(data);
  if (!response) throw new ImpersonationError("Não foi possível entrar na conta. Tente novamente.");

  transitionInProgress = true;
  try {
    // Lê a sessão de novo logo antes da troca: o refresh automático pode ter girado o token durante a chamada.
    const { data: fresh } = await supabase.auth.getSession();
    const adminSession = fresh.session;
    if (!adminSession || adminSession.user.id !== actorUserId) {
      await closeLog(response.logId);
      throw new ImpersonationError("Sua sessão mudou durante o acesso. Tente novamente.");
    }

    const payload = buildImpersonationPayload({
      logId: response.logId,
      actorUserId,
      adminAccessToken: adminSession.access_token,
      adminRefreshToken: adminSession.refresh_token,
      target: { userId: input.targetUserId, ...response.target },
      returnPath: sanitizeReturnPath(input.returnPath),
      now: Date.now(),
    });
    // Guardado antes da troca: se a aba cair no meio, ainda dá para voltar.
    safeSet(session, IMPERSONATION_STORAGE_KEY, JSON.stringify(payload));
    if (!readImpersonationPayload()) {
      await closeLog(response.logId);
      throw new ImpersonationError("Não foi possível guardar sua sessão neste navegador. Libere o armazenamento do site.");
    }

    // 'email' cobre o token de magic link em qualquer servidor recente; 'magiclink' está obsoleto no supabase-js 2.97.
    const { data: otp, error: otpError } = await supabase.auth.verifyOtp({
      token_hash: response.tokenHash,
      type: "email",
    });

    if (otpError || otp.session?.user.id !== input.targetUserId) {
      logger.error("[IMPERSONATION] Falha ao entrar na conta:", otpError);
      if (otp?.session) {
        await supabase.auth.signOut({ scope: "local" });
        await supabase.auth.setSession({
          access_token: payload.adminAccessToken,
          refresh_token: payload.adminRefreshToken,
        });
      }
      safeRemove(session, IMPERSONATION_STORAGE_KEY);
      await closeLog(response.logId);
      throw new ImpersonationError("Não foi possível entrar na conta. Tente novamente.");
    }

    // Marcador só depois da troca: as outras abas recarregam já com a sessão emprestada.
    safeSet(local, IMPERSONATION_MARKER_KEY, JSON.stringify(markerFromPayload(payload)));
    clearIdentityCaches();
    window.location.assign("/dashboard");
    await new Promise<never>(() => {});
  } catch (err) {
    transitionInProgress = false;
    throw err;
  }
}

/**
 * Volta para a conta do super admin guardada nesta aba. Sempre termina num recarregamento:
 * na página de volta, ou em /auth se a sessão guardada não vale mais.
 */
export async function stopImpersonation(mode: "manual" | "expired" | "restore"): Promise<void> {
  if (transitionInProgress) return;
  transitionInProgress = true;

  const payload = readImpersonationPayload();
  if (!payload) {
    clearImpersonationState();
    window.location.assign("/auth");
    return;
  }

  // Encerra a sessão emprestada no servidor (scope local: o usuário real continua logado nos aparelhos dele).
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) logger.error("[IMPERSONATION] Não foi possível encerrar a sessão emprestada:", signOutError);

  const { data, error } = await supabase.auth.setSession({
    access_token: payload.adminAccessToken,
    refresh_token: payload.adminRefreshToken,
  });

  if (error || !data.session || data.session.user.id !== payload.actorUserId) {
    logger.error("[IMPERSONATION] Sessão do super admin não vale mais:", error);
    if (data?.session) await supabase.auth.signOut({ scope: "local" });
    clearImpersonationState();
    setImpersonationNotice({
      type: "error",
      message: "Não foi possível voltar para sua conta. Entre de novo com seu e-mail e senha.",
    });
    window.location.assign("/auth");
    return;
  }

  await closeLog(payload.logId);
  clearImpersonationState();
  setImpersonationNotice(
    mode === "expired"
      ? { type: "info", message: "O acesso de suporte terminou depois de 1 hora. Você voltou para sua conta." }
      : { type: "success", message: "Você voltou para sua conta." },
  );
  window.location.assign(payload.returnPath);
}

/** Aba de origem que já voltou em outra aba duplicada: fecha o registro e limpa, sem mexer na sessão. */
export async function discardReturnedImpersonation(payload: ImpersonationPayload): Promise<void> {
  safeRemove(session, IMPERSONATION_STORAGE_KEY);
  await closeLog(payload.logId);
}

export function discardStaleImpersonation(): void {
  safeRemove(session, IMPERSONATION_STORAGE_KEY);
}

/**
 * Outra aba usando a sessão emprestada, sem a sessão do super admin guardada: encerra a sessão
 * emprestada e manda para o login.
 */
export async function endOrphanImpersonation(): Promise<void> {
  if (transitionInProgress) return;
  transitionInProgress = true;
  const marker = readImpersonationMarker();
  const { data } = await supabase.auth.getSession();
  // Só encerra se a sessão compartilhada ainda é a emprestada (a aba de origem pode ter voltado agora).
  if (marker && data.session?.user.id === marker.target.userId) {
    await supabase.auth.signOut({ scope: "local" });
  }
  safeRemove(local, IMPERSONATION_MARKER_KEY);
  clearIdentityCaches();
  setImpersonationNotice({ type: "info", message: "Acesso de suporte encerrado. Entre de novo com sua conta." });
  window.location.assign("/auth");
}

/** "Sair" durante o acesso: volta para a conta do super admin, ou encerra só a sessão emprestada. */
export async function leaveImpersonation(): Promise<void> {
  if (readImpersonationPayload()) {
    await stopImpersonation("manual");
  } else {
    await endOrphanImpersonation();
  }
}
