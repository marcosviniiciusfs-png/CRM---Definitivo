import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff, GitFork, Users, RefreshCw, AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeadDistributionConfigModal } from "./LeadDistributionConfigModal";
import { RedistributeBatchDialog } from "./RedistributeBatchDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { LoadingAnimation } from "@/components/LoadingAnimation";

interface DistributionConfig {
  id: string;
  name: string;
  description?: string;
  source_type: string;
  source_identifiers: any;
  distribution_method: string;
  is_active: boolean;
  triggers: any;
  auto_redistribute: boolean;
  redistribution_timeout_minutes?: number;
  eligible_agents?: string[];
  team_id?: string | null;
  funnel_id?: string | null;
  funnel_stage_id?: string | null;
}

interface Funnel {
  id: string;
  name: string;
}

interface RedistributionProgress {
  total: number;
  processed: number;
  isRunning: boolean;
}

interface CapacityAlert {
  configId: string;
  configName: string;
  sourceType: string;
  totalAgents: number;
  agentsAtCapacity: number;
}

interface LeadDistributionListProps {
  onNavigateToAgentSettings?: () => void;
}

export function LeadDistributionList({ onNavigateToAgentSettings }: LeadDistributionListProps) {
  const { user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<DistributionConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [progress, setProgress] = useState<RedistributionProgress>({
    total: 0,
    processed: 0,
    isRunning: false,
  });
  const [rouletteDialogOpen, setRouletteDialogOpen] = useState(false);
  const [capacityAlertOpen, setCapacityAlertOpen] = useState(false);

  const { data: organizationId } = useQuery({
    queryKey: ["user-organization", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();
      return data?.organization_id;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const { data: configs, isLoading } = useQuery({
    queryKey: ["lead-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DistributionConfig[];
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar todos os funis da organizacao para exibir nomes nos cards
  const { data: funnelsMap } = useQuery({
    queryKey: ["funnels-map", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", organizationId);

      if (error) throw error;
      const map: Record<string, string> = {};
      (data as Funnel[]).forEach((f) => { map[f.id] = f.name; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Buscar contagem de leads sem responsavel
  const { data: unassignedCount, refetch: refetchUnassigned } = useQuery({
    queryKey: ["unassigned-leads-count", organizationId],
    queryFn: async () => {
      if (!organizationId) return 0;
      const { count, error } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("responsavel_user_id", null);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  // Verificar se alguma roleta tem TODOS os agentes no limite de capacidade
  const { data: capacityAlerts } = useQuery({
    queryKey: ["capacity-alerts", organizationId],
    queryFn: async () => {
      if (!organizationId || !permissions.canManageAgentSettings) return [] as CapacityAlert[];

      const { data: activeConfigs } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, source_type, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (!activeConfigs || activeConfigs.length === 0) return [] as CapacityAlert[];

      const { data: agentSettings } = await supabase
        .from("agent_distribution_settings")
        .select("user_id, max_capacity, is_active, is_paused")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false);

      if (!agentSettings || agentSettings.length === 0) return [] as CapacityAlert[];

      const alerts: CapacityAlert[] = [];

      for (const config of activeConfigs) {
        const eligibleIds: string[] = config.eligible_agents?.length > 0
          ? config.eligible_agents
          : agentSettings.map(a => a.user_id);

        const eligibleAgents = agentSettings.filter(a => eligibleIds.includes(a.user_id));
        if (eligibleAgents.length === 0) continue;

        let atCapacityCount = 0;
        for (const agent of eligibleAgents) {
          const { count } = await supabase
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("responsavel_user_id", agent.user_id)
            .eq("organization_id", organizationId);

          if ((count || 0) >= agent.max_capacity) {
            atCapacityCount++;
          }
        }

        if (atCapacityCount === eligibleAgents.length) {
          alerts.push({
            configId: config.id,
            configName: config.name,
            sourceType: config.source_type,
            totalAgents: eligibleAgents.length,
            agentsAtCapacity: atCapacityCount,
          });
        }
      }

      return alerts;
    },
    enabled: !!organizationId && !!permissions.canManageAgentSettings,
    staleTime: 5 * 60 * 1000,
  });

  // Auto-abrir alerta de capacidade quando detectado
  useEffect(() => {
    if (capacityAlerts && capacityAlerts.length > 0 && permissions.canManageAgentSettings) {
      setCapacityAlertOpen(true);
    }
  }, [capacityAlerts, permissions.canManageAgentSettings]);

  // Mutation para redistribuir leads em batches
  const redistributeMutation = useMutation({
    mutationFn: async (selectedConfigId: string | null) => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");

      setProgress({ total: 0, processed: 0, isRunning: true });
      let totalRedistributed = 0;
      let totalLeads = 0;
      let hasMore = true;

      // Processar em batches ate completar (max 50 iteracoes de seguranca)
      const MAX_ITERATIONS = 50;
      let iteration = 0;

      while (hasMore && iteration < MAX_ITERATIONS) {
        iteration++;
        const body: Record<string, any> = { organization_id: organizationId };
        if (selectedConfigId) body.config_id = selectedConfigId;
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body,
        });

        if (error) throw error;

        totalRedistributed += data?.redistributed_count || 0;
        totalLeads = data?.total || 0;
        hasMore = data?.has_more === true;

        // Seguranca: se nao redistribuiu nenhum neste batch, parar
        if ((data?.redistributed_count || 0) === 0) {
          hasMore = false;
        }

        setProgress({
          total: totalLeads,
          processed: totalRedistributed,
          isRunning: hasMore,
        });
      }

      return { redistributed_count: totalRedistributed, total: totalLeads };
    },
    onSuccess: (data) => {
      setProgress(prev => ({ ...prev, isRunning: false }));
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });

      if (data.redistributed_count > 0) {
        toast.success(`${data.redistributed_count} leads redistribuidos com sucesso!`);
      } else {
        toast.info("Nenhum lead para redistribuir");
      }
    },
    onError: (error: any) => {
      console.error("Erro ao redistribuir leads:", error);
      toast.error(error?.message || "Erro ao redistribuir leads");
      setProgress(prev => ({ ...prev, isRunning: false }));
    },
  });

  const handleRedistributeConfirm = (configId: string | null) => {
    redistributeMutation.mutate(configId);
  };

  const deleteMutation = useMutation({
    mutationFn: async (configId: string) => {
      const { error } = await supabase
        .from("lead_distribution_configs")
        .delete()
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success("Roleta excluida com sucesso");
    },
    onError: () => {
      toast.error("Erro ao excluir roleta");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ configId, isActive }: { configId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("lead_distribution_configs")
        .update({ is_active: !isActive })
        .eq("id", configId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success("Status atualizado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao atualizar status");
    },
  });

  const getSourceTypeLabel = (sourceType: string) => {
    const labels: Record<string, string> = {
      all: "Todos os canais",
      whatsapp: "WhatsApp",
      facebook: "Facebook Leads",
      webhook: "Webhook (Formularios)",
    };
    return labels[sourceType] || sourceType;
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      round_robin: "Rodizio",
      weighted: "Ponderado",
      load_based: "Por Carga",
      random: "Aleatorio",
    };
    return labels[method] || method;
  };

  const handleEdit = (config: DistributionConfig) => {
    setEditingConfig(config);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingConfig(null);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingConfig(null);
  };

  if (isLoading) {
    return <LoadingAnimation text="Carregando roletas" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Roletas de Distribuicao</h2>
          <p className="text-muted-foreground">
            Gerencie multiplas roletas por canal e funil. Leads sao roteados para a roleta mais especifica encontrada.
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Roleta
        </Button>
      </div>

      {/* Secao de leads sem responsavel */}
      {unassignedCount !== undefined && unassignedCount > 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {progress.isRunning
                      ? `Redistribuindo leads...`
                      : `${unassignedCount} lead${unassignedCount !== 1 ? "s" : ""} sem responsavel`
                    }
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {progress.isRunning
                      ? "Por favor, aguarde..."
                      : "Leads que entraram no CRM mas nao foram distribuidos"
                    }
                  </p>
                </div>
              </div>
              {progress.isRunning ? (
                <div className="flex items-center gap-3">
                  {/* Indicador de loading */}
                  <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400 animate-spin" />
                  <span className="text-sm text-amber-600 dark:text-amber-400">
                    Processando...
                  </span>
                </div>
              ) : (
                <Button
                  onClick={() => setRouletteDialogOpen(true)}
                  disabled={redistributeMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${redistributeMutation.isPending ? "animate-spin" : ""}`} />
                  {redistributeMutation.isPending ? "Redistribuindo..." : "Redistribuir agora"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {configs?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground mb-4">
                Nenhuma roleta configurada ainda
              </p>
              <Button onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeira Roleta
              </Button>
            </CardContent>
          </Card>
        ) : (
          configs?.map((config) => {
            const funnelName = config.funnel_id && funnelsMap
              ? funnelsMap[config.funnel_id]
              : null;
            const agentCount = config.eligible_agents?.length ?? 0;

            return (
              <Card key={config.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle>{config.name}</CardTitle>
                        <Badge
                          variant={config.is_active ? "default" : "secondary"}
                          style={config.is_active ? { backgroundColor: '#66ee78', color: '#000' } : undefined}
                        >
                          {config.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                        <Badge variant="outline">{getSourceTypeLabel(config.source_type)}</Badge>
                        {funnelName && (
                          <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400">
                            <GitFork className="h-3 w-3" />
                            {funnelName}
                          </Badge>
                        )}
                        {!funnelName && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400 text-xs">
                            Generica
                          </Badge>
                        )}
                      </div>
                      {config.description && (
                        <CardDescription>{config.description}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="ghostIcon"
                        size="icon"
                        onClick={() => toggleActiveMutation.mutate({ configId: config.id, isActive: config.is_active })}
                      >
                        {config.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghostIcon"
                        size="icon"
                        onClick={() => handleEdit(config)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {permissions.canDeleteRoulettes && (
                        <Button
                          variant="ghostIcon"
                          size="icon"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir esta roleta?")) {
                              deleteMutation.mutate(config.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Metodo:</span>{" "}
                      <span className="font-medium">{getMethodLabel(config.distribution_method)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Funil:</span>{" "}
                      <span className="font-medium">
                        {funnelName ?? <span className="text-amber-500">Todos (generica)</span>}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Agentes:</span>{" "}
                      <span className="font-medium flex items-center gap-1 inline-flex">
                        <Users className="h-3.5 w-3.5" />
                        {agentCount === 0 ? "Todos os ativos" : `${agentCount} selecionado${agentCount !== 1 ? "s" : ""}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Gatilhos:</span>{" "}
                      <span className="font-medium">
                        {Array.isArray(config.triggers) ? config.triggers.length : 0} configurados
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <RedistributeBatchDialog
        open={rouletteDialogOpen}
        onOpenChange={setRouletteDialogOpen}
        organizationId={organizationId}
        onConfirm={handleRedistributeConfirm}
        isPending={redistributeMutation.isPending}
        showAutoOption={true}
        title="Redistribuir Leads sem Responsável"
        description="Escolha qual roleta usar para redistribuir os leads."
      />

      <LeadDistributionConfigModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        config={editingConfig}
        organizationId={organizationId}
      />

      {/* Modal de alerta de capacidade - visível apenas para admin/owner */}
      <Dialog open={capacityAlertOpen} onOpenChange={setCapacityAlertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Alerta de Capacidade
            </DialogTitle>
            <DialogDescription>
              Todos os agentes de uma ou mais roletas estão na capacidade máxima.
              Novos leads não estão sendo distribuídos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {capacityAlerts?.map((alert) => (
              <div key={alert.configId} className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <p className="font-medium">{alert.configName}</p>
                <p className="text-sm text-muted-foreground">
                  Canal: {getSourceTypeLabel(alert.sourceType)}
                </p>
                <p className="text-sm text-destructive font-medium mt-1">
                  {alert.agentsAtCapacity}/{alert.totalAgents} agentes na capacidade máxima
                </p>
              </div>
            ))}

            {unassignedCount !== undefined && unassignedCount > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {unassignedCount} leads sem responsável acumulados
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Estes leads não estão sendo distribuídos porque todos os agentes estão lotados.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">Ações sugeridas:</p>
            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              <li>Aumentar a capacidade máxima dos agentes nas Configurações de Agente</li>
              <li>Adicionar mais colaboradores à equipe</li>
              <li>Mover leads já atendidos para "Ganho" ou "Perda" para liberar vagas</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCapacityAlertOpen(false)}>
              Fechar
            </Button>
            {onNavigateToAgentSettings && (
              <Button onClick={() => {
                setCapacityAlertOpen(false);
                onNavigateToAgentSettings();
              }}>
                Configurações de Agente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
