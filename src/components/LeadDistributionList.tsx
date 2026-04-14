import { useState, useEffect } from "react";
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
  const { data: unassignedCount } = useQuery({
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

  // Verificar capacidade - otimizado: apenas agentes com capacity_enabled=true
  const { data: capacityAlerts } = useQuery({
    queryKey: ["capacity-alerts", organizationId],
    queryFn: async () => {
      if (!organizationId || !permissions.canManageAgentSettings) return [] as CapacityAlert[];

      // Buscar apenas agentes com limite de capacidade ativo
      const { data: cappedAgents } = await supabase
        .from("agent_distribution_settings")
        .select("user_id, max_capacity")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false)
        .eq("capacity_enabled", true);

      if (!cappedAgents || cappedAgents.length === 0) return [] as CapacityAlert[];

      // Batch: contar leads por agente em uma unica query
      const agentIds = cappedAgents.map(a => a.user_id);
      const { data: leadCounts } = await supabase
        .from("leads")
        .select("responsavel_user_id")
        .eq("organization_id", organizationId)
        .in("responsavel_user_id", agentIds);

      // Contar por agente
      const countMap = new Map<string, number>();
      for (const row of (leadCounts || [])) {
        const uid = row.responsavel_user_id;
        countMap.set(uid, (countMap.get(uid) || 0) + 1);
      }

      // Verificar quais agentes estao no limite
      const atCapacitySet = new Set<string>();
      for (const agent of cappedAgents) {
        if ((countMap.get(agent.user_id) || 0) >= agent.max_capacity) {
          atCapacitySet.add(agent.user_id);
        }
      }

      if (atCapacitySet.size === 0) return [] as CapacityAlert[];

      // Buscar configs ativas
      const { data: activeConfigs } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, source_type, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true);

      if (!activeConfigs || activeConfigs.length === 0) return [] as CapacityAlert[];

      // Buscar TODOS os agentes ativos (para saber o total por config)
      const { data: allActiveAgents } = await supabase
        .from("agent_distribution_settings")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("is_paused", false);

      const allActiveIds = new Set((allActiveAgents || []).map(a => a.user_id));
      const alerts: CapacityAlert[] = [];

      for (const config of activeConfigs) {
        const eligibleIds: string[] = config.eligible_agents?.length > 0
          ? config.eligible_agents.filter((id: string) => allActiveIds.has(id))
          : [...allActiveIds];

        if (eligibleIds.length === 0) continue;

        const cappedInConfig = eligibleIds.filter(id => atCapacitySet.has(id));
        // Só alertar se TODOS os agentes elegíveis com limite estão no limite
        // e pelo menos metade dos agentes estão no limite
        if (cappedInConfig.length > 0 && cappedInConfig.length === eligibleIds.filter(id => cappedAgents.some(a => a.user_id === id)).length) {
          alerts.push({
            configId: config.id,
            configName: config.name,
            sourceType: config.source_type,
            totalAgents: eligibleIds.length,
            agentsAtCapacity: cappedInConfig.length,
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

  // Progress bar percentage
  const progressPercent = progress.total > 0
    ? Math.min(Math.round((progress.processed / progress.total) * 100), 100)
    : 0;

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

      {/* Secao de leads sem responsavel + barra de progresso */}
      {(unassignedCount !== undefined && unassignedCount > 0) || progress.isRunning ? (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 overflow-hidden">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    {progress.isRunning
                      ? `Redistribuindo leads... ${progress.processed} de ${progress.total}`
                      : `${unassignedCount} lead${unassignedCount !== 1 ? "s" : ""} sem responsavel`
                    }
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {progress.isRunning
                      ? "Por favor, aguarde enquanto os leads sao distribuidos..."
                      : "Leads que entraram no CRM mas nao foram distribuidos"
                    }
                  </p>
                </div>
              </div>
              {!progress.isRunning && (
                <Button
                  onClick={() => setRouletteDialogOpen(true)}
                  disabled={redistributeMutation.isPending}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Redistribuir agora
                </Button>
              )}
            </div>

            {/* Barra de progresso animada */}
            {progress.isRunning && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-700 dark:text-amber-300 font-medium">
                    {progressPercent}%
                  </span>
                  <span className="text-amber-600 dark:text-amber-400">
                    {progress.processed} de {progress.total} leads redistribuidos
                  </span>
                </div>
                <div className="w-full bg-amber-200 dark:bg-amber-900 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-amber-500 h-3 rounded-full transition-all duration-700 ease-out relative overflow-hidden"
                    style={{ width: `${progressPercent}%` }}
                  >
                    {/* Efeito de brilho animado */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
                      style={{
                        animation: 'shimmer 1.5s infinite',
                        transform: 'translateX(-100%)',
                      }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <RefreshCw className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 animate-spin" />
                  <span className="text-xs text-amber-600 dark:text-amber-400">
                    Processando em lotes de 200 leads...
                  </span>
                </div>
              </div>
            )}

            {/* Resultado final */}
            {!progress.isRunning && progress.processed > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-sm text-green-700 dark:text-green-400 font-medium">
                  ✓ {progress.processed} leads redistribuidos com sucesso!
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

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
        title="Redistribuir Leads sem Responsavel"
        description="Escolha qual roleta usar para redistribuir os leads."
      />

      <LeadDistributionConfigModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        config={editingConfig}
        organizationId={organizationId}
      />

      {/* Modal de alerta de capacidade - visivel apenas para admin/owner */}
      <Dialog open={capacityAlertOpen} onOpenChange={setCapacityAlertOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Alerta de Capacidade
            </DialogTitle>
            <DialogDescription>
              Alguns agentes com limite ativo estao na capacidade maxima.
              Novos leads podem nao ser distribuidos para eles.
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
                  {alert.agentsAtCapacity}/{alert.totalAgents} agentes na capacidade maxima
                </p>
              </div>
            ))}

            {unassignedCount !== undefined && unassignedCount > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {unassignedCount} leads sem responsavel acumulados
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Estes leads nao estao sendo distribuidos porque os agentes com limite estao lotados.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-sm font-medium">Acoes sugeridas:</p>
            <ul className="text-sm text-muted-foreground list-disc pl-4 space-y-1">
              <li>Aumentar a capacidade maxima ou desativar o limite nas Configuracoes de Agente</li>
              <li>Adicionar mais colaboradores a equipe</li>
              <li>Mover leads ja atendidos para "Ganho" ou "Perda" para liberar vagas</li>
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
                Configuracoes de Agente
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
