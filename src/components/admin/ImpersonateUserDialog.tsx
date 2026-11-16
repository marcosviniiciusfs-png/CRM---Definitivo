import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { REASON_MAX_LENGTH, validateReason } from "@/lib/impersonation";
import { ImpersonationError, startImpersonation } from "@/lib/impersonationSession";

interface ImpersonateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetName: string;
  organizationName: string | null;
  returnPath: string;
}

export function ImpersonateUserDialog({
  open,
  onOpenChange,
  targetUserId,
  targetName,
  organizationName,
  returnPath,
}: ImpersonateUserDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const reasonError = validateReason(reason);
    if (reasonError) {
      setError(reasonError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Em caso de sucesso a página recarrega na conta do usuário.
      await startImpersonation({ targetUserId, reason, returnPath });
    } catch (err) {
      setError(
        err instanceof ImpersonationError ? err.message : "Não foi possível entrar na conta. Tente novamente.",
      );
      setSubmitting(false);
    }
  };

  const who = organizationName ? `${targetName} (${organizationName})` : targetName;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Entrar como {targetName}?</DialogTitle>
            <DialogDescription>
              Você vai ver e fazer o que {who} vê. Tudo o que fizer fica no nome dessa pessoa. O acesso fica
              registrado com o motivo e termina sozinho depois de 1 hora.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="impersonation-reason">Motivo do acesso</Label>
            <Textarea
              id="impersonation-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Ex.: cliente pediu ajuda para configurar a roleta."
              maxLength={REASON_MAX_LENGTH}
              rows={3}
              autoFocus
              disabled={submitting}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "impersonation-reason-error" : undefined}
            />
            {error && (
              <p id="impersonation-reason-error" className="flex items-start gap-1.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden="true" />}
              Entrar na conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
