import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { RouletteAnalyticsBar } from "@/components/roulette/RouletteAnalyticsBar";
import { RouletteCard } from "@/components/roulette/RouletteCard";
import { AgentCapacityPanel } from "@/components/roulette/AgentCapacityPanel";
import { SmartRulesPanel } from "@/components/roulette/SmartRulesPanel";
import { DistributionTimeline } from "@/components/roulette/DistributionTimeline";
import { CreateRouletteModal } from "@/components/roulette/CreateRouletteModal";
import { RedistributeFromCollaboratorPanel } from "@/components/roulette/RedistributeFromCollaboratorPanel";
import { RedistributeBatchDialog } from "@/components/RedistributeBatchDialog";
import { toast } from "sonner";
import {
  Plus,
  AlertCircle,
  RefreshCw,
  Shuffle,
  Users,
  Sparkles,
  History,
  Skull,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type TabValue = "roulettes" | "agents" | "rules" | "history";

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

const INITIAL_COLLAB_STATE: CollabRedistState = {
  phase: "idle",
  current: 0,
  total: 0,
  skipped: 0,
  log: [],
  errorMessage: null,
  lastParams: null,
};

function computeDelay(processedSoFar: number): number {
  return processedSoFar < 50 ? 2000 : 500;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function formatEta(remaining: number, processedSoFar: number): string {
  let totalMs = 0;
  for (let i = 0; i < remaining; i++) {
    totalMs += computeDelay(processedSoFar + i);
  }
  const totalSeconds = Math.ceil(totalMs / 1000);
  if (totalSeconds < 60) return `~${totalSeconds}s restantes`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `~${minutes}min restantes` : `~${minutes}min ${seconds}s restantes`;
}

export default function LeadDistribution() {
  const { isReady, isLoading: orgLoading } = useOrganizationReady();
  const { organizationId } = useOrganization();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>("roulettes");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<any>(null);
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [redistributeLostOpen, setRedistributeLostOpen] = useState(false);

  // Redistribution progress state (compartilhado por redistributeMutation e redistributeLostMutation)
  const [redistProgress, setRedistProgress] = useState({ current: 0, total: 0, isRunning: false });

  // Estado da redistribuição cadenciada de colaboradores (modal-controlled, isolado das outras 2)
  const [collabRedistState, setCollabRedistState] = useState<CollabRedistState>(INITIAL_COLLAB_STATE);
  const collabAbortRef = useRef<AbortController | null>(null);

  // Fetch configs for roulette cards
  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ["lead-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch funnels map
  const { data: funnelsMap } = useQuery({
    queryKey: ["funnels-map", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, string>;
      const { data } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", organizationId);
      const map: Record<string, string> = {};
      (data || []).forEach((f: any) => { map[f.id] = f.name; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Unassigned count
  const { data: unassignedCount } = useQuery({
    queryKey: ["unassigned-leads-count", organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("responsavel_user_id", null);
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Lost leads count
  const { data: lostLeadsCount } = useQuery({
    queryKey: ["lost-leads-count", organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      // Buscar IDs dos estágios do tipo "lost" dos funis da organização
      const { data: funnels } = await supabase
        .from("sales_funnels")
        .select("id")
        .eq("organization_id", organizationId);
      if (!funnels?.length) return 0;

      const funnelIds = funnels.map(f => f.id);
      const { data: lostStages } = await supabase
        .from("funnel_stages")
        .select("id")
        .in("funnel_id", funnelIds)
        .eq("stage_type", "lost");
      if (!lostStages?.length) return 0;

      const stageIds = lostStages.map(s => s.id);
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .in("funnel_stage_id", stageIds);
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Redistribute mutation - receives configId from dialog
  const redistributeMutation = useMutation({
    mutationFn: async (configId: string | null) => {
      if (!organizationId) return { redistributed: 0, skipped: 0 };

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      let totalRedistributed = 0;
      let totalSkipped = 0;
      let hasMore = true;
      let iteration = 0;
      const MAX_ITERATIONS = 500;
      const DELAY_MS = 800;

      while (hasMore && iteration < MAX_ITERATIONS) {
        iteration++;
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        const skipped = data?.skipped || 0;
        totalRedistributed += count;
        totalSkipped += skipped;

        setRedistProgress(prev => ({
          ...prev,
          current: totalRedistributed,
          total: Math.max(prev.total, total),
        }));

        hasMore = data?.has_more === true;

        // Guarda anti-loop-vazio: se nao processou nenhum mas diz has_more,
        // significa que faltam roletas/agentes. Saimos para nao loopar.
        if (count === 0 && hasMore) {
          break;
        }

        // Delay entre iteracoes para nao travar e dar folga ao banco
        if (hasMore && iteration < MAX_ITERATIONS) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return { redistributed: totalRedistributed, skipped: totalSkipped };
    },
    onSuccess: ({ redistributed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed} leads redistribuidos. ${skipped} aguardando configuracao de roleta/agente.`
          : `${redistributed} leads redistribuidos com sucesso!`;
        toast.success(msg);
      } else if (skipped > 0) {
        toast.warning(`${skipped} leads aguardando configuracao de roleta/agente.`);
      } else {
        toast.info("Nenhum lead para redistribuir");
      }
      setRedistributeOpen(false);
      setTimeout(() => setRedistProgress({ current: 0, total: 0, isRunning: false }), 3000);
    },
    onError: () => {
      toast.error("Erro ao redistribuir leads");
      setRedistProgress({ current: 0, total: 0, isRunning: false });
    },
  });

  // Redistribute lost leads mutation
  const redistributeLostMutation = useMutation({
    mutationFn: async (configId: string | null) => {
      if (!organizationId) return { redistributed: 0, skipped: 0 };

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      let totalRedistributed = 0;
      let totalSkipped = 0;
      let hasMore = true;
      let iteration = 0;
      const MAX_ITERATIONS = 500;
      const DELAY_MS = 800;

      while (hasMore && iteration < MAX_ITERATIONS) {
        iteration++;
        const { data, error } = await supabase.functions.invoke("redistribute-lost-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        const skipped = data?.skipped || 0;
        totalRedistributed += count;
        totalSkipped += skipped;

        setRedistProgress(prev => ({
          ...prev,
          current: totalRedistributed,
          total: Math.max(prev.total, total),
        }));

        hasMore = data?.has_more === true;

        if (count === 0 && hasMore) {
          break;
        }

        if (hasMore && iteration < MAX_ITERATIONS) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return { redistributed: totalRedistributed, skipped: totalSkipped };
    },
    onSuccess: ({ redistributed, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["lost-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      if (redistributed > 0) {
        const msg = skipped > 0
          ? `${redistributed} leads perdidos redistribuidos. ${skipped} aguardando configuracao.`
          : `${redistributed} leads perdidos redistribuidos!`;
        toast.success(msg);
      } else if (skipped > 0) {
        toast.warning(`${skipped} leads perdidos aguardando configuracao de roleta/agente.`);
      } else {
        toast.info("Nenhum lead perdido para redistribuir");
      }
      setRedistributeLostOpen(false);
      setTimeout(() => setRedistProgress({ current: 0, total: 0, isRunning: false }), 3000);
    },
    onError: () => {
      toast.error("Erro ao redistribuir leads perdidos");
      setRedistProgress({ current: 0, total: 0, isRunning: false });
    },
  });

  // Redistribuição cadenciada lead-a-lead — modal-controlled, isolada de redistProgress.
  // NÃO usa onSuccess/onError do useMutation (precisamos persistir o modal aberto
  // mesmo após "concluir"). O modal lê de collabRedistState para decidir fase 2/3.
  const runCollabRedistribution = useCallback(async (userIds: string[], configId: string | null) => {
    if (!organizationId) return;

    // Aborta loop anterior se ainda houver
    collabAbortRef.current?.abort();
    const controller = new AbortController();
    collabAbortRef.current = controller;
    const signal = controller.signal;

    setCollabRedistState({
      ...INITIAL_COLLAB_STATE,
      phase: "running",
      lastParams: { userIds, configId },
    });

    let totalRedistributed = 0;
    let totalSkipped = 0;
    let totalKnown = 0;
    let emptyIterationStreak = 0;
    const MAX_EMPTY_STREAK = 3;
    const MAX_ITERATIONS = 5000;

    const invokeOnce = async () => {
      return await supabase.functions.invoke("redistribute-from-collaborator", {
        body: {
          organization_id: organizationId,
          collaborator_user_ids: userIds,
          config_id: configId,
        },
      });
    };

    try {
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (signal.aborted) break;

        // 1 retry com backoff de 1s em falha de rede/edge
        let resp = await invokeOnce();
        if (resp.error || resp.data?.error) {
          if (signal.aborted) break;
          await abortableDelay(1000, signal);
          resp = await invokeOnce();
        }
        if (resp.error) throw resp.error;
        if (resp.data?.error) throw new Error(resp.data.error);

        const data = resp.data;
        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        const skipped = data?.skipped || 0;
        const hasMore = data?.has_more === true;
        const assignments: CollabAssignment[] = ((data?.assignments as Array<{
          lead_id: string;
          lead_nome: string;
          agent_user_id: string | null;
          agent_name: string | null;
        }>) || []).map((a) => ({ ...a, timestamp: Date.now() }));

        totalRedistributed += count;
        totalSkipped += skipped;
        totalKnown = Math.max(totalKnown, total);

        setCollabRedistState((prev) => ({
          ...prev,
          current: totalRedistributed + totalSkipped,
          total: Math.max(prev.total, total),
          skipped: totalSkipped,
          log: [...assignments.slice().reverse(), ...prev.log],
        }));

        // Anti-loop tolerante: até 3 iterações vazias com has_more=true
        if (count === 0 && skipped === 0 && hasMore) {
          emptyIterationStreak++;
          if (emptyIterationStreak >= MAX_EMPTY_STREAK) break;
        } else {
          emptyIterationStreak = 0;
        }

        if (!hasMore) break;
        if (signal.aborted) break;

        await abortableDelay(computeDelay(totalRedistributed + totalSkipped), signal);
      }

      if (signal.aborted) {
        setCollabRedistState((prev) => ({ ...prev, phase: "aborted" }));
        toast.info(`Operação cancelada. ${totalRedistributed} leads redistribuídos antes.`);
      } else {
        setCollabRedistState((prev) => ({ ...prev, phase: "done" }));
        if (totalRedistributed > 0) {
          const msg = totalSkipped > 0
            ? `${totalRedistributed} leads redistribuídos. ${totalSkipped} aguardando configuração de roleta/agente.`
            : `${totalRedistributed} leads redistribuídos com sucesso!`;
          toast.success(msg);
        } else if (totalSkipped > 0) {
          toast.warning(`${totalSkipped} leads aguardando configuração de roleta/agente.`);
        } else {
          toast.info("Nenhum lead foi redistribuído");
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError" || signal.aborted) {
        setCollabRedistState((prev) => ({ ...prev, phase: "aborted" }));
        return;
      }
      const message = err instanceof Error ? err.message : "Falha desconhecida";
      setCollabRedistState((prev) => ({ ...prev, phase: "error", errorMessage: message }));
      toast.error(`Erro: ${message}`);
    } finally {
      // Invalidar caches em todos os paths (done/aborted/error) — partial work
      // ainda altera contagens e estados que outras telas leem.
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      queryClient.invalidateQueries({ queryKey: ["multi-collaborator-active-leads-count"] });
    }
  }, [organizationId, queryClient]);

  const cancelCollabRedistribution = useCallback(() => {
    collabAbortRef.current?.abort();
  }, []);

  const closeCollabRedistribution = useCallback(() => {
    collabAbortRef.current?.abort();
    collabAbortRef.current = null;
    setCollabRedistState(INITIAL_COLLAB_STATE);
  }, []);

  const resumeCollabRedistribution = useCallback(() => {
    const params = collabRedistState.lastParams;
    if (!params) return;
    void runCollabRedistribution(params.userIds, params.configId);
  }, [collabRedistState.lastParams, runCollabRedistribution]);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase.from("lead_distribution_configs").delete().eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success("Roleta excluida");
    },
    onError: () => toast.error("Erro ao excluir roleta"),
  });

  if (orgLoading || !isReady) return <LoadingAnimation />;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-5xl mx-auto min-w-0 overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Roleta de Leads</h1>
          <p className="text-muted-foreground mt-1">Distribuicao inteligente e automatica entre sua equipe</p>
        </div>
        <div className="flex items-center gap-2">
          {permissions.canCreateRoulettes && (
            <Button onClick={() => { setEditConfig(null); setCreateModalOpen(true); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova roleta
            </Button>
          )}
        </div>
      </div>

      {/* Analytics bar */}
      <RouletteAnalyticsBar />

      {/* Redistribuir leads de um colaborador (colapsavel) */}
      <RedistributeFromCollaboratorPanel
        onConfirm={(userIds, configId) => void runCollabRedistribution(userIds, configId)}
        redistState={collabRedistState}
        onCancel={cancelCollabRedistribution}
        onClose={closeCollabRedistribution}
        onResume={resumeCollabRedistribution}
        computeEta={(remaining, current) => formatEta(remaining, current)}
      />

      {/* Redistribution progress bar */}
      {redistProgress.isRunning && redistProgress.total > 0 && (
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary animate-spin" />
              <span className="text-sm font-medium">Redistribuindo leads...</span>
            </div>
            <span className="text-xs text-muted-foreground">
              {redistProgress.current} / {redistProgress.total}
            </span>
          </div>
          <Progress
            value={redistProgress.total > 0 ? (redistProgress.current / redistProgress.total) * 100 : 0}
            className="h-2"
          />
        </div>
      )}

      {/* Completed progress bar (brief flash) */}
      {!redistProgress.isRunning && redistProgress.current > 0 && redistProgress.total > 0 && (
        <div className="rounded-xl border bg-emerald-50 dark:bg-emerald-500/10 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              {redistProgress.current} leads redistribuidos
            </span>
          </div>
          <Progress value={100} className="h-2" />
        </div>
      )}

      {/* Unassigned leads alert */}
      {(unassignedCount ?? 0) > 0 && !redistProgress.isRunning && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/5 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-500/10 shrink-0">
                <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
                  {unassignedCount} lead{unassignedCount !== 1 ? "s" : ""} sem responsavel
                </p>
                <p className="text-xs text-orange-600/70 dark:text-orange-400/60">
                  Leads que nao foram distribuidos automaticamente
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setRedistributeOpen(true)}
              className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-500/30 dark:text-orange-400 dark:hover:bg-orange-500/10"
            >
              <RefreshCw className="h-4 w-4" />
              Redistribuir agora
            </Button>
          </div>
        </div>
      )}

      {/* Lost leads alert */}
      {(lostLeadsCount ?? 0) > 0 && !redistProgress.isRunning && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/5 p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 shrink-0">
                <Skull className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                  {lostLeadsCount} lead{lostLeadsCount !== 1 ? "s" : ""} na etapa Perdido
                </p>
                <p className="text-xs text-red-600/70 dark:text-red-400/60">
                  Redistribua esses leads para tentar novamente com outro colaborador
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => setRedistributeLostOpen(true)}
              className="gap-2 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
            >
              <RefreshCw className="h-4 w-4" />
              Redistribuir perdidos
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="roulettes" className="gap-1.5">
            <Shuffle className="h-3.5 w-3.5" /> Roletas
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Agentes
          </TabsTrigger>
          {permissions.canCreateRoulettes && (
            <TabsTrigger value="rules" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Regras
            </TabsTrigger>
          )}
          <TabsTrigger value="history" className="gap-1.5">
            <History className="h-3.5 w-3.5" /> Historico
          </TabsTrigger>
        </TabsList>

        {/* Roletas tab */}
        <TabsContent value="roulettes" className="mt-4">
          {configsLoading ? (
            <LoadingAnimation text="Carregando roletas" />
          ) : !configs?.length ? (
            <div className="rounded-xl border bg-card py-16 text-center shadow-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-4">
                <RefreshCw className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Nenhuma roleta configurada</p>
              <p className="text-xs text-muted-foreground mb-4">
                Crie sua primeira roleta para comecar a distribuir leads automaticamente
              </p>
              {permissions.canCreateRoulettes && (
                <Button onClick={() => { setEditConfig(null); setCreateModalOpen(true); }} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> Criar primeira roleta
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {configs.map(config => (
                <RouletteCard
                  key={config.id}
                  config={config as any}
                  funnelName={funnelsMap?.[(config as any).funnel_id] || null}
                  onEdit={() => { setEditConfig(config); setCreateModalOpen(true); }}
                  onDelete={() => {
                    if (confirm("Tem certeza que deseja excluir esta roleta?")) {
                      deleteMutation.mutate(config.id);
                    }
                  }}
                  canDelete={permissions.canDeleteRoulettes}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Agentes tab */}
        <TabsContent value="agents" className="mt-4">
          <AgentCapacityPanel />
        </TabsContent>

        {/* Regras inteligentes tab */}
        {permissions.canCreateRoulettes && (
          <TabsContent value="rules" className="mt-4">
            <SmartRulesPanel />
          </TabsContent>
        )}

        {/* Historico tab */}
        <TabsContent value="history" className="mt-4">
          <DistributionTimeline />
        </TabsContent>
      </Tabs>

      {/* Create/Edit modal */}
      <CreateRouletteModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        editConfig={editConfig}
      />

      {/* Redistribute dialog - now passes configId properly */}
      <RedistributeBatchDialog
        open={redistributeOpen}
        onOpenChange={setRedistributeOpen}
        organizationId={organizationId}
        onConfirm={(configId) => redistributeMutation.mutate(configId)}
        isPending={redistributeMutation.isPending}
        showAutoOption={true}
        title="Redistribuir Leads sem Responsavel"
        description="Escolha qual roleta usar para redistribuir os leads."
      />

      {/* Redistribute lost leads dialog */}
      <RedistributeBatchDialog
        open={redistributeLostOpen}
        onOpenChange={setRedistributeLostOpen}
        organizationId={organizationId}
        onConfirm={(configId) => redistributeLostMutation.mutate(configId)}
        isPending={redistributeLostMutation.isPending}
        showAutoOption={true}
        title="Redistribuir Leads Perdidos"
        description="Esses leads serao movidos da etapa Perdido para o inicio do funil e redistribuidos entre os colaboradores."
      />
    </div>
  );
}
