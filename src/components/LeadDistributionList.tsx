import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Power, PowerOff } from "lucide-react";
import { toast } from "sonner";
import { LeadDistributionConfigModal } from "./LeadDistributionConfigModal";

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
}

export function LeadDistributionList() {
  const { user } = useAuth();
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
    return <div>Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Roletas de Distribuição</h2>
          <p className="text-muted-foreground">
            Gerencie múltiplas configurações de distribuição para diferentes canais
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
          configs?.map((config) => (
            <Card key={config.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle>{config.name}</CardTitle>
                      <Badge variant={config.is_active ? "default" : "secondary"}>
                        {config.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                      <Badge variant="outline">{getSourceTypeLabel(config.source_type)}</Badge>
                    </div>
                    {config.description && (
                      <CardDescription>{config.description}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
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
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(config)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta roleta?")) {
                          deleteMutation.mutate(config.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Método:</span>{" "}
                    <span className="font-medium">{getMethodLabel(config.distribution_method)}</span>
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
          ))
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
