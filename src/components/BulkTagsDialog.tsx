import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  color: string;
}

interface BulkTagsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (tagIds: string[], mode: 'add' | 'remove') => Promise<void>;
  selectedCount: number;
  availableTags: Tag[];
}

export function BulkTagsDialog({
  open,
  onClose,
  onConfirm,
  selectedCount,
  availableTags,
}: BulkTagsDialogProps) {
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'add' | 'remove'>('add');
  const [isLoading, setIsLoading] = useState(false);

  const isHexColor = (color: string) => color?.startsWith('#');

  const toggleTag = (tagId: string) => {
    setSelectedTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const handleConfirm = async () => {
    if (selectedTagIds.size === 0) return;
    setIsLoading(true);
    try {
      await onConfirm(Array.from(selectedTagIds), mode);
      setSelectedTagIds(new Set());
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTagIds(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerenciar Tags</DialogTitle>
          <DialogDescription>
            Adicione ou remova tags dos {selectedCount} leads selecionados.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'add' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('add')}
          >
            Adicionar
          </Button>
          <Button
            variant={mode === 'remove' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('remove')}
          >
            Remover
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
          {availableTags.map((tag) => (
            <Badge
              key={tag.id}
              className={cn(
                "cursor-pointer transition-opacity",
                selectedTagIds.has(tag.id) ? "opacity-100" : "opacity-50",
                isHexColor(tag.color) ? "text-white" : ""
              )}
              style={isHexColor(tag.color) ? { backgroundColor: tag.color } : undefined}
              onClick={() => toggleTag(tag.id)}
            >
              {selectedTagIds.has(tag.id) && "✓ "} {tag.name}
            </Badge>
          ))}
        </div>

        {availableTags.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma tag disponível
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedTagIds.size === 0 || isLoading}
          >
            {isLoading ? "Salvando..." : mode === 'add' ? "Adicionar" : "Remover"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
