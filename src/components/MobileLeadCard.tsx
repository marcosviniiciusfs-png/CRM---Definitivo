import { Lead } from '@/types/chat';
import type { StatusReuniao } from '@/types/chat';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Calendar, CalendarCheck, Copy, MessageCircle, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { type RedistributionReason } from '@/lib/redistribution';
import { isLeadDuplicateRecord } from '@/lib/leadDuplicate';
import type { LeadAttentionResult } from '@/lib/leadCardState';
import { formatBRL, formatRelativeShort } from '@/lib/money';

interface MobileLeadCardProps {
  lead: Lead;
  stages: any[];
  currentStageId: string;
  onEdit: () => void;
  onViewDetails: () => void;
  onDelete: () => void;
  onMoveRequest: () => void;
  responsavelName?: string;
  responsavelAvatarUrl?: string | null;
  tags?: Array<{ id: string; name: string; color: string }>;
  isDuplicate?: boolean;
  agendamentos?: { reuniao?: string | null; venda?: string | null };
  statusReuniao?: StatusReuniao | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionReason?: RedistributionReason;
  attention?: LeadAttentionResult;
}

const badgeBase = 'inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold';

export function MobileLeadCard({
  lead, onEdit, onViewDetails, onDelete, onMoveRequest,
  responsavelName, responsavelAvatarUrl, tags = [], isDuplicate, agendamentos,
  statusReuniao, onToggleNoShow,
  isRedistributed, redistributedFromName, redistributionReason = 'inactivity',
  attention,
}: MobileLeadCardProps) {
  const navigate = useNavigate();
  const [copiedInfo, setCopiedInfo] = useState(false);

  const handleCopyInfo = useCallback(() => {
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

  const getAgendamentoStatus = () => {
    const dates = [agendamentos?.reuniao, agendamentos?.venda].filter(Boolean) as string[];
    if (!dates.length) return null;
    const nearest = dates.map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime())[0];
    const time = format(nearest, 'HH:mm', { locale: ptBR });
    if (isPast(nearest) && !isToday(nearest)) return { label: `Reunião atrasada`, tone: 'danger' as const };
    if (isToday(nearest)) return { label: `Reunião hoje, ${time}`, tone: 'info' as const };
    if (isTomorrow(nearest)) return { label: `Reunião amanhã, ${time}`, tone: 'info' as const };
    return { label: `Reunião ${format(nearest, 'dd/MM', { locale: ptBR })}`, tone: 'info' as const };
  };

  const agendStatus = getAgendamentoStatus();
  const isMarkedDuplicate = isLeadDuplicateRecord(lead.additional_data);
  const sourceLabel = lead.source === 'Facebook Leads' ? 'Meta Ads' : lead.source?.trim() || null;
  const detailLine = [sourceLabel, lead.telefone_lead].filter(Boolean).join(' · ');
  const responsibleLabel = responsavelName?.trim() || 'Sem responsável';
  const relativeCreated = formatRelativeShort(lead.created_at);
  const needsReply = attention?.kind === 'needs_reply';
  const showAttention = !!attention?.label && (attention.kind === 'needs_reply' || attention.kind === 'overdue' || attention.kind === 'today');

  return (
    <Card
      className={cn(
        'cursor-pointer select-none rounded-lg border p-3.5 shadow-none transition-colors active:bg-accent/40',
        (isMarkedDuplicate || isDuplicate) && 'border-warning/40'
      )}
      onClick={onViewDetails}
    >
      {/* Linha 1: nome + valor */}
      <div className="flex items-baseline gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
          {lead.nome_lead || 'Sem nome'}
        </h3>
        {!!lead.valor && lead.valor > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground/80">
            {formatBRL(lead.valor)}
          </span>
        )}
      </div>

      {/* Linha 2: origem · telefone */}
      {detailLine && (
        <p className="mt-0.5 truncate text-[13px] tabular-nums text-muted-foreground">{detailLine}</p>
      )}

      {/* Um estado por cartão, em ordem de prioridade, mais marcadores secundários */}
      {(showAttention || agendStatus || isMarkedDuplicate || isDuplicate || isRedistributed || tags.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showAttention && (
            <span
              className={cn(
                badgeBase,
                attention?.kind === 'needs_reply' && 'bg-warning-tint text-warning',
                attention?.kind === 'overdue' && 'bg-destructive-tint text-destructive',
                attention?.kind === 'today' && 'bg-info-tint text-info',
              )}
            >
              {attention?.label}
            </span>
          )}
          {!showAttention && agendStatus && (
            <span
              className={cn(
                badgeBase,
                statusReuniao === 'no_show'
                  ? 'bg-warning-tint text-warning'
                  : agendStatus.tone === 'danger' ? 'bg-destructive-tint text-destructive' : 'bg-info-tint text-info'
              )}
            >
              <Calendar className="h-3 w-3" />
              {statusReuniao === 'no_show' ? 'Não compareceu' : agendStatus.label}
            </span>
          )}
          {(isMarkedDuplicate || isDuplicate) && (
            <span
              className={cn(badgeBase, 'bg-warning-tint text-warning')}
              title={isMarkedDuplicate
                ? 'Novo registro criado para um lead que já existia no CRM.'
                : 'Existe outro lead com o mesmo telefone ou e-mail.'}
            >
              Duplicado
            </span>
          )}
          {isRedistributed && (redistributionReason !== 'inactivity' || redistributedFromName) && (
            <span className={cn(badgeBase, 'bg-secondary text-foreground/80')}>
              <RefreshCw className="h-3 w-3" />Redistribuído
            </span>
          )}
          {tags.slice(0, 2).map(tag => (
            <span
              key={tag.id}
              className="inline-flex h-6 items-center rounded-full px-2 text-xs font-medium"
              style={{ backgroundColor: tag.color + '1f', color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
          {tags.length > 2 && (
            <span className="inline-flex h-6 items-center rounded-full bg-secondary px-2 text-xs text-muted-foreground">+{tags.length - 2}</span>
          )}
        </div>
      )}

      {/* Rodapé: responsável, tempo e ações */}
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        {responsavelAvatarUrl && (
          <img src={responsavelAvatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {responsibleLabel}
          {relativeCreated && <> · {relativeCreated}</>}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="Mais ações do lead">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              Editar lead
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleCopyInfo(); }}>
              {copiedInfo ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
              {copiedInfo ? 'Informações copiadas' : 'Copiar informações'}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!agendamentos?.reuniao}
              onClick={(e) => { e.stopPropagation(); onToggleNoShow?.(); }}
            >
              <CalendarCheck className="h-3.5 w-3.5 mr-2" />
              {statusReuniao === 'no_show' ? 'Desfazer não comparecimento' : 'Marcar que não compareceu'}
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
        <Button
          variant="outline"
          size="sm"
          className="h-9 px-3 text-[13px]"
          onClick={(e) => { e.stopPropagation(); onMoveRequest(); }}
        >
          Mover
        </Button>
        {needsReply && (
          <Button
            size="sm"
            className="h-9 bg-foreground px-3 text-[13px] text-background hover:bg-foreground/90"
            onClick={(e) => { e.stopPropagation(); navigate(`/chat?lead_id=${lead.id}`); }}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Responder
          </Button>
        )}
      </div>
    </Card>
  );
}
