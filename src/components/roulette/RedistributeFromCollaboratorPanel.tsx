import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Shuffle, Loader2, ChevronRight, Search, ChevronDown, Dices, GitFork, UserRound,
} from "lucide-react";

interface Props {
  onConfirm: (
    collaboratorUserIds: string[],
    configId: string | null,
    destinationUserId: string | null,
  ) => Promise<void>;
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
  weighted: "Por porcentagem",
  load_based: "Por Carga",
  random: "Aleatório",
};

export function RedistributeFromCollaboratorPanel({ onConfirm, isPending }: Props) {
  const { organizationId } = useOrganization();
  const [modalOpen, setModalOpen] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedDestination, setSelectedDestination] = useState<string>("auto");
  const [searchTerm, setSearchTerm] = useState("");

  const handleModalChange = (open: boolean) => {
    if (!open && isPending) return;
    setModalOpen(open);
    if (!open) {
      setSelectedUserIds(new Set());
      setSelectedDestination("auto");
      setSearchTerm("");
      setShowConfirmation(false);
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

  const destinationAgents = useMemo(
    () => collaborators.filter(c => !selectedUserIds.has(c.user_id)),
    [collaborators, selectedUserIds],
  );
  const selectedConfigId = selectedDestination.startsWith("config:")
    ? selectedDestination.slice("config:".length)
    : null;
  const selectedDestinationUserId = selectedDestination.startsWith("user:")
    ? selectedDestination.slice("user:".length)
    : null;
  const destinationMode = selectedDestination.startsWith("config:")
    ? "roulette"
    : selectedDestination.startsWith("user:")
      ? "collaborator"
      : "random";
  const selectedDestinationName = selectedDestinationUserId
    ? destinationAgents.find(c => c.user_id === selectedDestinationUserId)?.display
    : selectedConfigId
      ? configs.find(c => c.id === selectedConfigId)?.name
      : "Aleatório (distribuição automática pelas regras configuradas)";
  const hasValidDestination = destinationMode === "random"
    || (destinationMode === "roulette" && !!selectedConfigId && configs.some(c => c.id === selectedConfigId))
    || (destinationMode === "collaborator"
      && !!selectedDestinationUserId
      && destinationAgents.some(c => c.user_id === selectedDestinationUserId));
  const canConfirm = selectedIdsArray.length > 0
    && (activeLeadsCount ?? 0) > 0
    && hasValidDestination
    && !isPending;

  const handleConfirmRedistribution = async () => {
    try {
      await onConfirm(selectedIdsArray, selectedConfigId, selectedDestinationUserId);
      handleModalChange(false);
    } catch {
      // A mutation exibe a mensagem detalhada. Mantemos a modal aberta para o
      // usuario poder revisar o destino e tentar novamente sem overlay preso.
      setShowConfirmation(false);
    }
  };

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
      <Dialog open={modalOpen} onOpenChange={handleModalChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Redistribuir leads de colaboradores</DialogTitle>
            <DialogDescription>
              Os leads ativos dos colaboradores selecionados serão desatribuídos e redistribuídos.
              Os colaboradores permanecem ativos na organização.
            </DialogDescription>
          </DialogHeader>

          {!showConfirmation ? (
          <div className="space-y-4 py-2">
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

            {/* Destino */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Destino dos leads</Label>
              <RadioGroup
                value={destinationMode}
                onValueChange={(mode) => {
                  if (mode === "random") setSelectedDestination("auto");
                  if (mode === "roulette") setSelectedDestination("config:");
                  if (mode === "collaborator") setSelectedDestination("user:");
                }}
                className="grid grid-cols-3 gap-2"
                disabled={isPending}
              >
                <Label
                  htmlFor="rfc-mode-random"
                  className={`cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                    destinationMode === "random" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value="random" id="rfc-mode-random" className="sr-only" />
                  <Dices className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Aleatório</span>
                </Label>
                <Label
                  htmlFor="rfc-mode-roulette"
                  className={`cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                    destinationMode === "roulette" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value="roulette" id="rfc-mode-roulette" className="sr-only" />
                  <GitFork className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Roleta</span>
                </Label>
                <Label
                  htmlFor="rfc-mode-collaborator"
                  className={`cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                    destinationMode === "collaborator" ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                  }`}
                >
                  <RadioGroupItem value="collaborator" id="rfc-mode-collaborator" className="sr-only" />
                  <UserRound className="mx-auto mb-1.5 h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Colaborador</span>
                </Label>
              </RadioGroup>

              {destinationMode === "random" && (
                <p className="px-1 text-xs text-muted-foreground">
                  O sistema escolhe automaticamente a melhor roleta para cada lead.
                </p>
              )}

              {destinationMode === "roulette" && (
                <Select
                  value={selectedConfigId || undefined}
                  onValueChange={(configId) => setSelectedDestination(`config:${configId}`)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione uma roleta" />
                  </SelectTrigger>
                  <SelectContent>
                    {configs.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Nenhuma roleta ativa
                      </div>
                    ) : configs.map((config) => (
                      <SelectItem key={config.id} value={config.id}>
                        {config.name} · {methodLabels[config.distribution_method] || config.distribution_method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {destinationMode === "collaborator" && (
                <Select
                  value={selectedDestinationUserId || undefined}
                  onValueChange={(userId) => setSelectedDestination(`user:${userId}`)}
                  disabled={isPending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o colaborador que receberá os leads" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinationAgents.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        Nenhum outro colaborador ativo
                      </div>
                    ) : destinationAgents.map((collaborator) => (
                      <SelectItem key={collaborator.user_id} value={collaborator.user_id}>
                        {collaborator.display}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          ) : (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">
              Você está prestes a redistribuir <strong>{activeLeadsCount ?? 0}</strong> lead(s) de{" "}
              <strong>{selectedIdsArray.length}</strong> colaborador(es) via{" "}
              <strong>{selectedDestinationName}</strong>.
              <p className="mt-2 text-xs text-muted-foreground">
                Os leads ganhos e perdidos não serão alterados. Esta ação não pode ser desfeita.
              </p>
            </div>
          )}

          <DialogFooter>
            {!showConfirmation ? (
              <>
                <Button variant="outline" onClick={() => handleModalChange(false)} disabled={isPending}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowConfirmation(true)}
                  disabled={!canConfirm}
                >
                  Redistribuir {activeLeadsCount ?? 0} lead(s)
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowConfirmation(false)} disabled={isPending}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmRedistribution}
                  disabled={isPending}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isPending ? "Redistribuindo..." : "Confirmar redistribuição"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
