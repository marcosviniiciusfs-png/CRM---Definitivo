import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Shuffle, Loader2, Users, ChevronRight, Search, ChevronDown, CheckCircle2, XCircle, AlertTriangle, Ban } from "lucide-react";
import { Progress } from "@/components/ui/progress";

type CollabRedistPhase = "idle" | "running" | "done" | "aborted" | "error";

interface CollabAssignment {
  lead_id: string;
  lead_nome: string;
  agent_user_id: string | null;
  agent_name: string | null;
  timestamp: number;
}

interface CollabRedistState {
  phase: CollabRedistPhase;
  current: number;
  total: number;
  skipped: number;
  log: CollabAssignment[];
  errorMessage: string | null;
  lastParams: { userIds: string[]; configId: string | null } | null;
}

interface Props {
  onConfirm: (collaboratorUserIds: string[], configId: string | null) => void;
  redistState: CollabRedistState;
  onCancel: () => void;
  onClose: () => void;
  onResume: () => void;
  computeEta: (remaining: number, current: number) => string;
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

export function RedistributeFromCollaboratorPanel({ onConfirm, redistState, onCancel, onClose, onResume, computeEta }: Props) {
  const { organizationId } = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedConfigId, setSelectedConfigId] = useState<string>(""); // "" = Auto
  const [searchTerm, setSearchTerm] = useState("");

  const phase = redistState.phase;
  const isPending = phase === "running";
  const isFinished = phase === "done" || phase === "aborted" || phase === "error";

  // Forçar modal aberto durante execução/finalização (não permite fechar pelo overlay)
  const dialogOpen = modalOpen || isPending || isFinished;

  const handleModalChange = (open: boolean) => {
    // Bloqueia close enquanto está rodando ou em fase final (deve usar botão Fechar)
    if (!open && (isPending || isFinished)) return;
    setModalOpen(open);
    if (!open) {
      setSelectedUserIds(new Set());
      setSelectedConfigId("");
      setSearchTerm("");
    }
  };

  const handleClose = () => {
    onClose();
    setModalOpen(false);
    setSelectedUserIds(new Set());
    setSelectedConfigId("");
    setSearchTerm("");
  };

  const handleCancelClick = () => {
    if (redistState.current > 0) {
      setCancelConfirmOpen(true);
    } else {
      onCancel();
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
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

  // Filtro de busca aplicado a colaboradores
  const filteredCollaborators = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return collaborators;
    return collaborators.filter(c => c.display.toLowerCase().includes(term));
  }, [collaborators, searchTerm]);

  const selectedIdsArray = useMemo(() => Array.from(selectedUserIds), [selectedUserIds]);

  // Contar leads ativos dos selecionados (somado)
  const { data: activeLeadsCount, isLoading: countLoading } = useQuery({
    queryKey: ["multi-collaborator-active-leads-count", organizationId, selectedIdsArray.join(",")],
    queryFn: async () => {
      if (!organizationId || selectedIdsArray.length === 0) return 0;

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
        .in("responsavel_user_id", selectedIdsArray);
      if (closedIds.length > 0) {
        q = q.or(`funnel_stage_id.is.null,funnel_stage_id.not.in.(${closedIds.join(",")})`);
      }
      const { count } = await q;
      return count || 0;
    },
    enabled: !!organizationId && selectedIdsArray.length > 0,
    staleTime: 30 * 1000,
  });

  const allFilteredSelected = filteredCollaborators.length > 0
    && filteredCollaborators.every(c => selectedUserIds.has(c.user_id));

