import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Calendar, Users, GitFork } from "lucide-react";
import { toast } from "sonner";
import { RedistributeBatchDialog } from "./RedistributeBatchDialog";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RedistributionBatch {
  id: string;
  config_id: string | null;
  created_by: string | null;
  batch_type: string;
  total_leads: number;
  status: string;
  created_at: string;
}

interface ConfigMap {
  [key: string]: string;
}

const batchTypeLabels: Record<string, string> = {
  manual: "Manual",
  auto: "Automático",
  redistribution: "Redistribuição",
};

const batchTypeColors: Record<string, string> = {
  manual: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  auto: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  redistribution: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
};

export function RedistributionBatches() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

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

  const { data: batches, isLoading } = useQuery({
    queryKey: ["redistribution-batches", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("redistribution_batches")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as RedistributionBatch[];
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
  });

  // Buscar nomes das roletas
  const { data: configsMap } = useQuery({
    queryKey: ["distribution-configs-map", organizationId],
    queryFn: async () => {
      if (!organizationId) return {} as ConfigMap;
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("id, name")
        .eq("organization_id", organizationId);

      if (error) throw error;
      const map: ConfigMap = {};
      (data || []).forEach((c: any) => { map[c.id] = c.name; });
      return map;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000,
  });

  const redistributeBatchMutation = useMutation({
    mutationFn: async ({ batchId, configId }: { batchId: string; configId: string }) => {
      const { data, error } = await supabase.functions.invoke("redistribute-batch", {
        body: {
          batch_id: batchId,
          config_id: configId,
          organization_id: organizationId,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["redistribution-batches"] });
      queryClient.invalidateQueries({ queryKey: ["unassigned-leads-count"] });
      toast.success(`${data.redistributed_count || 0} leads redistribuídos com sucesso!`);
    },
    onError: (error: any) => {
      console.error("Erro ao re-distribuir lote:", error);
      toast.error(error?.message || "Erro ao re-distribuir lote");
    },
  });

  const handleRedistribute = (batchId: string) => {
    setSelectedBatchId(batchId);
    setDialogOpen(true);
  };

  const handleDialogConfirm = (configId: string | null) => {
    if (!selectedBatchId || !configId) return;
    redistributeBatchMutation.mutate({ batchId: selectedBatchId, configId });
  };

  if (isLoading) {
    return <LoadingAnimation text="Carregando redistribuições" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Histórico de Redistribuições</h2>
        <p className="text-muted-foreground">
          Lotes de redistribuição anteriores. Re-distribua usando uma roleta diferente.
        </p>
      </div>

      {!batches || batches.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Nenhuma redistribuição registrada ainda
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {batches.map((batch) => {
            const configName = batch.config_id && configsMap
              ? configsMap[batch.config_id]
              : null;
            const isCompleted = batch.status === "completed";

            return (
              <Card key={batch.id} className={!isCompleted ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                        <Calendar className="h-4 w-4" />
                        {format(new Date(batch.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </div>

                      <Badge className={batchTypeColors[batch.batch_type] || ""}>
                        {batchTypeLabels[batch.batch_type] || batch.batch_type}
                      </Badge>

                      {configName ? (
                        <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-400">
                          <GitFork className="h-3 w-3" />
                          {configName}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600">Automático</Badge>
                      )}

                      <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3.5 w-3.5" />
                        <span className="font-medium">{batch.total_leads} leads</span>
                      </div>

                      <Badge
                        variant="outline"
                        className={
                          isCompleted
                            ? "text-green-600 border-green-300 bg-green-50 dark:bg-green-950 dark:border-green-700 dark:text-green-400"
                            : "text-muted-foreground"
                        }
                      >
                        {isCompleted ? "Concluído" : "Redistribuído"}
                      </Badge>
                    </div>

                    {isCompleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRedistribute(batch.id)}
                        disabled={redistributeBatchMutation.isPending}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Re-distribuir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RedistributeBatchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        organizationId={organizationId}
        onConfirm={handleDialogConfirm}
        isPending={redistributeBatchMutation.isPending}
        showAutoOption={false}
        title="Re-distribuir Lote"
        description="Escolha a roleta para redistribuir os leads deste lote."
      />
    </div>
  );
}
