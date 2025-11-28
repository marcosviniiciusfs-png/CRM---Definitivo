import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, GripVertical, Trash2, Check, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { IconPicker } from "./IconPicker";
import { DndContext, DragEndEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface FunnelStage {
  id?: string;
  name: string;
  description: string;
  color: string;
  icon: string | null;
  position: number;
  is_final: boolean;
  stage_type: 'custom' | 'won' | 'lost';
  default_value: number;
  max_days_in_stage: number | null;
  required_fields: string[];
}

interface FunnelStageBuilderProps {
  stages: FunnelStage[];
  onChange: (stages: FunnelStage[]) => void;
}

const SortableStageCard = ({ stage, index, onUpdate, onDelete, disabled }: {
  stage: FunnelStage;
  index: number;
  onUpdate: (index: number, updates: Partial<FunnelStage>) => void;
  onDelete: (index: number) => void;
  disabled: boolean;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: `stage-${index}`, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "opacity-50 z-50"
      )}
    >
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div
              {...attributes}
              {...listeners}
              className={cn(
                "cursor-grab active:cursor-grabbing",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>
            
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={stage.name}
                  onChange={(e) => onUpdate(index, { name: e.target.value })}
                  placeholder="Nome da etapa"
                  disabled={disabled}
                  className="font-semibold"
                />
                {stage.is_final && (
                  <Badge variant={stage.stage_type === 'won' ? 'default' : 'destructive'}>
                    {stage.stage_type === 'won' ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                    {stage.stage_type === 'won' ? 'Ganho' : 'Perdido'}
                  </Badge>
                )}
              </div>
            </div>

            {!disabled && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(index)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={stage.color}
                  onChange={(e) => onUpdate(index, { color: e.target.value })}
                  className="w-12 h-10 rounded border cursor-pointer"
                  disabled={disabled}
                />
                <Input
                  value={stage.color}
                  onChange={(e) => onUpdate(index, { color: e.target.value })}
                  placeholder="#000000"
                  disabled={disabled}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ícone</Label>
              <IconPicker
                value={stage.icon}
                onChange={(icon) => onUpdate(index, { icon })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={stage.description}
              onChange={(e) => onUpdate(index, { description: e.target.value })}
              placeholder="Descreva esta etapa..."
              rows={2}
              disabled={disabled}
            />
          </div>

          {!stage.is_final && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Padrão (R$)</Label>
                  <Input
                    type="number"
                    value={stage.default_value}
                    onChange={(e) => onUpdate(index, { default_value: Number(e.target.value) })}
                    placeholder="0.00"
                    step="0.01"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Limite de Dias</Label>
                  <Input
                    type="number"
                    value={stage.max_days_in_stage || ""}
                    onChange={(e) => onUpdate(index, { max_days_in_stage: e.target.value ? Number(e.target.value) : null })}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const FunnelStageBuilder = ({ stages, onChange }: FunnelStageBuilderProps) => {
  const customStages = stages.filter(s => !s.is_final);
  const finalStages = stages.filter(s => s.is_final);

  const handleAddStage = () => {
    if (customStages.length >= 6) {
      toast.error("Máximo de 6 etapas customizáveis permitidas");
      return;
    }

    const newStage: FunnelStage = {
      name: `Etapa ${customStages.length + 1}`,
      description: "",
      color: "#6366F1",
      icon: "Circle",
      position: customStages.length,
      is_final: false,
      stage_type: "custom",
      default_value: 0,
      max_days_in_stage: null,
      required_fields: []
    };

    // Inserir antes das etapas finais
    const updatedStages = [...customStages, newStage, ...finalStages];
    onChange(updatedStages);
  };

  const handleUpdateStage = (index: number, updates: Partial<FunnelStage>) => {
    const updatedStages = [...stages];
    updatedStages[index] = { ...updatedStages[index], ...updates };
    onChange(updatedStages);
  };

  const handleDeleteStage = (index: number) => {
    if (stages[index].is_final) {
      toast.error("Não é possível remover etapas obrigatórias");
      return;
    }

    const updatedStages = stages.filter((_, i) => i !== index);
    onChange(updatedStages);
    toast.success("Etapa removida");
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;

    const oldIndex = Number(String(active.id).replace('stage-', ''));
    const newIndex = Number(String(over.id).replace('stage-', ''));

    // Não permitir reordenar etapas finais
    if (stages[oldIndex].is_final || stages[newIndex].is_final) {
      toast.error("Etapas 'Ganho' e 'Perdido' não podem ser reordenadas");
      return;
    }

    const updatedStages = [...stages];
    const [removed] = updatedStages.splice(oldIndex, 1);
    updatedStages.splice(newIndex, 0, removed);

    onChange(updatedStages);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Etapas do Funil</h3>
          <p className="text-sm text-muted-foreground">
            Configure até 6 etapas customizáveis + 2 etapas finais obrigatórias
          </p>
        </div>
        <Button onClick={handleAddStage} disabled={customStages.length >= 6}>
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Etapa
        </Button>
      </div>

      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stages.map((_, i) => `stage-${i}`)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {stages.map((stage, index) => (
              <SortableStageCard
                key={`stage-${index}`}
                stage={stage}
                index={index}
                onUpdate={handleUpdateStage}
                onDelete={handleDeleteStage}
                disabled={stage.is_final}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
        <Badge variant="outline">{customStages.length}/6</Badge>
        etapas customizadas
      </div>
    </div>
  );
};