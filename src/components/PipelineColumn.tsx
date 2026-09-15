import { Badge } from "@/components/ui/badge";
import { SortableLeadCard } from "./LeadCard";
import { cn } from "@/lib/utils";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Lead } from "@/types/chat";
import type { StatusReuniao } from "@/types/chat";
import { memo, useEffect, useRef, useState } from "react";
import { mapTriggerSourceToReason } from "@/lib/redistribution";
import { isLeadDuplicateRecord } from "@/lib/leadDuplicate";

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
  onViewDetails?: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
  leadItems: Record<string, any[]>;
  leadTagsMap: Record<string, Array<{ id: string; name: string; color: string }>>;
  profilesMap?: Record<string, { full_name: string; avatar_url: string | null }>;
  duplicateLeadIds?: Set<string>;
  agendamentosMap?: Record<string, { reuniao?: string | null; venda?: string | null }>;
  redistributedMap?: Record<string, { fromName: string; minutes: number; triggerSource: string }>;
  // Props de paginação
  pagination?: StagePaginationState;
  onLoadMore?: () => void;
  onToggleNoShow?: (leadId: string, currentStatus: StatusReuniao | null | undefined) => void;
}

const EMPTY_ITEMS: any[] = [];
const EMPTY_TAGS: Array<{ id: string; name: string; color: string }> = [];

