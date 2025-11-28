import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SourceMapping {
  id: string;
  source_type: string;
  source_identifier: string | null;
  target_stage_id: string;
}

interface FunnelSourceMappingProps {
  funnelId: string;
}

export const FunnelSourceMapping = ({ funnelId }: FunnelSourceMappingProps) => {
  const [mappings, setMappings] = useState<SourceMapping[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [sourceType, setSourceType] = useState("whatsapp");
  const [targetStageId, setTargetStageId] = useState("");
  const [webhookConfigs, setWebhookConfigs] = useState<any[]>([]);
  const [selectedWebhooks, setSelectedWebhooks] = useState<string[]>([]);
  const [facebookForms, setFacebookForms] = useState<any[]>([]);
  const [selectedForms, setSelectedForms] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, [funnelId]);

  const loadData = async () => {
    try {
      // Carregar etapas do funil
      const { data: stagesData, error: stagesError } = await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", funnelId)
        .order("position");

      if (stagesError) throw stagesError;
      setStages(stagesData || []);

      // Carregar mapeamentos existentes
      const { data: mappingsData, error: mappingsError } = await supabase
        .from("funnel_source_mappings")
        .select("*")
        .eq("funnel_id", funnelId);

      if (mappingsError) throw mappingsError;
      setMappings(mappingsData || []);

      // Carregar webhooks
      const { data: webhooksData } = await supabase
        .from("webhook_configs")
        .select("*, lead_tags(name)");
      setWebhookConfigs(webhooksData || []);

      // Carregar forms do Facebook
      const { data: fbData } = await supabase
        .from("facebook_integrations")
        .select("selected_form_id, selected_form_name")
        .not("selected_form_id", "is", null);
      setFacebookForms(fbData || []);
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!targetStageId) {
      toast.error("Selecione uma etapa de destino");
      return;
    }

    try {
      const mappingsToCreate = [];

      if (sourceType === "whatsapp") {
        // WhatsApp não precisa de identifier
        mappingsToCreate.push({
          funnel_id: funnelId,
          source_type: sourceType,
          source_identifier: null,
          target_stage_id: targetStageId,
        });
      } else if (sourceType === "webhook") {
        if (selectedWebhooks.length === 0) {
          toast.error("Selecione pelo menos um webhook");
          return;
        }
        selectedWebhooks.forEach((webhookToken) => {
          mappingsToCreate.push({
            funnel_id: funnelId,
            source_type: sourceType,
            source_identifier: webhookToken,
            target_stage_id: targetStageId,
          });
        });
      } else if (sourceType === "facebook") {
        if (selectedForms.length === 0) {
          toast.error("Selecione pelo menos um formulário");
          return;
        }
        selectedForms.forEach((formId) => {
          mappingsToCreate.push({
            funnel_id: funnelId,
            source_type: sourceType,
            source_identifier: formId,
            target_stage_id: targetStageId,
          });
        });
      }

      const { error } = await supabase
        .from("funnel_source_mappings")
        .insert(mappingsToCreate);

      if (error) throw error;

      toast.success(
        mappingsToCreate.length === 1
          ? "Mapeamento criado!"
          : `${mappingsToCreate.length} mapeamentos criados!`
      );
      resetForm();
      loadData();
    } catch (error) {
      console.error("Erro ao salvar mapeamento:", error);
      toast.error("Erro ao salvar mapeamento");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("funnel_source_mappings")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Mapeamento excluído!");
      loadData();
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir mapeamento");
    }
  };

  const resetForm = () => {
    setSourceType("whatsapp");
    setTargetStageId("");
    setSelectedWebhooks([]);
    setSelectedForms([]);
    setShowForm(false);
  };

  const getSourceLabel = (mapping: SourceMapping) => {
    if (mapping.source_type === "whatsapp") return "WhatsApp";
    if (mapping.source_type === "facebook") {
      const form = facebookForms.find((f) => f.selected_form_id === mapping.source_identifier);
      return form ? `Facebook: ${form.selected_form_name}` : "Facebook";
    }
    if (mapping.source_type === "webhook") {
      const webhook = webhookConfigs.find((w) => w.webhook_token === mapping.source_identifier);
      return webhook
        ? `Webhook: ${webhook.lead_tags?.name || "Sem tag"}`
        : "Webhook";
    }
    return mapping.source_type;
  };

  const getStageLabel = (stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    return stage ? stage.name : "Etapa desconhecida";
  };

  if (loading) {
    return <div className="text-center py-8">Carregando mapeamentos...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Mapeamento de Origens</h3>
          <p className="text-sm text-muted-foreground">
            Defina para qual etapa os leads de cada origem devem ir
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Novo Mapeamento
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>Tipo de Origem</Label>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="whatsapp">WhatsApp (Todos)</SelectItem>
                <SelectItem value="facebook">Facebook Lead Ads</SelectItem>
                <SelectItem value="webhook">Webhook (Formulário)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sourceType === "webhook" && (
            <div className="space-y-2">
              <Label>Webhooks (múltipla seleção)</Label>
              <div className="border rounded-md p-2 space-y-2 max-h-40 overflow-y-auto">
                {webhookConfigs.map((webhook) => (
                  <label
                    key={webhook.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWebhooks.includes(webhook.webhook_token)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWebhooks([...selectedWebhooks, webhook.webhook_token]);
                        } else {
                          setSelectedWebhooks(
                            selectedWebhooks.filter((w) => w !== webhook.webhook_token)
                          );
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">
                      {webhook.lead_tags?.name || "Sem tag"}
                    </span>
                  </label>
                ))}
                {webhookConfigs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Nenhum webhook configurado
                  </p>
                )}
              </div>
            </div>
          )}

          {sourceType === "facebook" && (
            <div className="space-y-2">
              <Label>Formulários Facebook (múltipla seleção)</Label>
              <div className="border rounded-md p-2 space-y-2 max-h-40 overflow-y-auto">
                {facebookForms.map((form, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent p-2 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={selectedForms.includes(form.selected_form_id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedForms([...selectedForms, form.selected_form_id]);
                        } else {
                          setSelectedForms(
                            selectedForms.filter((f) => f !== form.selected_form_id)
                          );
                        }
                      }}
                      className="rounded"
                    />
                    <span className="text-sm">{form.selected_form_name}</span>
                  </label>
                ))}
                {facebookForms.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    Nenhum formulário configurado
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Etapa de Destino</Label>
            <Select value={targetStageId} onValueChange={setTargetStageId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma etapa" />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>Adicionar</Button>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        {mappings.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            Nenhum mapeamento configurado. Leads irão para a primeira etapa por padrão.
          </Card>
        ) : (
          mappings.map((mapping) => (
            <Card key={mapping.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{getSourceLabel(mapping)}</p>
                  <p className="text-sm text-muted-foreground">
                    → {getStageLabel(mapping.target_stage_id)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(mapping.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
