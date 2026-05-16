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
import { Loader2 } from "lucide-react";

interface Stage {
  id: string;
  title: string;
}

interface BulkMoveStageDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (stageId: string) => Promise<void>;
  selectedCount: number;
  stages: Stage[];
}

export function BulkMoveStageDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  stages,
}: BulkMoveStageDialogProps) {
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

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
          <DialogTitle>Mover etapa</DialogTitle>
          <DialogDescription>
            Selecione a etapa de destino para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma etapa" />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedStageId || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
