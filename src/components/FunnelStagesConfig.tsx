import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Edit } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StageAutomationConfig } from "./StageAutomationConfig";

interface Stage {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  position: number;
  stage_type: string;
  is_final: boolean;
  default_value: number | null;
  max_days_in_stage: number | null;
  required_fields: string[];
}

interface FunnelStagesConfigProps {
  funnelId: string;
}

const SortableStageItem = ({
  stage,
  onEdit,
  onDelete,
}: {
  stage: Stage;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: stage.id,
    disabled: stage.is_final,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="p-4">
      <div className="flex items-center gap-3">
        {!stage.is_final && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: stage.color }}
        >
          {stage.icon && <span className="text-lg">{stage.icon}</span>}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{stage.name}</h4>
            {stage.is_final && (
              <Badge variant="secondary" className="text-xs">
                Final
              </Badge>
            )}
          </div>
          {stage.description && (
            <p className="text-sm text-muted-foreground">{stage.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4" />
          </Button>
          {!stage.is_final && (
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export const FunnelStagesConfig = ({ funnelId }: FunnelStagesConfigProps) => {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [showAutomation, setShowAutomation] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3B82F6");
  const [defaultValue, setDefaultValue] = useState("");
  const [maxDays, setMaxDays] = useState("");
  const [requiredFields, setRequiredFields] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadStages();
  }, [funnelId]);

  const loadStages = async () => {
    try {
      const { data, error } = await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", funnelId)
        .order("position");

      if (error) throw error;
      
      const formattedStages = (data || []).map(stage => ({
        ...stage,
        required_fields: Array.isArray(stage.required_fields) 
          ? (stage.required_fields as string[])
          : []
      })) as Stage[];
      
      setStages(formattedStages);
    } catch (error) {
      console.error("Erro ao carregar etapas:", error);
      toast.error("Erro ao carregar etapas");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = stages.findIndex((s) => s.id === active.id);
    const newIndex = stages.findIndex((s) => s.id === over.id);

    const newStages = arrayMove(stages, oldIndex, newIndex);
    setStages(newStages);

    // Atualizar posições no banco
    try {
      const updates = newStages
        .filter((s) => !s.is_final)
        .map((stage, index) => ({
          id: stage.id,
          position: index,
        }));

      for (const update of updates) {
        await supabase
          .from("funnel_stages")
          .update({ position: update.position })
          .eq("id", update.id);
      }

      toast.success("Ordem atualizada!");
    } catch (error) {
      console.error("Erro ao atualizar ordem:", error);
      toast.error("Erro ao atualizar ordem");
      loadStages();
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome da etapa é obrigatório");
      return;
    }

    const customStagesCount = stages.filter((s) => !s.is_final).length;
    if (!editingStage && customStagesCount >= 6) {
      toast.error("Máximo de 6 etapas customizáveis");
      return;
    }

    try {
      const stageData = {
        funnel_id: funnelId,
        name,
        description: description || null,
        color,
        icon: null,
        default_value: defaultValue ? parseFloat(defaultValue) : null,
        max_days_in_stage: maxDays ? parseInt(maxDays) : null,
        required_fields: requiredFields
          ? requiredFields.split(",").map((f) => f.trim())
          : [],
        stage_type: "custom",
        is_final: false,
      };

      if (editingStage) {
        const { error } = await supabase
          .from("funnel_stages")
          .update(stageData)
          .eq("id", editingStage.id);

        if (error) throw error;
        toast.success("Etapa atualizada!");
      } else {
        const { error } = await supabase.from("funnel_stages").insert({
          ...stageData,
          position: customStagesCount,
        });

        if (error) throw error;
        toast.success("Etapa criada! Configure mais ou vá para Origens.");
      }

      resetForm();
      loadStages();
    } catch (error) {
      console.error("Erro ao salvar etapa:", error);
      toast.error("Erro ao salvar etapa");
    }
  };

  const handleDelete = async (stageId: string) => {
    try {
      const { error } = await supabase
        .from("funnel_stages")
        .delete()
        .eq("id", stageId);

      if (error) throw error;
      toast.success("Etapa excluída!");
      loadStages();
    } catch (error) {
      console.error("Erro ao excluir etapa:", error);
      toast.error("Erro ao excluir etapa");
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setColor("#3B82F6");
    setDefaultValue("");
    setMaxDays("");
    setRequiredFields("");
    setEditingStage(null);
    setShowForm(false);
  };

  const startEdit = (stage: Stage) => {
    setName(stage.name);
    setDescription(stage.description || "");
    setColor(stage.color);
    setDefaultValue(stage.default_value?.toString() || "");
    setMaxDays(stage.max_days_in_stage?.toString() || "");
    setRequiredFields(
      Array.isArray(stage.required_fields) ? stage.required_fields.join(", ") : ""
    );
    setEditingStage(stage);
    setShowForm(true);
  };

  if (loading) {
    return <div className="text-center py-8">Carregando etapas...</div>;
  }

  if (showAutomation) {
    return (
      <StageAutomationConfig
        stageId={showAutomation}
        onBack={() => setShowAutomation(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Etapas do Funil</h3>
          <p className="text-sm text-muted-foreground">
            Arraste para reordenar. Máximo de 6 etapas customizáveis.
          </p>
        </div>
        {!showForm && stages.filter((s) => !s.is_final).length < 6 && (
          <Button onClick={() => setShowForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Etapa
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome da Etapa *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Qualificação"
              />
            </div>

            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2">
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-20"
                />
                <Input value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva esta etapa..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Valor Padrão (R$)</Label>
            <Input
              type="number"
              value={defaultValue}
              onChange={(e) => setDefaultValue(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Máx. Dias na Etapa</Label>
              <Input
                type="number"
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
                placeholder="Ex: 7"
              />
            </div>

            <div className="space-y-2">
              <Label>Campos Obrigatórios</Label>
              <Input
                value={requiredFields}
                onChange={(e) => setRequiredFields(e.target.value)}
                placeholder="Ex: email, telefone"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetForm}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingStage ? "Atualizar" : "Adicionar"}
            </Button>
          </div>
        </Card>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={stages.filter((s) => !s.is_final).map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {stages
              .filter((s) => !s.is_final)
              .map((stage) => (
                <SortableStageItem
                  key={stage.id}
                  stage={stage}
                  onEdit={() => startEdit(stage)}
                  onDelete={() => handleDelete(stage.id)}
                />
              ))}
          </div>
        </SortableContext>

        {/* Etapas Finais (não reordenáveis) */}
        <div className="mt-4 pt-4 border-t space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Etapas Finais</h4>
          {stages
            .filter((s) => s.is_final)
            .map((stage) => (
              <SortableStageItem
                key={stage.id}
                stage={stage}
                onEdit={() => startEdit(stage)}
                onDelete={() => {}}
              />
            ))}
        </div>
      </DndContext>
    </div>
  );
};
