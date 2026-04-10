import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { RefreshCw, Users, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface DistributionConfig {
  id: string;
  name: string;
  distribution_method: string;
  eligible_agents: string[] | null;
}

interface RedistributeBatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null | undefined;
  /** Called with the chosen config_id. null means "automático" */
  onConfirm: (configId: string | null) => void;
  isPending?: boolean;
  /** If true, shows the "Automático" option */
  showAutoOption?: boolean;
  title?: string;
  description?: string;
}

const methodLabels: Record<string, string> = {
  round_robin: "Rodízio",
  weighted: "Ponderado",
  load_based: "Por Carga",
  random: "Aleatório",
};

export function RedistributeBatchDialog({
  open,
  onOpenChange,
  organizationId,
  onConfirm,
  isPending = false,
  showAutoOption = true,
  title = "Escolha a Roleta",
  description = "Selecione qual roleta usar para a redistribuição dos leads.",
}: RedistributeBatchDialogProps) {
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);

  const { data: configs } = useQuery({
    queryKey: ["active-distribution-configs", organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from("lead_distribution_configs")
        .select("id, name, distribution_method, eligible_agents")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as DistributionConfig[];
    },
    enabled: !!organizationId && open,
    staleTime: 2 * 60 * 1000,
  });

  const hasConfigs = configs && configs.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {!hasConfigs ? (
          <div className="flex items-center gap-2 p-4 text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-md">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">Nenhuma roleta ativa encontrada.</p>
          </div>
        ) : (
          <RadioGroup
            value={selectedConfigId || ""}
            onValueChange={setSelectedConfigId}
            className="space-y-2 max-h-64 overflow-y-auto"
          >
            {showAutoOption && (
              <div className="flex items-center space-x-3 p-3 rounded-md border bg-muted/30">
                <RadioGroupItem value="" id="auto" />
                <Label htmlFor="auto" className="flex-1 cursor-pointer">
                  <div className="font-medium">Automático</div>
                  <div className="text-sm text-muted-foreground">
                    O sistema escolhe a melhor roleta para cada lead
                  </div>
                </Label>
              </div>
            )}
            {configs.map((config) => {
              const agentCount = config.eligible_agents?.length ?? 0;
              return (
                <div key={config.id} className="flex items-center space-x-3 p-3 rounded-md border">
                  <RadioGroupItem value={config.id} id={config.id} />
                  <Label htmlFor={config.id} className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {methodLabels[config.distribution_method] || config.distribution_method}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Users className="h-3 w-3" />
                      {agentCount === 0
                        ? "Todos os colaboradores ativos"
                        : `${agentCount} colaborador${agentCount !== 1 ? "es" : ""}`}
                    </div>
                  </Label>
                </div>
              );
            })}
          </RadioGroup>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              if (!selectedConfigId && showAutoOption) {
                onConfirm(null);
              } else if (selectedConfigId) {
                onConfirm(selectedConfigId);
              } else {
                toast.error("Selecione uma roleta");
                return;
              }
              onOpenChange(false);
            }}
            disabled={isPending || (!selectedConfigId && !showAutoOption)}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? "animate-spin" : ""}`} />
            {isPending ? "Redistribuindo..." : "Redistribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
