import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowRightLeft, Trash2, Loader2 } from "lucide-react";

interface StageSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnId: string;
  columnTitle: string;
  onSettingsUpdated: () => void;
}

interface StageSettings {
  is_completion_stage: boolean;
  block_backward_movement: boolean;
  auto_delete_enabled: boolean;
  auto_delete_hours: number | null;
  stage_color: string | null;
}

export const StageSettingsModal = ({
  open,
  onOpenChange,
  columnId,
  columnTitle,
  onSettingsUpdated,
}: StageSettingsModalProps) => {
  const [settings, setSettings] = useState<StageSettings>({
    is_completion_stage: false,
    block_backward_movement: false,
    auto_delete_enabled: false,
    auto_delete_hours: null,
    stage_color: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open && columnId) {
      loadSettings();
    }
  }, [open, columnId]);

  const loadSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("kanban_columns")
      .select("is_completion_stage, block_backward_movement, auto_delete_enabled, auto_delete_hours, stage_color")
      .eq("id", columnId)
      .single();

    if (data && !error) {
      setSettings({
        is_completion_stage: data.is_completion_stage || false,
        block_backward_movement: data.block_backward_movement || false,
        auto_delete_enabled: data.auto_delete_enabled || false,
        auto_delete_hours: data.auto_delete_hours,
        stage_color: data.stage_color,
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    const updateData: any = {
      is_completion_stage: settings.is_completion_stage,
      block_backward_movement: settings.block_backward_movement,
      auto_delete_enabled: settings.auto_delete_enabled,
      auto_delete_hours: settings.auto_delete_enabled ? settings.auto_delete_hours : null,
      stage_color: settings.stage_color || null,
    };

    const { error } = await supabase
      .from("kanban_columns")
      .update(updateData)
      .eq("id", columnId);

    setSaving(false);

    if (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Configurações salvas",
      description: "As configurações da etapa foram atualizadas.",
    });

    onSettingsUpdated();
    onOpenChange(false);
  };

  const stageColors = [
    { value: null, label: "Padrão" },
    { value: "#22C55E", label: "Verde" },
    { value: "#3B82F6", label: "Azul" },
    { value: "#EAB308", label: "Amarelo" },
    { value: "#F97316", label: "Laranja" },
    { value: "#EF4444", label: "Vermelho" },
    { value: "#8B5CF6", label: "Roxo" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações da Etapa</DialogTitle>
          <DialogDescription>
            Configure o comportamento da etapa "{columnTitle}"
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Etapa de Conclusão */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="completion-stage" className="text-sm font-medium">
                    Etapa de Conclusão
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Tarefas terão borda verde indicando conclusão
                  </p>
                </div>
              </div>
              <Switch
                id="completion-stage"
                checked={settings.is_completion_stage}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, is_completion_stage: checked })
                }
              />
            </div>

            {/* Bloquear Movimento Reverso */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-start gap-3">
                <ArrowRightLeft className="h-5 w-5 text-amber-500 mt-0.5" />
                <div className="space-y-0.5">
                  <Label htmlFor="block-backward" className="text-sm font-medium">
                    Bloquear Retrocesso
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Impede mover tarefas para etapas anteriores
                  </p>
                </div>
              </div>
              <Switch
                id="block-backward"
                checked={settings.block_backward_movement}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, block_backward_movement: checked })
                }
              />
            </div>

            {/* Exclusão Automática */}
            <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  <Trash2 className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-delete" className="text-sm font-medium">
                      Exclusão Automática
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Exclui tarefas após tempo definido
                    </p>
                  </div>
                </div>
                <Switch
                  id="auto-delete"
                  checked={settings.auto_delete_enabled}
                  onCheckedChange={(checked) =>
                    setSettings({ ...settings, auto_delete_enabled: checked })
                  }
                />
              </div>

              {settings.auto_delete_enabled && (
                <div className="ml-8 space-y-2">
                  <Label className="text-xs">Excluir após (horas):</Label>
                  <Input
                    type="number"
                    min="1"
                    value={settings.auto_delete_hours || ""}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        auto_delete_hours: e.target.value ? parseInt(e.target.value) : null,
                      })
                    }
                    placeholder="Ex: 72 (3 dias)"
                    className="h-8"
                  />
                  <p className="text-xs text-muted-foreground">
                    72 horas = 3 dias | 168 horas = 1 semana
                  </p>
                </div>
              )}
            </div>

            {/* Cor da Etapa */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Cor da Etapa (opcional)</Label>
              <div className="flex flex-wrap gap-2">
                {stageColors.map((option) => (
                  <button
                    key={option.value || "default"}
                    type="button"
                    className={`w-7 h-7 rounded-full border-2 transition-all flex-shrink-0 ${
                      settings.stage_color === option.value
                        ? "border-foreground scale-110 ring-2 ring-offset-1 ring-foreground/30"
                        : "border-muted hover:scale-105"
                    }`}
                    style={{
                      backgroundColor: option.value || "transparent",
                      backgroundImage: !option.value
                        ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)"
                        : undefined,
                      backgroundSize: !option.value ? "6px 6px" : undefined,
                      backgroundPosition: !option.value ? "0 0, 0 3px, 3px -3px, -3px 0px" : undefined,
                    }}
                    onClick={() => setSettings({ ...settings, stage_color: option.value })}
                    title={option.label}
                  />
                ))}
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
