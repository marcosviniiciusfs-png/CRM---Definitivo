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

interface Colaborador {
  user_id: string;
  full_name: string;
}

interface BulkAssignDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (userId: string) => Promise<void>;
  selectedCount: number;
  colaboradores: Colaborador[];
}

export function BulkAssignDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  colaboradores,
}: BulkAssignDialogProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selectedUserId) return;
    setIsLoading(true);
    try {
      await onConfirm(selectedUserId);
      setSelectedUserId("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atribuir Responsável</DialogTitle>
          <DialogDescription>
            Selecione um responsável para os {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione um colaborador" />
          </SelectTrigger>
          <SelectContent>
            {colaboradores.map((c) => (
              <SelectItem key={c.user_id} value={c.user_id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedUserId || isLoading}>
            {isLoading ? "Atribuindo..." : "Atribuir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
