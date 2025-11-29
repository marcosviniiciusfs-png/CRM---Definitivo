import { Badge } from "@/components/ui/badge";
import { SortableLeadCard } from "./LeadCard";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Lead } from "@/types/chat";

interface PipelineColumnProps {
  id: string;
  title: string;
  count: number;
  color: string;
  leads: Lead[];
  isEmpty?: boolean;
  onLeadUpdate?: () => void;
  onEdit?: (lead: Lead) => void;
  leadItems: Record<string, any[]>;
  leadTagsMap: Record<string, Array<{ id: string; name: string; color: string }>>;
  isDraggingActive: boolean;
}

export const PipelineColumn = ({
  id,
  title,
  count,
  color,
  leads,
  isEmpty,
  onLeadUpdate,
  onEdit,
  leadItems,
  leadTagsMap,
  isDraggingActive,
}: PipelineColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  return (
    <div className="flex flex-col w-[280px] flex-shrink-0" style={{ contain: "layout" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <Badge
          className={cn(
            "rounded-full w-6 h-6 flex items-center justify-center p-0 text-xs",
            color
          )}
        >
          {count}
        </Badge>
      </div>

      <div className={cn("h-0.5 mb-3 rounded-full", color)} />

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "pipeline-column space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto p-2 rounded-lg scrollbar-hide",
            "transition-colors duration-200",
            isOver && "bg-muted/50 ring-2 ring-primary/20"
          )}
        >
          {isEmpty ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum lead nesta etapa
            </p>
          ) : (
            leads.map((lead) => (
              <SortableLeadCard
                key={lead.id}
                id={lead.id}
                name={lead.nome_lead}
                phone={lead.telefone_lead}
                date={new Date(lead.created_at).toLocaleString("pt-BR")}
                avatarUrl={lead.avatar_url}
                stage={lead.stage}
                value={lead.valor}
                createdAt={lead.created_at}
                source={lead.source}
                description={lead.descricao_negocio}
                onUpdate={onLeadUpdate}
                onEdit={() => onEdit?.(lead)}
                leadItems={leadItems[lead.id] || []}
                leadTags={leadTagsMap[lead.id] || []}
                isDraggingActive={isDraggingActive}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

