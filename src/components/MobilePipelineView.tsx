import { useState, useCallback, useRef, useEffect } from 'react';
import { Lead } from '@/types/chat';
import { MobileLeadCard } from './MobileLeadCard';
import { MoveStageSheet } from './MoveStageSheet';
import { cn } from '@/lib/utils';

interface MobilePipelineViewProps {
  stages: any[];
  leadsByStage: Map<string, Lead[]>;
  selectedFunnelId: string | null;
  allFunnels: any[];
  onTabChange: (funnelId: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
  onLeadMove: (leadId: string, targetStageId: string) => Promise<void>;
  leadTagsMap: Record<string, Array<{ id: string; name: string; color: string }>>;
  profilesMap: Record<string, { full_name: string; avatar_url: string | null }>;
  duplicateLeadIds: Set<string>;
  agendamentosMap: Record<string, { reuniao?: string | null; venda?: string | null }>;
  redistributedMap: Record<string, { fromName: string; minutes: number }>;
  stagePagination: Record<string, any>;
  onLoadMore: (stageId: string) => void;
}

export function MobilePipelineView({
  stages, leadsByStage, selectedFunnelId, allFunnels,
  onTabChange, onEdit, onDelete, onLeadMove,
  leadTagsMap, profilesMap, duplicateLeadIds,
  agendamentosMap, redistributedMap, stagePagination, onLoadMore,
}: MobilePipelineViewProps) {
  const [activeStageId, setActiveStageId] = useState<string>(stages[0]?.id || '');
  const [moveSheetLead, setMoveSheetLead] = useState<Lead | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Resetar stage ativa quando stages mudam (troca de funil)
  useEffect(() => {
    if (stages.length > 0 && !stages.find(s => s.id === activeStageId)) {
      setActiveStageId(stages[0].id);
    }
  }, [stages]);

  const activeLeads = leadsByStage.get(activeStageId) || [];
  const isHexColor = (c: string) => c?.startsWith('#');

  const handleMoveConfirm = useCallback(async (targetStageId: string) => {
    if (!moveSheetLead || isMoving) return;
    setIsMoving(true);
    try {
      await onLeadMove(moveSheetLead.id, targetStageId);
    } finally {
      setIsMoving(false);
      setMoveSheetLead(null);
    }
  }, [moveSheetLead, onLeadMove, isMoving]);

  const handleStageTab = (stageId: string) => {
    setActiveStageId(stageId);
    const tabEl = tabsRef.current?.querySelector(`[data-stage="${stageId}"]`) as HTMLElement;
    tabEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  };

  const pagination = stagePagination[activeStageId];
  // Fallback robusto: se pagination existe, usar hasMore. Se não, checar se temos >= PAGE_SIZE leads
  const hasMore = pagination != null
    ? pagination.hasMore
    : activeLeads.length >= 20;

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        height: 'calc(100dvh - var(--pipeline-offset, 120px) - env(safe-area-inset-bottom, 0px))',
        minHeight: '280px',
      }}
    >
      {/* Tabs de funil */}
      {allFunnels.length > 1 && (
        <div className="flex overflow-x-auto scrollbar-hide border-b border-border flex-shrink-0">
          {allFunnels.map(f => (
            <button
              key={f.id}
              onClick={() => onTabChange(f.id)}
              className={cn(
                'flex-shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                selectedFunnelId === f.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Pills de etapas - scroll horizontal apenas aqui */}
      <div
        ref={tabsRef}
        className="flex overflow-x-auto scrollbar-hide gap-1.5 px-3 py-2.5 border-b border-border flex-shrink-0"
      >
        {stages.map(stage => {
          const count = leadsByStage.get(stage.id)?.length || 0;
          const isActive = stage.id === activeStageId;
          const stageColor = stage.color;
          const hexColor = isHexColor(stageColor) ? stageColor : undefined;

          return (
            <button
              key={stage.id}
              data-stage={stage.id}
              onClick={() => handleStageTab(stage.id)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium border transition-all',
                isActive
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-background border-border text-muted-foreground'
              )}
            >
              <span
                className={cn('w-2 h-2 rounded-full flex-shrink-0', !hexColor && stageColor)}
                style={hexColor ? { backgroundColor: hexColor } : undefined}
              />
              <span>{stage.title}</span>
              <span className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full ml-0.5',
                isActive ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {stagePagination[stage.id]
                  ? `${stagePagination[stage.id].totalCount}`
                  : count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Lista de leads da etapa ativa - scroll vertical */}
      <div
        className="flex-1 overflow-y-auto px-3 pt-2.5 space-y-2.5"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          minHeight: 0,
          paddingBottom: 'max(64px, env(safe-area-inset-bottom, 0px))',
        }}
      >
        {activeLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
            <div className="text-3xl mb-2">📋</div>
            <p className="font-medium text-sm">Nenhum lead nesta etapa</p>
            <p className="text-xs mt-1">Adicione um lead ou mova um existente para cá</p>
          </div>
        ) : (
          <>
            {activeLeads.map(lead => {
              const profile = lead.responsavel_user_id ? profilesMap[lead.responsavel_user_id] : undefined;
              return (
                <MobileLeadCard
                  key={lead.id}
                  lead={lead}
                  stages={stages}
                  currentStageId={activeStageId}
                  onEdit={() => onEdit(lead)}
                  onDelete={() => onDelete(lead)}
                  onMoveRequest={() => setMoveSheetLead(lead)}
                  responsavelName={profile?.full_name || (lead as any).responsavel}
                  responsavelAvatarUrl={profile?.avatar_url}
                  tags={leadTagsMap[lead.id] || []}
                  isDuplicate={duplicateLeadIds.has(lead.id)}
                  agendamentos={agendamentosMap[lead.id]}
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                />
              );
            })}

            {/* Botão carregar mais ou indicador de fim da lista */}
            <div className="flex-shrink-0 pb-2">
              {hasMore ? (
                <button
                  onClick={() => onLoadMore(activeStageId)}
                  disabled={pagination?.isLoading}
                  className="w-full py-2.5 px-4 mt-1 text-sm text-muted-foreground border border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50 active:scale-[0.98]"
                >
                  {pagination?.isLoading
                    ? 'Carregando...'
                    : pagination && pagination.totalCount > pagination.loadedCount
                      ? `Ver mais leads (${pagination.totalCount - pagination.loadedCount} restantes)`
                      : 'Ver mais leads'}
                </button>
              ) : activeLeads.length > 0 ? (
                <p className="text-center text-xs text-muted-foreground/50 pt-2 pb-1">
                  {pagination?.totalCount
                    ? `${pagination.totalCount} lead${pagination.totalCount !== 1 ? 's' : ''} nesta etapa`
                    : `${activeLeads.length} lead${activeLeads.length !== 1 ? 's' : ''} nesta etapa`}
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {/* Bottom sheet para mover lead */}
      <MoveStageSheet
        open={!!moveSheetLead}
        lead={moveSheetLead}
        stages={stages}
        currentStageId={activeStageId}
        onClose={() => setMoveSheetLead(null)}
        onConfirm={handleMoveConfirm}
        isMoving={isMoving}
      />
    </div>
  );
}
