import { Lead } from '@/types/chat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronRight, Phone, Check, AlertCircle, Calendar, RefreshCw, Pencil, Trash2 } from 'lucide-react';
import { useState, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { LeadDetailsDialog } from '@/components/LeadDetailsDialog';

interface MobileLeadCardProps {
  lead: Lead;
  stages: any[];
  currentStageId: string;
  onEdit: () => void;
  onDelete: () => void;
  onMoveRequest: () => void;
  responsavelName?: string;
  responsavelAvatarUrl?: string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  isDuplicate?: boolean;
  agendamentos?: { reuniao?: string | null; venda?: string | null };
  isRedistributed?: boolean;
  redistributedFromName?: string;
}

export function MobileLeadCard({
  lead, stages, currentStageId, onEdit, onDelete, onMoveRequest,
  responsavelName, tags = [], isDuplicate, agendamentos,
  isRedistributed, redistributedFromName,
}: MobileLeadCardProps) {
  const [copied, setCopied] = useState(false);
  const [copiedInfo, setCopiedInfo] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  // Debounce para evitar que fechar o LeadDetailsDialog dispare o onClick do card
  const justClosedDialogRef = useRef(false);

  const handleCopyInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const lines: string[] = [];
    if (lead.nome_lead) lines.push(`Nome: ${lead.nome_lead}`);
    if (lead.telefone_lead) lines.push(`Telefone: ${lead.telefone_lead}`);
    if ((lead as any).email) lines.push(`Email: ${(lead as any).email}`);
    if (lead.valor) lines.push(`Valor: R$ ${lead.valor.toFixed(2)}`);
    if (lead.source) lines.push(`Origem: ${lead.source}`);
    if (responsavelName) lines.push(`Responsável: ${responsavelName}`);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopiedInfo(true);
      setTimeout(() => setCopiedInfo(false), 1500);
    });
  }, [lead, responsavelName]);

  const handleCopyPhone = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lead.telefone_lead) return;
    navigator.clipboard.writeText(lead.telefone_lead).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [lead.telefone_lead]);

  const formatValue = (v?: number | null) =>
    v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : null;

  const getAgendamentoStatus = () => {
    const dates = [agendamentos?.reuniao, agendamentos?.venda].filter(Boolean) as string[];
    if (!dates.length) return null;
    const nearest = dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime())[0];
    if (isPast(nearest) && !isToday(nearest)) return { label: 'Atrasado', color: 'destructive' as const };
    if (isToday(nearest)) return { label: 'Hoje', color: 'warning' as const };
    if (isTomorrow(nearest)) return { label: 'Amanhã', color: 'default' as const };
    return { label: format(nearest, 'dd/MM', { locale: ptBR }), color: 'default' as const };
  };

  const agendStatus = getAgendamentoStatus();

  const handleCardClick = useCallback(() => {
    if (justClosedDialogRef.current) return;
    setShowDetailsDialog(true);
  }, []);

  return (
    <Card
      className={cn(
        'p-3 active:scale-[0.99] transition-transform cursor-pointer select-none',
        isDuplicate && 'border-amber-300'
      )}
      onClick={handleCardClick}
      style={{ pointerEvents: showDetailsDialog ? 'none' : undefined }}
    >
      {/* Linha 1: avatar iniciais + nome + valor */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn(
          'w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-semibold',
          getAvatarColor(lead.nome_lead)
        )}>
          {getInitials(lead.nome_lead)}
        </div>
        <div className="flex-1 min-w-0">
          <button
            onClick={handleCopyInfo}
            className="text-sm font-medium text-foreground truncate text-left w-full active:text-primary transition-colors"
            title="Toque para copiar informações"
          >
            {copiedInfo ? <span className="text-green-500">Copiado!</span> : (lead.nome_lead || 'Sem nome')}
          </button>
          {responsavelName && (
            <p className="text-[11px] text-muted-foreground truncate">{responsavelName}</p>
          )}
        </div>
        {formatValue(lead.valor) && (
          <span className="text-sm font-medium text-green-600 dark:text-green-400 flex-shrink-0">
            {formatValue(lead.valor)}
          </span>
        )}
      </div>

      {/* Linha 2: telefone + origem */}
      {(lead.telefone_lead || lead.source) && (
        <div className="flex items-center gap-2 mb-2">
          {lead.telefone_lead && (
            <button
              onClick={handleCopyPhone}
              className="flex items-center gap-1 text-xs text-muted-foreground active:text-foreground min-h-[28px]"
            >
              {copied ? <Check className="h-3 w-3 text-green-500" /> : <Phone className="h-3 w-3" />}
              <span>{lead.telefone_lead}</span>
            </button>
          )}
          <div className="flex-1" />
          {lead.source && (
            <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full border border-border">
              {lead.source}
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 mb-2 flex-wrap">
          {tags.slice(0, 3).map(tag => (
            <span
              key={tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: tag.color + '25', color: tag.color, border: `0.5px solid ${tag.color}55` }}
            >
              {tag.name}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">+{tags.length - 3}</span>
          )}
        </div>
      )}

      {/* Badges de status */}
      {(isDuplicate || agendStatus || isRedistributed) && (
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          {isDuplicate && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
              <AlertCircle className="h-2.5 w-2.5" />Duplicado
            </span>
          )}
          {agendStatus && (
            <span className={cn(
              'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border',
              agendStatus.color === 'destructive' ? 'bg-red-50 text-red-700 border-red-200' :
              agendStatus.color === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-blue-50 text-blue-700 border-blue-200'
            )}>
              <Calendar className="h-2.5 w-2.5" />{agendStatus.label}
            </span>
          )}
          {isRedistributed && redistributedFromName && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
              <RefreshCw className="h-2.5 w-2.5" />Redistribuído
            </span>
          )}
        </div>
      )}

      {/* Linha de ações */}
      <div className="flex items-center gap-2 pt-1.5 border-t border-border/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-9 min-w-[36px] text-xs text-muted-foreground px-2">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              Editar lead
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Excluir lead
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-9 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white border-0 active:scale-95 transition-transform"
          onClick={(e) => { e.stopPropagation(); onMoveRequest(); }}
        >
          Mover
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Dialog de Detalhes do Lead */}
      <LeadDetailsDialog
        leadId={lead.id}
        leadName={lead.nome_lead || 'Sem nome'}
        open={showDetailsDialog}
        onOpenChange={(open) => {
          setShowDetailsDialog(open);
          if (!open) {
            justClosedDialogRef.current = true;
            setTimeout(() => { justClosedDialogRef.current = false; }, 500);
          }
        }}
      />
    </Card>
  );
}

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-purple-100 text-purple-700',
  'bg-orange-100 text-orange-700',
  'bg-pink-100 text-pink-700',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
  'bg-red-100 text-red-700',
];

function getAvatarColor(name?: string | null): string {
  if (!name) return AVATAR_COLORS[0];
  const sum = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
