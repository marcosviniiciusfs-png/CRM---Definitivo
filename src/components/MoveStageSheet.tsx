import { Lead } from '@/types/chat';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Check, X, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface MoveStageSheetProps {
  open: boolean;
  lead: Lead | null;
  stages: any[];
  currentStageId: string;
  onClose: () => void;
  onConfirm: (targetStageId: string) => void;
  isMoving: boolean;
}

export function MoveStageSheet({
  open, lead, stages, currentStageId, onClose, onConfirm, isMoving
}: MoveStageSheetProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Travar scroll do body quando sheet está aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open || !lead) return null;

  const isHexColor = (c: string) => c?.startsWith('#');

  const sheet = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 bg-black/50 flex items-end"
      style={{ touchAction: 'none' }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-full bg-background rounded-t-2xl max-h-[85vh] flex flex-col animate-fade-in-up"
        style={{ touchAction: 'pan-y' }}
        onTouchMove={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Mover lead</p>
            <p className="text-sm font-medium text-foreground">{lead.nome_lead || 'Sem nome'}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Lista de etapas */}
        <div className="overflow-y-auto flex-1" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}>
          {stages.map((stage, index) => {
            const isCurrent = stage.id === currentStageId;
            const hexColor = isHexColor(stage.color) ? stage.color : undefined;

            return (
              <button
                key={stage.id}
                disabled={isCurrent || isMoving}
                onClick={() => !isCurrent && onConfirm(stage.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors border-b border-border/50 last:border-0',
                  isCurrent
                    ? 'bg-muted/50 cursor-default'
                    : 'hover:bg-muted/30 active:bg-muted/60',
                  isMoving && !isCurrent && 'opacity-50'
                )}
              >
                <span className="text-xs text-muted-foreground w-4 flex-shrink-0 text-right">
                  {index + 1}
                </span>

                <span
                  className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', !hexColor && stage.color)}
                  style={hexColor ? { backgroundColor: hexColor } : undefined}
                />

                <span className={cn(
                  'flex-1 text-sm',
                  isCurrent ? 'font-medium text-foreground' : 'text-foreground'
                )}>
                  {stage.title}
                </span>

                {isCurrent && (
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="h-3 w-3 text-green-500" />
                    Etapa atual
                  </span>
                )}
                {isMoving && !isCurrent && (
                  <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }} />
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
