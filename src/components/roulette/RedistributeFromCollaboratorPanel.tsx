import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shuffle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onToggle: () => void;
  onConfirm: (collaboratorUserId: string) => void;
  isPending: boolean;
}

export function RedistributeFromCollaboratorPanel({ open, onToggle, onConfirm, isPending }: Props) {
  const { organizationId } = useOrganization();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Buscar colaboradores ativos
  const { data: collaborators = [] } = useQuery({
    queryKey: ["redistribute-collaborator-options", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as Array<{ user_id: string; display: string }>;

      const { data: members } = await supabase
        .from("organization_members")
        .select("user_id, email, display_name, is_active")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .not("user_id", "is", null);

      const userIds = (members || []).map(m => m.user_id).filter(Boolean) as string[];
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));
      const list = (members || []).map(m => ({
        user_id: m.user_id!,
        display: profileMap.get(m.user_id!) || m.display_name || m.email || "Sem nome",
      }));
      list.sort((a, b) => a.display.localeCompare(b.display));
      return list;
    },
    enabled: !!organizationId && open,
    staleTime: 5 * 60 * 1000,
  });

  // Contar leads ativos do selecionado
  const { data: activeLeadsCount, isLoading: countLoading } = useQuery({
    queryKey: ["collaborator-active-leads-count", organizationId, selectedUserId],
    queryFn: async () => {
      if (!organizationId || !selectedUserId) return 0;

      const { data: closedStages } = await supabase
        .from("funnel_stages")
        .select("id, sales_funnels!inner(organization_id)")
        .eq("sales_funnels.organization_id", organizationId)
        .in("stage_type", ["won", "lost"]);
      const closedIds = (closedStages || []).map(s => s.id);

      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("responsavel_user_id", selectedUserId);
      if (closedIds.length > 0) {
        q = q.or(`funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedIds.join(",")})`);
      }
      const { count } = await q;
      return count || 0;
    },
    enabled: !!organizationId && !!selectedUserId,
    staleTime: 30 * 1000,
  });

  const selectedDisplay = collaborators.find(c => c.user_id === selectedUserId)?.display || "";
  const canConfirm = !!selectedUserId && (activeLeadsCount ?? 0) > 0 && !isPending;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Shuffle className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold">Redistribuir leads de um colaborador</p>
            <p className="text-xs text-muted-foreground">Solta os leads de um agente e os redistribui pelas roletas</p>
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Todos os leads ativos do colaborador serão desatribuídos e redistribuídos automaticamente
            pelas roletas configuradas (com base em source + funil de cada lead). O colaborador permanece
            ativo na organização.
          </p>

          <div className="space-y-2">
            <label className="text-xs font-medium">Colaborador</label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um colaborador" />
              </SelectTrigger>
              <SelectContent>
                {collaborators.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.display}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedUserId && (
            <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
              {countLoading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Calculando...
                </span>
              ) : (
                <span>
                  Este colaborador tem <strong>{activeLeadsCount ?? 0}</strong> lead(s) ativo(s) que serão redistribuídos.
                </span>
              )}
            </div>
          )}

          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={!canConfirm}
            className="w-full"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Redistribuir todos os leads
          </Button>
        </div>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar redistribuição</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a desatribuir <strong>{activeLeadsCount ?? 0}</strong> lead(s) de{" "}
              <strong>{selectedDisplay}</strong> e redistribuí-los automaticamente pelas roletas.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onConfirm(selectedUserId);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Redistribuir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
