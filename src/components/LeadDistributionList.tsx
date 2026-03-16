import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff, GitFork, Users } from "lucide-react";
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

export function LeadDistributionList() {
  const { user } = useAuth();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const [editingConfig, setEditingConfig] = useState<DistributionConfig | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
