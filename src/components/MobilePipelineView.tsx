import { useState, useCallback, useRef } from 'react';
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

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 180px)' }}>
      {/* Tabs de funil */}
      {allFunnels.length > 1 && (
        <div className="flex overflow-x-auto scrollbar-hide border-b border-border">
          {allFunnels.map(f => (
            <button
              key={f.id}
              onClick={() => onTabChange(f.id)}
              className={cn(
                'flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
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
        className="flex overflow-x-auto scrollbar-hide gap-2 px-4 py-3 border-b border-border"
        style={{ touchAction: 'pan-x' }}
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
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
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

      {/* Lista de leads da etapa ativa */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {activeLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <div className="text-4xl mb-3">📋</div>
            <p className="font-medium">Nenhum lead nesta etapa</p>
            <p className="text-sm mt-1">Adicione um lead ou mova um existente para cá</p>
          </div>
        ) : (
          activeLeads.map(lead => {
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
          })
        )}

        {/* Botão carregar mais */}
        {stagePagination[activeStageId]?.hasMore && (
          <button
            onClick={() => onLoadMore(activeStageId)}
            disabled={stagePagination[activeStageId]?.isLoading}
            className="w-full py-3 text-sm text-muted-foreground border border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 hover:text-primary transition-colors disabled:opacity-50"
          >
            {stagePagination[activeStageId]?.isLoading
              ? 'Carregando...'
              : `Ver mais leads (${stagePagination[activeStageId].totalCount - stagePagination[activeStageId].loadedCount} restantes)`}
          </button>
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
