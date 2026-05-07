import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shuffle, Loader2, Users, ChevronRight } from "lucide-react";

interface Props {
  onConfirm: (collaboratorUserId: string, configId: string | null) => void;
  isPending: boolean;
}

interface DistributionConfig {
  id: string;
  name: string;
  distribution_method: string;
  eligible_agents: string[] | null;
}

const methodLabels: Record<string, string> = {
  round_robin: "Rodízio",
  weighted: "Ponderado",
  load_based: "Por Carga",
  random: "Aleatório",
};

export function RedistributeFromCollaboratorPanel({ onConfirm, isPending }: Props) {
  const { organizationId } = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedConfigId, setSelectedConfigId] = useState<string>(""); // "" means "Auto"

  // Reset state when modal closes
  const handleModalChange = (open: boolean) => {
    setModalOpen(open);
    if (!open) {
      setSelectedUserId("");
      setSelectedConfigId("");
    }
  };

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
    enabled: !!organizationId && modalOpen,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar roletas ativas
  const { data: configs = [] } = useQuery({
    queryKey: ["active-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [] as DistributionConfig[];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, distribution_method, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DistributionConfig[];
    },
    enabled: !!organizationId && modalOpen,
    staleTime: 2 * 60 * 1000,
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
  const selectedConfigName = selectedConfigId
    ? configs.find(c => c.id === selectedConfigId)?.name
    : "Automático (escolhe a melhor por lead)";
  const canConfirm = !!selectedUserId && (activeLeadsCount ?? 0) > 0 && !isPending;

  return (
    <>
      {/* Trigger row — clicar abre o modal */}
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="w-full rounded-xl border bg-card p-4 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Shuffle className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Redistribuir leads de um colaborador</p>
            <p className="text-xs text-muted-foreground truncate">
              Solta os leads de um agente e os redistribui pelas roletas
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {/* Modal principal */}
      <Dialog open={modalOpen} onOpenChange={handleModalChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redistribuir leads de um colaborador</DialogTitle>
            <DialogDescription>
              Os leads ativos do colaborador serão desatribuídos e redistribuídos.
              O colaborador permanece ativo na organização.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Colaborador */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Colaborador</Label>
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

            {/* Count */}
            {selectedUserId && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                {countLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculando...
                  </span>
                ) : (
                  <span>
                    Este colaborador tem <strong>{activeLeadsCount ?? 0}</strong> lead(s) ativo(s).
                  </span>
                )}
              </div>
            )}

            {/* Roleta */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Roleta</Label>
              <RadioGroup
                value={selectedConfigId}
                onValueChange={setSelectedConfigId}
                className="space-y-2 max-h-56 overflow-y-auto"
                disabled={isPending}
              >
                <div className="flex items-center space-x-3 p-3 rounded-md border bg-muted/30">
                  <RadioGroupItem value="" id="rfc-auto" />
                  <Label htmlFor="rfc-auto" className="flex-1 cursor-pointer">
                    <div className="font-medium text-sm">Automático</div>
                    <div className="text-xs text-muted-foreground">
                      O sistema escolhe a melhor roleta para cada lead (por source + funil)
                    </div>
                  </Label>
                </div>
                {configs.map((config) => {
                  const agentCount = config.eligible_agents?.length ?? 0;
                  return (
                    <div key={config.id} className="flex items-center space-x-3 p-3 rounded-md border">
                      <RadioGroupItem value={config.id} id={`rfc-${config.id}`} />
                      <Label htmlFor={`rfc-${config.id}`} className="flex-1 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{config.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {methodLabels[config.distribution_method] || config.distribution_method}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Users className="h-3 w-3" />
                          {agentCount === 0
                            ? "Todos os colaboradores ativos"
                            : `${agentCount} colaborador${agentCount !== 1 ? "es" : ""}`}
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => handleModalChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={!canConfirm}
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Redistribuir todos os leads
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação destrutiva */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar redistribuição</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a desatribuir <strong>{activeLeadsCount ?? 0}</strong> lead(s) de{" "}
              <strong>{selectedDisplay}</strong> e redistribuí-los via{" "}
              <strong>{selectedConfigName}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                setModalOpen(false);
                onConfirm(selectedUserId, selectedConfigId || null);
                setSelectedUserId("");
                setSelectedConfigId("");
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Redistribuir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
