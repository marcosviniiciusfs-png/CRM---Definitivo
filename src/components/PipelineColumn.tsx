import { Badge } from "@/components/ui/badge";
import { SortableLeadCard } from "./LeadCard";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Lead } from "@/types/chat";
import { memo } from "react";

interface StagePaginationState {
  loadedCount: number;
  totalCount: number;
  isLoading: boolean;
  hasMore: boolean;
}

interface PipelineColumnProps {
  id: string;
  title: string;
  count: number;
  color: string;
  leads: Lead[];
  isEmpty?: boolean;
  onLeadUpdate?: () => void;
  onEdit?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
  leadItems: Record<string, any[]>;
  leadTagsMap: Record<string, Array<{ id: string; name: string; color: string }>>;
  isDraggingActive: boolean;
  profilesMap?: Record<string, { full_name: string; avatar_url: string | null }>;
  duplicateLeadIds?: Set<string>;
  agendamentosMap?: Record<string, { reuniao?: string | null; venda?: string | null }>;
  redistributedMap?: Record<string, { fromName: string; minutes: number }>;
  // Props de paginação
  pagination?: StagePaginationState;
  onLoadMore?: () => void;
}

export const PipelineColumn = memo(({
  id,
  title,
  count,
  color,
  leads,
  isEmpty,
  onLeadUpdate,
  onEdit,
  onDelete,
  leadItems,
  leadTagsMap,
  isDraggingActive,
  profilesMap = {},
  duplicateLeadIds,
  agendamentosMap = {},
  redistributedMap = {},
  pagination,
  onLoadMore,
}: PipelineColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  // Detecta se a cor é hex ou classe Tailwind
  const isHexColor = (color: string) => color?.startsWith('#');

  return (
    <div className="flex flex-col w-[280px] flex-shrink-0 min-h-[500px]" style={{ contain: "content" }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <Badge
          className={cn(
            "rounded-full w-6 h-6 flex items-center justify-center p-0 text-xs",
            isHexColor(color) ? "text-white" : "",
            !isHexColor(color) && color
          )}
          style={isHexColor(color) ? { backgroundColor: color } : undefined}
        >
          {count}
        </Badge>
      </div>

      <div
        className={cn("h-0.5 mb-3 rounded-full", !isHexColor(color) && color)}
        style={isHexColor(color) ? { backgroundColor: color } : undefined}
      />

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "pipeline-column space-y-2 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto p-2 rounded-lg scrollbar-hide",
            !isDraggingActive && "transition-colors duration-200",
            isOver && "bg-muted/50 ring-2 ring-primary/20"
          )}
        >
          {isEmpty ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum lead nesta etapa
            </p>
          ) : (
            leads.map((lead) => {
              const responsavelProfile = lead.responsavel_user_id
                ? profilesMap[lead.responsavel_user_id]
                : undefined;
              // Fallback: se o perfil não foi carregado mas o campo texto existe, usa ele
              const responsavelName = responsavelProfile?.full_name || (lead as any).responsavel || undefined;
              const responsavelAvatarUrl = responsavelProfile?.avatar_url || undefined;
              return (
                <SortableLeadCard
                  key={lead.id}
                  id={lead.id}
                  name={lead.nome_lead}
                  phone={lead.telefone_lead}
                  email={(lead as any).email}
                  date={(lead as any).formattedDate || new Date(lead.created_at).toLocaleString("pt-BR")}
                  avatarUrl={lead.avatar_url}
                  stage={lead.stage}
                  value={lead.valor}
                  createdAt={lead.created_at}
                  source={lead.source}
                  description={lead.descricao_negocio}
                  onUpdate={onLeadUpdate}
                  onEdit={() => onEdit?.(lead)}
                  onDelete={() => onDelete?.(lead)}
                  leadItems={leadItems[lead.id] || []}
                  leadTags={leadTagsMap[lead.id] || []}
                  isDraggingActive={isDraggingActive}
                  responsavelName={responsavelName}
                  responsavelAvatarUrl={responsavelAvatarUrl}
                  isDuplicate={duplicateLeadIds ? duplicateLeadIds.has(lead.id) : false}
                  dataAgendamentoReuniao={agendamentosMap[lead.id]?.reuniao}
                  dataAgendamentoVenda={agendamentosMap[lead.id]?.venda}
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionMinutes={redistributedMap[lead.id]?.minutes}
                />
              );
            })
          )}
        </div>
      </SortableContext>
    </div>
  );
}, (prevProps, nextProps) => {
  // Comparação otimizada para evitar re-renders desnecessários
  return (
    prevProps.id === nextProps.id &&
    prevProps.title === nextProps.title &&
    prevProps.count === nextProps.count &&
    prevProps.color === nextProps.color &&
    prevProps.isEmpty === nextProps.isEmpty &&
    prevProps.isDraggingActive === nextProps.isDraggingActive &&
    prevProps.leads.length === nextProps.leads.length &&
    prevProps.leads.every((lead, i) => lead.id === nextProps.leads[i]?.id) &&
    prevProps.profilesMap === nextProps.profilesMap &&
    prevProps.duplicateLeadIds === nextProps.duplicateLeadIds &&
    prevProps.agendamentosMap === nextProps.agendamentosMap &&
    prevProps.redistributedMap === nextProps.redistributedMap
  );
});

