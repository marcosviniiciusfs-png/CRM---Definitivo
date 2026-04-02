import { Lead } from "@/types/chat";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { memo } from "react";

interface PipelineListRowProps {
  lead: Lead;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  stageName?: string;
  stageColor?: string;
  responsavelName?: string;
  tags: Array<{ id: string; name: string; color: string }>;
}

export const PipelineListRow = memo(({
  lead,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  stageName,
  stageColor,
  responsavelName,
  tags,
}: PipelineListRowProps) => {
  const isHexColor = (color: string) => color?.startsWith('#');

  const formatPhone = (phone: string | null) => {
    if (!phone) return '—';
    return phone;
  };

  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div
      className={cn(
        "flex items-center px-3 py-2 text-xs border-b border-border/50 hover:bg-muted/30 transition-colors",
        isSelected && "bg-blue-50/50"
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onSelect}
        className="mr-3"
      />

      {/* Nome */}
      <div className="w-40 min-w-0">
        <span className="font-medium truncate block">{lead.nome_lead || 'Sem nome'}</span>
      </div>

      {/* Telefone */}
      <div className="w-28 text-muted-foreground">
        {formatPhone(lead.telefone_lead)}
      </div>

      {/* Tags */}
      <div className="w-24 flex gap-1 flex-wrap">
        {tags.length > 0 ? (
          tags.slice(0, 2).map(tag => (
            <Badge
              key={tag.id}
              className={cn(
                "text-[9px] px-1 py-0 h-4",
                isHexColor(tag.color) ? "text-white" : ""
              )}
              style={isHexColor(tag.color) ? { backgroundColor: tag.color } : undefined}
            >
              {tag.name}
            </Badge>
          ))
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Etapa */}
      <div className="w-28">
        {stageName ? (
          <Badge
            className={cn(
              "text-[9px] px-1.5 py-0 h-4",
              isHexColor(stageColor || '') ? "text-white" : stageColor
            )}
            style={isHexColor(stageColor || '') ? { backgroundColor: stageColor } : undefined}
          >
            {stageName}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      {/* Responsável */}
      <div className="w-24 truncate text-muted-foreground">
        {responsavelName || '—'}
      </div>

      {/* Valor */}
      <div className="w-20 font-medium">
        {formatCurrency(lead.valor)}
      </div>

      {/* Ações */}
      <div className="w-16 flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={onEdit}
        >
          <Pencil className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
});
