import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Stage {
  id: string;
  title: string;
  color: string;
}

interface BulkMoveDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (stageId: string) => Promise<void>;
  selectedCount: number;
  stages: Stage[];
}

export function BulkMoveDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  stages,
}: BulkMoveDialogProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const isHexColor = (color: string) => color?.startsWith('#');

  const handleConfirm = async () => {
    if (!selectedStageId) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedStageId);
      setSelectedStageId("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mover para Etapa</DialogTitle>
          <DialogDescription>
            Selecione a etapa de destino para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      !isHexColor(stage.color) && stage.color
                    )}
                    style={isHexColor(stage.color) ? { backgroundColor: stage.color } : undefined}
                  />
                  {stage.title}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isLoading}>
            {isLoading ? "Movendo..." : "Mover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
