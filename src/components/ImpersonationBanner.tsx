import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import {
  IMPERSONATION_MARKER_KEY,
  formatRemaining,
  resolveImpersonationView,
  targetLabel,
} from "@/lib/impersonation";
import {
  discardReturnedImpersonation,
  discardStaleImpersonation,
  endOrphanImpersonation,
  isImpersonationTransitionInProgress,
  readImpersonationMarker,
  readImpersonationPayload,
  stopImpersonation,
  takeImpersonationNotice,
} from "@/lib/impersonationSession";

const BAR_HEIGHT = "2.5rem";

// Abre espaço para a faixa sem mexer nos layouts: só vale enquanto ela aparece.
const LAYOUT_OFFSET_CSS = `
  body { padding-top: ${BAR_HEIGHT}; }
  .h-screen { height: calc(100vh - ${BAR_HEIGHT}); }
  .min-h-screen { min-height: calc(100vh - ${BAR_HEIGHT}); }
  .h-svh { height: calc(100svh - ${BAR_HEIGHT}); }
  .min-h-svh { min-height: calc(100svh - ${BAR_HEIGHT}); }
  .fixed.inset-y-0 { top: ${BAR_HEIGHT}; }
`;

/**
 * Faixa fixa no topo enquanto o super admin usa a conta de outra pessoa (Fase 6).
 * Também cuida da volta automática depois de 1 hora e das outras abas que herdaram a sessão.
 */
export function ImpersonationBanner() {
  const { user, loading } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [storageVersion, setStorageVersion] = useState(0);
  const [leaving, setLeaving] = useState(false);

  // Aviso deixado antes do recarregamento (volta, expiração, erro).
  useEffect(() => {
    const notice = takeImpersonationNotice();
    if (!notice) return;
    if (notice.type === "error") toast.error(notice.message);
    else if (notice.type === "success") toast.success(notice.message);
    else toast.info(notice.message);
  }, []);

  // Outra aba começou ou terminou um acesso: a sessão compartilhada mudou de dono.
  // Recarrega para não misturar dados das duas contas em memória.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== IMPERSONATION_MARKER_KEY && event.key !== null) return;
      if (isImpersonationTransitionInProgress()) return;
      if (event.key === null || event.oldValue !== event.newValue) {
        window.location.reload();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const payload = useMemo(() => readImpersonationPayload(), [user?.id, storageVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const marker = useMemo(() => readImpersonationMarker(), [user?.id, storageVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => {
    if (loading) return { kind: "none" as const };
    return resolveImpersonationView({ payload, marker, currentUserId: user?.id ?? null, now });
  }, [loading, payload, marker, user?.id, now]);

  const visible = view.kind === "active" || view.kind === "orphan";

  // Relógio só enquanto há algo para contar.
  useEffect(() => {
    if (!payload && !marker) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [payload, marker]);

  useEffect(() => {
    if (isImpersonationTransitionInProgress()) return;
    if (view.kind === "active" && view.expired) {
      setLeaving(true);
      void stopImpersonation("expired");
    } else if (view.kind === "restore") {
      setLeaving(true);
      void stopImpersonation("restore");
    } else if (view.kind === "returned") {
      void discardReturnedImpersonation(view.payload).then(() => setStorageVersion((v) => v + 1));
    } else if (view.kind === "stale") {
      discardStaleImpersonation();
      setStorageVersion((v) => v + 1);
    } else if (view.kind === "orphan" && view.shouldSignOut) {
      setLeaving(true);
      void endOrphanImpersonation();
    }
  }, [view]);

  const handleLeave = useCallback(() => {
    setLeaving(true);
    if (view.kind === "active") void stopImpersonation("manual");
    else void endOrphanImpersonation();
  }, [view.kind]);

  if (leaving) {
    return (
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-background"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          Voltando para sua conta…
        </div>
      </div>
    );
  }

  if (!visible) return null;

  const target = view.kind === "active" ? view.payload.target : view.marker.target;
  const label = targetLabel(target);

  return (
    <>
      <style>{LAYOUT_OFFSET_CSS}</style>
      <div
        className="fixed inset-x-0 top-0 z-[100] bg-background"
        role="region"
        aria-label="Acesso de suporte"
      >
        <div className="flex h-10 items-center gap-2 border-b border-warning/30 bg-warning-tint px-3 text-[13px] text-warning sm:gap-3 sm:px-4">
          <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate">
            <span className="font-semibold">Você está como {label}</span>
            {view.kind === "orphan" && (
              <span className="hidden md:inline"> · Para voltar para sua conta, use a aba onde o acesso começou.</span>
            )}
          </p>
          {view.kind === "active" && (
            <span className="hidden shrink-0 tabular-nums sm:inline" title="O acesso termina sozinho depois de 1 hora.">
              Termina em {formatRemaining(view.remainingMs)}
            </span>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleLeave}
            className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          >
            <LogOut aria-hidden="true" />
            {view.kind === "active" ? (
              <>
                <span className="sm:hidden">Voltar</span>
                <span className="hidden sm:inline">Voltar para minha conta</span>
              </>
            ) : (
              "Sair desta conta"
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
