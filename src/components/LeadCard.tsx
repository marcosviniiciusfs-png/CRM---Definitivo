import { Card } from "@/components/ui/card";
import { Eye, RefreshCw, Copy, Check, CalendarDays, CalendarCheck, MessageCircle, MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState, CSSProperties, memo, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { StatusReuniao } from "@/types/chat";
import { useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { type RedistributionReason } from "@/lib/redistribution";
import { LeadTagsBadgeStatic } from "@/components/LeadTagsBadgeStatic";
import { isLeadDuplicateRecord } from "@/lib/leadDuplicate";
import { Trash2 } from "lucide-react";
import { getAppIcon } from "@/lib/iconRegistry";
import type { LeadAttention } from "@/lib/leadCardState";
import { formatBRL, formatRelativeShort } from "@/lib/money";

const ATTENTION_TITLES: Record<"needs_reply" | "overdue" | "today", string> = {
  needs_reply: "O lead mandou mensagem e ainda não teve resposta da equipe.",
  overdue: "O lead tem tarefa aberta com prazo vencido.",
  today: "O lead tem tarefa aberta que vence hoje.",
};

interface CopyLeadButtonProps {
  name: string;
  phone: string;
  email?: string;
  value?: number;
  source?: string;
  responsavelName?: string;
}

const CopyLeadButton: React.FC<CopyLeadButtonProps> = ({ name, phone, email, value, source, responsavelName }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const lines: string[] = [];
    if (name) lines.push(`Nome: ${name}`);
    if (phone) lines.push(`Telefone: ${phone}`);
    if (email) lines.push(`Email: ${email}`);
    if (value) lines.push(`Valor: R$ ${value.toFixed(2)}`);
    if (source) lines.push(`Origem: ${source}`);
    if (responsavelName) lines.push(`Responsável: ${responsavelName}`);
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [name, phone, email, value, source, responsavelName]);

  return (
    <button
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onClick={handleCopy}
      className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent flex-shrink-0"
      title="Copiar informações do lead"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
};

export interface BaseLeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
  email?: string;
  avatarUrl?: string;
  stage?: string;
  value?: number;
  createdAt?: string;
  source?: string;
  description?: string;
  additionalData?: unknown;
  onUpdate?: () => void;
  onEdit?: () => void;
  onViewDetails?: () => void;
  onDelete?: () => void;
  leadItems?: any[];
  leadTags?: Array<{ id: string; name: string; color: string }>;
  duplicateAttemptsCount?: number;
  responsavelName?: string;
  responsavelAvatarUrl?: string | null;
  isDuplicate?: boolean;
  dataAgendamentoReuniao?: string | null;
  dataAgendamentoVenda?: string | null;
  statusReuniao?: StatusReuniao | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
  redistributionReason?: RedistributionReason;
  /** Estado de atenção (src/lib/leadCardState.ts). */
  attentionKind?: LeadAttention;
  attentionLabel?: string | null;
}

interface LeadCardViewProps extends BaseLeadCardProps {
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  dragging: boolean;
  responsavelName?: string;
  responsavelAvatarUrl?: string | null;
  isDuplicate?: boolean;
  dataAgendamentoReuniao?: string | null;
  dataAgendamentoVenda?: string | null;
  statusReuniao?: StatusReuniao | null;
  onToggleNoShow?: () => void;
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
  redistributionReason?: RedistributionReason;
}

// Componente puramente visual, sem lógica de drag
const LeadCardView: React.FC<LeadCardViewProps> = ({
  id,
  name,
  phone,
  date,
  email,
  avatarUrl,
  stage,
  value,
  createdAt,
  source,
  description,
  additionalData,
  onUpdate,
  onEdit,
  onViewDetails,
  onDelete,
  leadItems: initialLeadItems,
  leadTags: tags = [],
  duplicateAttemptsCount = 0,
  responsavelName,
  responsavelAvatarUrl,
  isDropdownOpen,
  setIsDropdownOpen,
  dragging,
  isDuplicate = false,
  dataAgendamentoReuniao,
  dataAgendamentoVenda,
  statusReuniao,
  onToggleNoShow,
  isRedistributed = false,
  redistributedFromName,
  redistributionMinutes,
  redistributionReason = 'inactivity',
  attentionKind,
  attentionLabel,
}) => {
  const navigate = useNavigate();


  const isNewLead = () => {
    if (stage !== "NOVO" || !createdAt) return false;

    const now = new Date().getTime();
    const created = new Date(createdAt).getTime();
    const diffMinutes = (now - created) / (1000 * 60);

    return diffMinutes < 10;
  };

  const isFacebookLead =
    source === "Facebook Leads" ||
    description?.includes("=== INFORMAÇÕES DO FORMULÁRIO ===");
  const isMarkedDuplicate = isLeadDuplicateRecord(additionalData);

  const isWhatsAppLead = source === "WhatsApp" || source?.toLowerCase().includes("whatsapp");

  const isFreshLead = isNewLead();
  const leadItems = useMemo(() => initialLeadItems || [], [initialLeadItems]);
  const totalValue = useMemo(
    () => leadItems.reduce((sum, item) => sum + (item.total_price || 0), 0),
    [leadItems],
  );
  const displayValue = value && value > 0 ? value : totalValue;
  const responsibleLabel = responsavelName?.trim() || "Sem responsável";
  const isUnassigned = /^sem responsável$/i.test(responsibleLabel);
  const compactResponsibleName = isUnassigned ? "Sem responsável" : responsibleLabel.split(/\s+/)[0];
  const responsibleInitial = isUnassigned ? "?" : responsibleLabel.charAt(0).toUpperCase();
  const sourceLabel = isFacebookLead ? "Meta Ads" : isWhatsAppLead ? "WhatsApp" : source?.trim() || null;
  const detailLine = [sourceLabel, phone].filter(Boolean).join(" · ");
  const relativeCreated = formatRelativeShort(createdAt);
  const showAttention = !!attentionLabel && (attentionKind === 'needs_reply' || attentionKind === 'overdue' || attentionKind === 'today');
  const hasBadges =
    showAttention || isFreshLead || isRedistributed || isMarkedDuplicate || isDuplicate || duplicateAttemptsCount > 0 || tags.length > 0;
  const badgeBase = "h-5 w-fit gap-1 rounded-full border-0 px-2 py-0 text-[11px] font-semibold cursor-default";
  const iconButton =
    "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  const getItemIcon = (iconName: string | null, size: string = "h-4 w-4") => {
    if (!iconName) return null;

    const ItemIcon = getAppIcon(iconName);
    return ItemIcon ? <ItemIcon className={size} /> : null;
  };

  const stopDrag = {
    onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Card
          data-dragging={dragging}
          className={cn(
            "lead-card rounded-lg border bg-card shadow-none overflow-hidden relative group select-none",
            dragging && "cursor-grabbing shadow-lg",
            dragging ? "transition-none" : "transition-[border-color,box-shadow] duration-150 ease-out",
            isFreshLead && !dragging
              ? "border-info/60"
              : (isMarkedDuplicate || isDuplicate) && !dragging
              ? "border-warning/40 hover:border-warning/70"
              : "border-border hover:border-border-strong hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          )}
        >
          <div className="p-3">
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5 text-foreground" title={name}>
                {name}
              </h3>
              {displayValue > 0 && (
                <span className="shrink-0 text-[13px] font-semibold leading-5 tabular-nums text-foreground/80">
                  {formatBRL(displayValue)}
                </span>
              )}
            </div>

            {detailLine && (
              <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground" title={detailLine}>
                {detailLine}
              </p>
            )}

            {hasBadges && (
              <div className="mt-2 flex flex-wrap items-center gap-1" data-lead-badges>
                {showAttention && (
                  <Badge
                    variant="secondary"
                    title={ATTENTION_TITLES[attentionKind as "needs_reply" | "overdue" | "today"]}
                    className={cn(
                      badgeBase,
                      attentionKind === 'needs_reply' && "bg-warning-tint text-warning hover:bg-warning-tint",
                      attentionKind === 'overdue' && "bg-destructive-tint text-destructive hover:bg-destructive-tint",
                      attentionKind === 'today' && "bg-info-tint text-info hover:bg-info-tint",
                    )}
                  >
                    {attentionKind === 'needs_reply' ? <MessageCircle className="h-3 w-3" /> : <CalendarCheck className="h-3 w-3" />}
                    {attentionLabel}
                  </Badge>
                )}
                {isFreshLead && (
                  <Badge variant="secondary" className={cn(badgeBase, "bg-info-tint text-info hover:bg-info-tint")} title="Lead criado há menos de 10 minutos.">
                    Novo
                  </Badge>
                )}
                {isRedistributed && (() => {
                  const isInactivity = redistributionReason === 'inactivity';
                  const isLost = redistributionReason === 'lost';
                  const tooltip = isLost
                    ? "Lead recuperado da etapa Perdido e redistribuído pela roleta."
                    : isInactivity
                    ? (redistributedFromName && redistributionMinutes
                        ? `Lead redistribuído automaticamente porque o responsável anterior (${redistributedFromName}) não interagiu em ${redistributionMinutes} min.`
                        : "Lead redistribuído automaticamente para este responsável.")
                    : (redistributedFromName
                        ? `Lead redistribuído pela roleta (vinha de ${redistributedFromName}).`
                        : "Lead redistribuído pela roleta.");
                  return (
                    <Badge
                      variant="secondary"
                      title={tooltip}
                      className={cn(badgeBase, "bg-secondary text-foreground/80 hover:bg-secondary")}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Redistribuído
                    </Badge>
                  );
                })()}
                {(isMarkedDuplicate || isDuplicate) && (
                  <Badge
                    variant="secondary"
                    title={isMarkedDuplicate
                      ? "Novo registro criado para um lead que já existia no CRM."
                      : "Existe outro lead com o mesmo telefone ou e-mail."}
                    className={cn(badgeBase, "bg-warning-tint text-warning hover:bg-warning-tint")}
                  >
                    <Copy className="h-3 w-3" />
                    Duplicado
                  </Badge>
                )}
                {duplicateAttemptsCount > 0 && (
                  <Badge variant="secondary" className={cn(badgeBase, "bg-secondary text-muted-foreground hover:bg-secondary")}>
                    <RefreshCw className="h-3 w-3" />
                    {duplicateAttemptsCount} {duplicateAttemptsCount === 1 ? 'retorno' : 'retornos'}
                  </Badge>
                )}
                <LeadTagsBadgeStatic tags={tags} />
              </div>
            )}

            {leadItems.length > 0 && (
              <div className="mt-2 flex items-center gap-1">
                {leadItems.slice(0, 3).map((item, idx) => (
                  <div
                    key={idx}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-muted-foreground"
                    title={item.items?.name}
                  >
                    {getItemIcon(item.items?.icon, "h-3.5 w-3.5")}
                  </div>
                ))}
                {leadItems.length > 3 && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-secondary text-[10px] font-medium text-muted-foreground">
                    +{leadItems.length - 3}
                  </div>
                )}
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-1.5 border-t border-border pt-2">
              {responsavelAvatarUrl ? (
                <img src={responsavelAvatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-muted-foreground" aria-hidden="true">
                  {responsibleInitial}
                </span>
              )}
              <span className="min-w-0 truncate text-xs text-muted-foreground" title={`Responsável: ${responsibleLabel}`}>
                {compactResponsibleName}
              </span>
              {relativeCreated && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={`Criado em ${date}`}>
                  · {relativeCreated}
                </span>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                {!dragging && (
                  <CopyLeadButton
                    name={name}
                    phone={phone}
                    email={email}
                    value={value}
                    source={source}
                    responsavelName={responsavelName}
                  />
                )}
                {dataAgendamentoReuniao && !dragging && (
                  <button
                    type="button"
                    {...stopDrag}
                    onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(); }}
                    title={
                      statusReuniao === 'no_show'
                        ? `Reunião (no-show): ${new Date(dataAgendamentoReuniao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : `Reunião: ${new Date(dataAgendamentoReuniao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                    }
                    className={cn(iconButton, statusReuniao === 'no_show' ? "text-warning" : "text-info")}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                  </button>
                )}
                {dataAgendamentoVenda && !dragging && (
                  <button
                    type="button"
                    {...stopDrag}
                    onClick={(e) => { e.stopPropagation(); if (onEdit) onEdit(); }}
                    title={`Venda: ${new Date(dataAgendamentoVenda).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                    className={cn(iconButton, "text-success")}
                  >
                    <CalendarCheck className="h-3.5 w-3.5" />
                  </button>
                )}
                {!dragging && (
                  <button
                    type="button"
                    {...stopDrag}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/chat?lead_id=${id}`);
                    }}
                    className={iconButton}
                    title="Abrir conversa"
                    aria-label="Abrir conversa no chat"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                  </button>
                )}
                <DropdownMenu onOpenChange={setIsDropdownOpen}>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <button type="button" className={iconButton} aria-label="Mais ações do lead" {...stopDrag}>
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-50">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit?.();
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails?.();
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      Ver detalhes
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete?.();
                      }}
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Atalho para os detalhes ao passar o mouse - escondido durante o arraste */}
          {!dragging && (
            <div
              className="absolute top-3 right-0 h-7 w-9 bg-foreground text-background rounded-l-md flex items-center justify-center cursor-pointer z-20 translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-200 ease-out"
              {...stopDrag}
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails?.();
              }}
              title="Ver detalhes"
            >
              <Eye className="h-3.5 w-3.5" />
            </div>
          )}
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent className="bg-background z-50">
        <ContextMenuItem
          disabled={!dataAgendamentoReuniao}
          onSelect={(e) => {
            e.preventDefault();
            onToggleNoShow?.();
          }}
        >
          {statusReuniao === 'no_show' ? 'Desfazer no-show' : 'Marcar como no-show'}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