  const toggleSelectAllFiltered = () => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredCollaborators.forEach(c => next.delete(c.user_id));
      } else {
        filteredCollaborators.forEach(c => next.add(c.user_id));
      }
      return next;
    });
  };

  const selectedConfigName = selectedConfigId
    ? configs.find(c => c.id === selectedConfigId)?.name
    : "Automático (escolhe a melhor por lead)";
  const canConfirm = selectedIdsArray.length > 0 && (activeLeadsCount ?? 0) > 0 && !isPending;

  // Set de user_ids ativos da org — usado para contar apenas agentes valid+ativos
  // dentro de cada eligible_agents (ignora inativos e fantasmas).
  const activeUserIdsSet = useMemo(
    () => new Set(collaborators.map(c => c.user_id)),
    [collaborators]
  );

  return (
    <>
      {/* Trigger row */}
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
              Solta os leads de um ou mais agentes e os redistribui pelas roletas
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>

      {/* Modal principal */}
      <Dialog open={dialogOpen} onOpenChange={handleModalChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redistribuir leads de colaboradores</DialogTitle>
            <DialogDescription>
              Os leads ativos dos colaboradores selecionados serão desatribuídos e redistribuídos.
              Os colaboradores permanecem ativos na organização.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {phase === "idle" && (
            <>
            {/* Colaboradores (multi-select via Popover) */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Colaboradores</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    disabled={isPending}
                  >
                    <span className={selectedIdsArray.length === 0 ? "text-muted-foreground" : ""}>
                      {selectedIdsArray.length === 0
                        ? "Selecionar colaboradores"
                        : `${selectedIdsArray.length} colaborador(es) selecionado(s)`}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Buscar colaborador..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="pl-9 h-8 text-sm"
                        disabled={isPending}
                      />
                    </div>
                  </div>
                  <div
                    className="max-h-72 overflow-y-auto overscroll-contain"
                    style={{ WebkitOverflowScrolling: "touch" }}
                    onWheel={(e) => {
                      // Stop wheel events from bubbling to Dialog/Popover ancestors
                      // que podem capturar e impedir o scroll desta lista interna.
                      e.stopPropagation();
                    }}
                  >
                    {filteredCollaborators.length > 0 && (
                      <div className="flex items-center gap-3 p-2.5 border-b bg-muted/30 sticky top-0 z-10">
                        <Checkbox
                          id="rfc-all"
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAllFiltered}
                          disabled={isPending}
                        />
                        <Label htmlFor="rfc-all" className="text-xs font-medium cursor-pointer flex-1">
                          {allFilteredSelected ? "Desmarcar todos" : "Selecionar todos"}
                          {searchTerm && ` (${filteredCollaborators.length} filtrado${filteredCollaborators.length !== 1 ? "s" : ""})`}
                        </Label>
                      </div>
                    )}
                    {filteredCollaborators.length === 0 ? (
                      <div className="p-3 text-center text-xs text-muted-foreground">
                        {collaborators.length === 0 ? "Nenhum colaborador ativo" : "Nenhum resultado"}
                      </div>
                    ) : (
                      filteredCollaborators.map(c => (
                        <div key={c.user_id} className="flex items-center gap-3 p-2.5 border-t first:border-t-0 hover:bg-muted/30">
                          <Checkbox
                            id={`rfc-c-${c.user_id}`}
                            checked={selectedUserIds.has(c.user_id)}
                            onCheckedChange={() => toggleUser(c.user_id)}
                            disabled={isPending}
                          />
                          <Label htmlFor={`rfc-c-${c.user_id}`} className="text-sm cursor-pointer flex-1 truncate">
                            {c.display}
                          </Label>
                        </div>
                      ))
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Count */}
            {selectedIdsArray.length > 0 && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs">
                {countLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculando...
                  </span>
                ) : (
                  <span>
                    Total de <strong>{activeLeadsCount ?? 0}</strong> lead(s) ativo(s) entre os{" "}
                    <strong>{selectedIdsArray.length}</strong> colaborador(es) selecionado(s).
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
                  const arr = config.eligible_agents || [];
                  const validActiveCount = arr.filter(id => activeUserIdsSet.has(id)).length;
                  const isUnrestricted = arr.length === 0;
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
                          {isUnrestricted
                            ? "Todos os colaboradores ativos"
                            : validActiveCount === 0
                              ? "Nenhum colaborador ativo"
                              : `${validActiveCount} colaborador${validActiveCount !== 1 ? "es" : ""} ativo${validActiveCount !== 1 ? "s" : ""}`}
                        </div>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
            </>
            )}

            {/* Fase 2 — Em execução */}
            {phase === "running" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-sm font-medium">Redistribuindo {redistState.total} lead(s)...</span>
                </div>
                <div className="space-y-1">
                  <Progress
                    value={redistState.total > 0 ? (redistState.current / redistState.total) * 100 : 0}
                    className="h-2"
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{redistState.current} / {redistState.total}</span>
                    <span>{computeEta(Math.max(0, redistState.total - redistState.current), redistState.current)}</span>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 max-h-72 overflow-y-auto p-2 space-y-1">
                  {redistState.log.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">Iniciando...</p>
                  ) : (
                    redistState.log.slice(0, 50).map((a, i) => (
                      <div key={`${a.lead_id}-${a.timestamp}-${i}`} className="flex items-center gap-2 text-xs">
                        {a.agent_user_id ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span className="truncate"><span className="font-medium">{a.lead_nome}</span> → {a.agent_name}</span>
                          </>
                        ) : (
                          <>
                            <Ban className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span className="truncate text-muted-foreground"><span className="font-medium">{a.lead_nome}</span> — sem agente compatível</span>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {phase === "idle" && (
              <>
                <Button variant="outline" onClick={() => handleModalChange(false)}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  disabled={!canConfirm}
                >
                  Redistribuir {activeLeadsCount ?? 0} lead(s)
                </Button>
              </>
            )}
            {phase === "running" && (
              <Button variant="destructive" onClick={handleCancelClick}>
                <XCircle className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
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
              <strong>{selectedIdsArray.length}</strong> colaborador(es) selecionado(s) e redistribuí-los via{" "}
              <strong>{selectedConfigName}</strong>. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                // Modal pai permanece aberto durante a operação (fase 2/3)
                onConfirm(selectedIdsArray, selectedConfigId || null);
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