export const PipelineColumn = memo(({
  id,
  title,
  count,
  color,
  leads,
  isEmpty,
  onLeadUpdate,
  onEdit,
  onViewDetails,
  onDelete,
  leadItems,
  leadTagsMap,
  profilesMap = {},
  duplicateLeadIds,
  agendamentosMap = {},
  redistributedMap = {},
  pagination,
  onLoadMore,
  onToggleNoShow,
}: PipelineColumnProps) => {
  const columnRef = useRef<HTMLDivElement>(null);
  const [shouldRenderCards, setShouldRenderCards] = useState(false);
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });

  useEffect(() => {
    const node = columnRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setShouldRenderCards(true);
      return;
    }

    // Monta os cards apenas quando a coluna está visível ou prestes a entrar
    // no viewport horizontal. A coluna continua sendo um alvo de drop desde o
    // início, mas dezenas de árvores de cards fora da tela deixam de disputar
    // o thread principal durante o carregamento e o primeiro arraste.
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldRenderCards(true);
        observer.disconnect();
      }
    }, { rootMargin: "0px" });

    observer.observe(node);
    const fallbackTimer = window.setTimeout(() => {
      setShouldRenderCards(true);
      observer.disconnect();
    }, 1200);

    return () => {
      window.clearTimeout(fallbackTimer);
      observer.disconnect();
    };
  }, []);

  // Detecta se a cor é hex ou classe Tailwind
  const isHexColor = (color: string) => color?.startsWith('#');

  return (
    <div ref={columnRef} className="flex flex-col w-[184px] md:w-[210px] lg:w-[224px] flex-shrink-0 h-full">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h3 className="min-w-0 truncate font-semibold text-sm text-foreground">{title}</h3>
        <Badge
          className={cn(
            "rounded-full w-auto min-w-6 h-6 flex shrink-0 items-center justify-center px-2 text-xs",
            isHexColor(color) ? "text-white" : "",
            !isHexColor(color) && color
          )}
          style={isHexColor(color) ? { backgroundColor: color } : undefined}
        >
          {pagination ? `${pagination.loadedCount}/${pagination.totalCount}` : count}
        </Badge>
      </div>

      <div
        className={cn("h-0.5 mb-2 rounded-full", !isHexColor(color) && color)}
        style={isHexColor(color) ? { backgroundColor: color } : undefined}
      />

      <SortableContext items={leads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "pipeline-column space-y-2 flex-1 min-h-0 overflow-y-auto p-1.5 pb-4 rounded-lg scrollbar-subtle transition-colors duration-200",
            isOver && "bg-muted/50 ring-2 ring-primary/20"
          )}
        >
          {isEmpty ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum lead nesta etapa
            </p>
          ) : shouldRenderCards ? (
            leads.map((lead) => {
              const responsavelProfile = lead.responsavel_user_id
                ? profilesMap[lead.responsavel_user_id]
                : undefined;
              // O UUID é a fonte de verdade; o texto legado pode estar desatualizado.
              const responsavelName = lead.responsavel_user_id
                ? (responsavelProfile?.full_name || 'Responsável não identificado')
                : 'Sem responsável';
              const responsavelAvatarUrl = responsavelProfile?.avatar_url || undefined;
              return (
                <SortableLeadCard
                  key={lead.id}
                  id={lead.id}
                  name={lead.nome_lead}
                  phone={lead.telefone_lead}
                  email={(lead as any).email}
                  date={(lead as any).formattedDate || new Date(lead.created_at).toLocaleString("pt-BR")}
                  avatarUrl={lead.avatar_url ?? undefined}
                  stage={lead.stage ?? undefined}
                  value={lead.valor ?? undefined}
                  createdAt={lead.created_at}
                  source={lead.source ?? undefined}
                  description={lead.descricao_negocio ?? undefined}
                  additionalData={lead.additional_data}
                  onUpdate={onLeadUpdate}
                  onEdit={() => onEdit?.(lead)}
                  onViewDetails={() => onViewDetails?.(lead)}
                  onDelete={() => onDelete?.(lead)}
                  leadItems={leadItems[lead.id] || EMPTY_ITEMS}
                  leadTags={leadTagsMap[lead.id] || EMPTY_TAGS}
                  responsavelName={responsavelName}
                  responsavelAvatarUrl={responsavelAvatarUrl}
                  isDuplicate={duplicateLeadIds ? duplicateLeadIds.has(lead.id) : false}
                  dataAgendamentoReuniao={agendamentosMap[lead.id]?.reuniao}
                  dataAgendamentoVenda={agendamentosMap[lead.id]?.venda}
                  statusReuniao={lead.status_reuniao}
                  onToggleNoShow={() => onToggleNoShow?.(lead.id, lead.status_reuniao)}
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionMinutes={redistributedMap[lead.id]?.minutes}
                  redistributionReason={mapTriggerSourceToReason(redistributedMap[lead.id]?.triggerSource)}
                />
              );
            })
          ) : (
            <div className="h-16" aria-hidden="true" />
          )}

          {/* Botão Carregar Mais */}
          {pagination && pagination.hasMore && (
            <button
              onClick={onLoadMore}
              disabled={pagination.isLoading}
              className={cn(
                "w-full py-2.5 px-3 text-xs font-medium rounded-md transition-colors flex-shrink-0",
                "border border-dashed border-muted-foreground/30",
                "hover:border-primary/50 hover:bg-muted/50",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "mt-2 mb-1"
              )}
            >
              {pagination.isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Carregando...
                </span>
              ) : (
                `Carregar mais (${pagination.totalCount - pagination.loadedCount} restantes)`
              )}
            </button>
          )}

          {/* Info de paginação */}
          {pagination && pagination.totalCount > 0 && (
            <p className="text-[10px] text-muted-foreground text-center py-1">
              Exibindo {pagination.loadedCount} de {pagination.totalCount} leads
            </p>
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
    prevProps.leads.length === nextProps.leads.length &&
    prevProps.leads.every((lead, i) =>
      lead.id === nextProps.leads[i]?.id &&
      isLeadDuplicateRecord(lead.additional_data) === isLeadDuplicateRecord(nextProps.leads[i]?.additional_data)
    ) &&
    prevProps.profilesMap === nextProps.profilesMap &&
    prevProps.duplicateLeadIds === nextProps.duplicateLeadIds &&
    prevProps.agendamentosMap === nextProps.agendamentosMap &&
    prevProps.redistributedMap === nextProps.redistributedMap &&
    prevProps.pagination?.loadedCount === nextProps.pagination?.loadedCount &&
    prevProps.pagination?.totalCount === nextProps.pagination?.totalCount &&
    prevProps.pagination?.isLoading === nextProps.pagination?.isLoading &&
    prevProps.pagination?.hasMore === nextProps.pagination?.hasMore
  );
});

