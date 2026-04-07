import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff, GitFork, Users, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { LeadDistributionConfigModal } from "./LeadDistributionConfigModal";
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

export function LeadDistributionList() {
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
  });

  // Buscar todos os funis da organização para exibir nomes nos cards
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
  });

  // Buscar contagem de leads sem responsável
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
  });

  // Mutation para redistribuir leads sem responsável
  const redistributeMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organizacao nao encontrada");

      // Iniciar redistribuicao
      setProgress({ total: 0, processed: 0, isRunning: true });

      const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
        body: { organization_id: organizationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Atualizar com dados do progresso
      if (data?.total !== undefined && data?.processed !== undefined) {
        setProgress({
          total: data.total,
          processed: data.processed,
          isRunning: !data.batch_complete,
        });
      }

      if (data?.batch_complete || data?.redistributed_count !== undefined) {
        queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
        toast.success(`${data?.redistributed_count || 0} leads redistribuidos com sucesso!`);
        setProgress(prev => ({ ...prev, isRunning: false }));
      }
    },
    onError: (error: any) => {
      console.error("Erro ao redistribuir leads:", error);
      toast.error(error?.message || "Erro ao redistribuir leads");
      setProgress(prev => ({ ...prev, isRunning: false }));
    },
  });

  // Polling enquanto estiver rodando
  useEffect(() => {
    if (!progress.isRunning || !organizationId) return;

    const pollProgress = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("redistribute-unassigned-leads", {
          body: { organization_id: organizationId, check_progress: true },
        });

        if (!error && data) {
          setProgress({
            total: data.total || 0,
            processed: data.processed || 0,
            isRunning: !data.batch_complete,
          });

          if (data.batch_complete) {
            queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
            toast.success(`${data?.redistributed_count || 0} leads redistribuidos com sucesso!`);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar progresso:", err);
      }
    };

    const interval = setInterval(pollProgress, 1000);
    return () => clearInterval(interval);
  }, [progress.isRunning, organizationId, queryClient]);

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
      toast.success("Roleta excluída com sucesso");
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
      webhook: "Webhook (Formulários)",
    };
    return labels[sourceType] || sourceType;
  };

  const getMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      round_robin: "Rodízio",
      weighted: "Ponderado",
      load_based: "Por Carga",
      random: "Aleatório",
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
          <h2 className="text-2xl font-bold">Roletas de Distribuição</h2>
          <p className="text-muted-foreground">
            Gerencie múltiplas roletas por canal e funil. Leads são roteados para a roleta mais específica encontrada.
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
                      ? `Redistribuindo ${progress.processed} de ${progress.total} leads...`
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
                  {/* Barra de progresso */}
                  <div className="w-32 h-2 bg-amber-200 dark:bg-amber-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 transition-all duration-300"
                      style={{
                        width: `${progress.total > 0 ? (progress.processed / progress.total) * 100 : 0}%`
                      }}
                    />
                  </div>
                  <span className="text-sm text-amber-600 dark:text-amber-400 min-w-[60px]">
                    {progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0}%
                  </span>
                </div>
              ) : (
                <Button
                  onClick={() => redistributeMutation.mutate()}
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
                            Genérica
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
                      <span className="text-muted-foreground">Método:</span>{" "}
                      <span className="font-medium">{getMethodLabel(config.distribution_method)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Funil:</span>{" "}
                      <span className="font-medium">
                        {funnelName ?? <span className="text-amber-500">Todos (genérica)</span>}
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

      <LeadDistributionConfigModal
        open={isModalOpen}
        onOpenChange={handleModalClose}
        config={editingConfig}
        organizationId={organizationId}
      />
    </div>
  );
}
