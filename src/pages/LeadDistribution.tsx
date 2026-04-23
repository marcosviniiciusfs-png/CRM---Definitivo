import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { RouletteAnalyticsBar } from "@/components/roulette/RouletteAnalyticsBar";
import { RouletteSimulator } from "@/components/roulette/RouletteSimulator";
import { RouletteCard } from "@/components/roulette/RouletteCard";
import { AgentCapacityPanel } from "@/components/roulette/AgentCapacityPanel";
import { SmartRulesPanel } from "@/components/roulette/SmartRulesPanel";
import { DistributionTimeline } from "@/components/roulette/DistributionTimeline";
import { CreateRouletteModal } from "@/components/roulette/CreateRouletteModal";
import { RedistributeBatchDialog } from "@/components/RedistributeBatchDialog";
import { toast } from "sonner";
import {
  Plus,
  Target,
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

export default function LeadDistribution() {
  const { isReady, isLoading: orgLoading } = useOrganizationReady();
  const { organizationId } = useOrganization();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabValue>("roulettes");
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<any>(null);
  const [redistributeOpen, setRedistributeOpen] = useState(false);
  const [redistributeLostOpen, setRedistributeLostOpen] = useState(false);

  // Redistribution progress state
  const [redistProgress, setRedistProgress] = useState({ current: 0, total: 0, isRunning: false });

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
      if (!organizationId) return 0;

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      let totalRedistributed = 0;
      let hasMore = true;
      let iteration = 0;

      while (hasMore && iteration < 50) {
        iteration++;
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        totalRedistributed += count;

        // Update progress
        setRedistProgress(prev => ({
          ...prev,
          current: totalRedistributed,
          total: Math.max(prev.total, total),
        }));

        hasMore = data?.has_more === true && count > 0;
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return totalRedistributed;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      if (count && count > 0) {
        toast.success(`${count} leads redistribuidos com sucesso!`);
      } else {
        toast.info("Nenhum lead para redistribuir");
      }
      setRedistributeOpen(false);
      // Reset progress after a delay
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
      if (!organizationId) return 0;

      setRedistProgress({ current: 0, total: 0, isRunning: true });

      let totalRedistributed = 0;
      let hasMore = true;
      let iteration = 0;

      while (hasMore && iteration < 50) {
        iteration++;
        const { data, error } = await supabase.functions.invoke("redistribute-lost-leads", {
          body: { organization_id: organizationId, config_id: configId },
        });
        if (error) throw error;

        const count = data?.redistributed_count || 0;
        const total = data?.total || 0;
        totalRedistributed += count;

        setRedistProgress(prev => ({
          ...prev,
          current: totalRedistributed,
          total: Math.max(prev.total, total),
        }));

        hasMore = data?.has_more === true && count > 0;
      }

      setRedistProgress(prev => ({ ...prev, isRunning: false }));
      return totalRedistributed;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["lost-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      if (count && count > 0) {
        toast.success(`${count} leads perdidos redistribuidos!`);
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
          <Button
            variant="outline"
            onClick={() => setSimulatorOpen(!simulatorOpen)}
            className="gap-2"
          >
            <Target className="h-4 w-4" />
            Simular
          </Button>
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

      {/* Simulator (collapsible) */}
      <RouletteSimulator open={simulatorOpen} onToggle={() => setSimulatorOpen(!simulatorOpen)} />

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
