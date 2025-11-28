import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

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

interface LeadDistributionConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: DistributionConfig | null;
  organizationId: string | null | undefined;
}

export function LeadDistributionConfigModal({
  open,
  onOpenChange,
  config,
  organizationId,
}: LeadDistributionConfigModalProps) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    source_type: "all",
    source_identifiers: [],
    distribution_method: "round_robin",
    is_active: true,
    triggers: ["new_lead"],
    auto_redistribute: false,
    redistribution_timeout_minutes: 60,
  });

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name,
        description: config.description || "",
        source_type: config.source_type,
        source_identifiers: config.source_identifiers || [],
        distribution_method: config.distribution_method,
        is_active: config.is_active,
        triggers: Array.isArray(config.triggers) ? config.triggers : ["new_lead"],
        auto_redistribute: config.auto_redistribute,
        redistribution_timeout_minutes: config.redistribution_timeout_minutes || 60,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        source_type: "all",
        source_identifiers: [],
        distribution_method: "round_robin",
        is_active: true,
        triggers: ["new_lead"],
        auto_redistribute: false,
        redistribution_timeout_minutes: 60,
      });
    }
  }, [config, open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error("Organization ID not found");

      const payload = {
        ...formData,
        organization_id: organizationId,
      };

      if (config?.id) {
        const { error } = await supabase
          .from("lead_distribution_configs")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("lead_distribution_configs")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-distribution-configs"] });
      toast.success(config ? "Roleta atualizada com sucesso" : "Roleta criada com sucesso");
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error("Erro ao salvar roleta: " + error.message);
    },
  });

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast.error("Nome da roleta é obrigatório");
      return;
    }
    saveMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{config ? "Editar Roleta" : "Nova Roleta"}</DialogTitle>
          <DialogDescription>
            Configure as regras de distribuição para este canal específico
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Roleta *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Roleta Facebook - Imóveis"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição opcional da roleta"
              rows={2}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="source_type">Canal de Origem</Label>
            <Select
              value={formData.source_type}
              onValueChange={(value) => setFormData({ ...formData, source_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os canais</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="facebook">Facebook Leads</SelectItem>
                <SelectItem value="webhook">Webhook (Formulários)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              Esta roleta será aplicada apenas para leads vindos do canal selecionado
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="distribution_method">Método de Distribuição</Label>
            <Select
              value={formData.distribution_method}
              onValueChange={(value) => setFormData({ ...formData, distribution_method: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="round_robin">Rodízio (Round Robin)</SelectItem>
                <SelectItem value="weighted">Ponderado por Prioridade</SelectItem>
                <SelectItem value="load_based">Baseado em Carga</SelectItem>
                <SelectItem value="random">Aleatório</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Redistribuição Automática</Label>
              <p className="text-sm text-muted-foreground">
                Redistribuir leads sem resposta após timeout
              </p>
            </div>
            <Switch
              checked={formData.auto_redistribute}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, auto_redistribute: checked })
              }
            />
          </div>

          {formData.auto_redistribute && (
            <div className="space-y-2">
              <Label htmlFor="timeout">Tempo para Redistribuição (minutos)</Label>
              <Input
                id="timeout"
                type="number"
                min="5"
                value={formData.redistribution_timeout_minutes}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    redistribution_timeout_minutes: parseInt(e.target.value) || 60,
                  })
                }
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Roleta Ativa</Label>
              <p className="text-sm text-muted-foreground">
                Ativar/desativar esta roleta
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Salvando..." : config ? "Atualizar" : "Criar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
