import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";

interface FunnelStage {
  id?: string;
  name: string;
  is_final: boolean;
}

interface SourceMapping {
  id?: string;
  source_type: 'facebook_form' | 'webhook' | 'whatsapp' | 'manual';
  source_identifier: string;
  target_stage_id: string;
}

interface FunnelSourceMappingsProps {
  funnelId: string;
  stages: FunnelStage[];
}

export const FunnelSourceMappings = ({ funnelId, stages }: FunnelSourceMappingsProps) => {
  const [mappings, setMappings] = useState<SourceMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [availableSources, setAvailableSources] = useState<{
    facebook_forms: Array<{ id: string; name: string }>;
    webhooks: Array<{ id: string; name: string }>;
  }>({
    facebook_forms: [],
    webhooks: []
  });

  // Filtrar apenas etapas não-finais para mapeamento
  const selectableStages = stages.filter(s => !s.is_final && s.id);

  useEffect(() => {
    loadMappings();
    loadAvailableSources();
  }, [funnelId]);

  const loadMappings = async () => {
    try {
      const { data, error } = await supabase
        .from("funnel_source_mappings")
        .select("*")
        .eq("funnel_id", funnelId);

      if (error) throw error;
      setMappings((data || []).map(m => ({
        id: m.id,
        source_type: m.source_type as 'facebook_form' | 'webhook' | 'whatsapp' | 'manual',
        source_identifier: m.source_identifier || '',
        target_stage_id: m.target_stage_id
      })));
    } catch (error) {
      console.error("Erro ao carregar mapeamentos:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAvailableSources = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Buscar organização
      const { data: memberData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!memberData?.organization_id) return;

      // Carregar formulários do Facebook
      const { data: fbData } = await supabase
        .from("facebook_integrations")
        .select("selected_form_id, selected_form_name")
        .eq("organization_id", memberData.organization_id);

      // Carregar webhooks
      const { data: webhookData } = await supabase
        .from("webhook_configs")
        .select("webhook_token, id")
        .eq("organization_id", memberData.organization_id);

      setAvailableSources({
        facebook_forms: fbData?.filter(f => f.selected_form_id).map(f => ({
          id: f.selected_form_id!,
          name: f.selected_form_name || f.selected_form_id!
        })) || [],
        webhooks: webhookData?.map(w => ({
          id: w.webhook_token,
          name: `Webhook ${w.id.slice(0, 8)}`
        })) || []
      });
    } catch (error) {
      console.error("Erro ao carregar fontes:", error);
    }
  };

  const handleAddMapping = () => {
    setMappings([
      ...mappings,
      {
        source_type: 'manual',
        source_identifier: '',
        target_stage_id: selectableStages[0]?.id || ''
      }
    ]);
  };

  const handleUpdateMapping = (index: number, updates: Partial<SourceMapping>) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], ...updates };
    setMappings(updated);
  };

  const handleDeleteMapping = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Deletar mapeamentos antigos
      await supabase
        .from("funnel_source_mappings")
        .delete()
        .eq("funnel_id", funnelId);

      // Inserir novos mapeamentos
      const validMappings = mappings.filter(m => 
        m.target_stage_id && 
        (m.source_type === 'manual' || m.source_identifier)
      );

      if (validMappings.length > 0) {
        const { error } = await supabase
          .from("funnel_source_mappings")
          .insert(
            validMappings.map(m => ({
              funnel_id: funnelId,
              source_type: m.source_type,
              source_identifier: m.source_identifier || null,
              target_stage_id: m.target_stage_id
            }))
          );

        if (error) throw error;
      }

      toast.success("Mapeamentos salvos com sucesso!");
    } catch (error) {
      console.error("Erro ao salvar mapeamentos:", error);
      toast.error("Erro ao salvar mapeamentos");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">Mapeamento de Origens</h3>
        <p className="text-sm text-muted-foreground">
          Vincule fontes de leads específicas às etapas do funil
        </p>
      </div>

      <div className="space-y-3">
        {mappings.map((mapping, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Origem</Label>
                  <Select
                    value={mapping.source_type}
                    onValueChange={(value: any) => handleUpdateMapping(index, { source_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="facebook_form">Formulário Facebook</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {mapping.source_type !== 'manual' && mapping.source_type !== 'whatsapp' && (
                  <div className="space-y-2">
                    <Label>Fonte Específica</Label>
                    <Select
                      value={mapping.source_identifier}
                      onValueChange={(value) => handleUpdateMapping(index, { source_identifier: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {mapping.source_type === 'facebook_form' &&
                          availableSources.facebook_forms.map(form => (
                            <SelectItem key={form.id} value={form.id}>
                              {form.name}
                            </SelectItem>
                          ))
                        }
                        {mapping.source_type === 'webhook' &&
                          availableSources.webhooks.map(webhook => (
                            <SelectItem key={webhook.id} value={webhook.id}>
                              {webhook.name}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Etapa de Destino</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={mapping.target_stage_id}
                      onValueChange={(value) => handleUpdateMapping(index, { target_stage_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {selectableStages.map(stage => (
                          <SelectItem key={stage.id} value={stage.id!}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteMapping(index)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="outline" onClick={handleAddMapping}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Mapeamento
        </Button>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar Mapeamentos
        </Button>
      </div>
    </div>
  );
};