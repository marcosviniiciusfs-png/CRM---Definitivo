import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useState } from "react";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (mode: 'selected' | 'filtered' | 'all') => Promise<void>;
  selectedCount: number;
  filteredCount: number;
  totalCount: number;
}

export function ExportDialog({
  open,
  onClose,
  onExport,
  selectedCount,
  filteredCount,
  totalCount,
}: ExportDialogProps) {
  const [exportMode, setExportMode] = useState<'selected' | 'filtered' | 'all'>(
    selectedCount > 0 ? 'selected' : 'filtered'
  );
  const [isLoading, setIsLoading] = useState(false);

  const handleExport = async () => {
    setIsLoading(true);
    try {
      await onExport(exportMode);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Exportar Leads</DialogTitle>
          <DialogDescription>
            Escolha quais leads deseja exportar para Excel.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={exportMode}
          onValueChange={(v) => setExportMode(v as 'selected' | 'filtered' | 'all')}
          className="space-y-3"
        >
          {selectedCount > 0 && (
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="selected" id="selected" />
              <Label htmlFor="selected" className="cursor-pointer">
                <span className="font-medium">{selectedCount} selecionados</span>
                <span className="text-muted-foreground ml-2">leads marcados na lista</span>
              </Label>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="filtered" id="filtered" />
            <Label htmlFor="filtered" className="cursor-pointer">
              <span className="font-medium">{filteredCount} da filtragem atual</span>
              <span className="text-muted-foreground ml-2">leads visíveis</span>
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="cursor-pointer">
              <span className="font-medium">Todos do funil ({totalCount})</span>
              <span className="text-muted-foreground ml-2">todos os leads</span>
            </Label>
          </div>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleExport} disabled={isLoading}>
            {isLoading ? "Exportando..." : "Exportar Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
