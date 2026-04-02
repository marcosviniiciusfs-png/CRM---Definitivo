import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, FolderInput, Tags, Download, Trash2, X } from "lucide-react";

interface BulkActionsBarProps {
  selectedCount: number;
  onAssign: () => void;
  onMoveStage: () => void;
  onTags: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function BulkActionsBar({
  selectedCount,
  onAssign,
  onMoveStage,
  onTags,
  onExport,
  onDelete,
  onClear,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3 mb-3">
      <Checkbox checked />
      <span className="text-blue-700 font-medium text-sm">
        {selectedCount} lead{selectedCount > 1 ? 's' : ''} selecionado{selectedCount > 1 ? 's' : ''}
      </span>

      <div className="ml-auto flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onAssign}
        >
          <UserPlus className="h-3.5 w-3.5 mr-1" />
          Atribuir
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onMoveStage}
        >
          <FolderInput className="h-3.5 w-3.5 mr-1" />
          Mover Etapa
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onTags}
        >
          <Tags className="h-3.5 w-3.5 mr-1" />
          Tags
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="bg-white"
          onClick={onExport}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Exportar
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Excluir
        </Button>
      </div>

      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