const areBaseLeadCardPropsEqual = (prevProps: BaseLeadCardProps, nextProps: BaseLeadCardProps) => (
  prevProps.id === nextProps.id &&
  prevProps.name === nextProps.name &&
  prevProps.phone === nextProps.phone &&
  prevProps.email === nextProps.email &&
  prevProps.date === nextProps.date &&
  prevProps.avatarUrl === nextProps.avatarUrl &&
  prevProps.stage === nextProps.stage &&
  prevProps.value === nextProps.value &&
  prevProps.createdAt === nextProps.createdAt &&
  prevProps.source === nextProps.source &&
  prevProps.description === nextProps.description &&
  isLeadDuplicateRecord(prevProps.additionalData) === isLeadDuplicateRecord(nextProps.additionalData) &&
  prevProps.leadItems === nextProps.leadItems &&
  prevProps.leadTags === nextProps.leadTags &&
  prevProps.duplicateAttemptsCount === nextProps.duplicateAttemptsCount &&
  prevProps.responsavelName === nextProps.responsavelName &&
  prevProps.responsavelAvatarUrl === nextProps.responsavelAvatarUrl &&
  prevProps.isDuplicate === nextProps.isDuplicate &&
  prevProps.dataAgendamentoReuniao === nextProps.dataAgendamentoReuniao &&
  prevProps.statusReuniao === nextProps.statusReuniao &&
  prevProps.dataAgendamentoVenda === nextProps.dataAgendamentoVenda &&
  prevProps.isRedistributed === nextProps.isRedistributed &&
  prevProps.redistributedFromName === nextProps.redistributedFromName &&
  prevProps.redistributionMinutes === nextProps.redistributionMinutes &&
  prevProps.redistributionReason === nextProps.redistributionReason &&
  prevProps.attentionKind === nextProps.attentionKind &&
  prevProps.attentionLabel === nextProps.attentionLabel
);

const MemoizedLeadCardView = memo(LeadCardView, (prevProps, nextProps) => (
  prevProps.isDropdownOpen === nextProps.isDropdownOpen &&
  prevProps.dragging === nextProps.dragging &&
  areBaseLeadCardPropsEqual(prevProps, nextProps)
));

export const SortableLeadCard = memo((props: BaseLeadCardProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: props.id,
      disabled: isDropdownOpen,
    });

  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    willChange: transform ? "transform" : undefined,
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="w-full"
    >
      <MemoizedLeadCardView
        {...props}
        isDropdownOpen={isDropdownOpen}
        setIsDropdownOpen={setIsDropdownOpen}
        dragging={isDragging}
      />
    </div>
  );
}, areBaseLeadCardPropsEqual);

SortableLeadCard.displayName = "SortableLeadCard";

// Versão sem lógica de drag, usada no DragOverlay
export const LeadCard: React.FC<BaseLeadCardProps> = (props) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <MemoizedLeadCardView
      {...props}
      isDropdownOpen={isDropdownOpen}
      setIsDropdownOpen={setIsDropdownOpen}
      dragging={false}
    />
  );
};
