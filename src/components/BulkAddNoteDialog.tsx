import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface BulkAddNoteDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (content: string) => Promise<void>;
  selectedCount: number;
}

export function BulkAddNoteDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
}: BulkAddNoteDialogProps) {
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    setIsLoading(true);
    try {
      await onConfirm(trimmed);
      setContent("");
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar nota</DialogTitle>
          <DialogDescription>
            A nota será salva no histórico de cada um dos {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Digite a nota..."
          rows={5}
          autoFocus
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={!content.trim() || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Salvar nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
