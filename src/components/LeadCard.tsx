import { Card } from "@/components/ui/card";
import { Phone, Calendar, Pencil, Eye, Globe, RefreshCw, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyAvatar } from "@/components/ui/lazy-avatar";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect, CSSProperties, memo } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS as DndCSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { LeadTagsBadgeStatic } from "@/components/LeadTagsBadgeStatic";
import * as Icons from "lucide-react";
import { FaTooth } from "react-icons/fa";

// Wrapper para ícone do react-icons
const ToothIcon: React.FC<{ className?: string }> = ({ className }) => (
  <FaTooth className={className} />
);

// Mapa de ícones customizados (não-lucide)
const customIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  Tooth: ToothIcon,
};

export interface BaseLeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
  avatarUrl?: string;
  stage?: string;
  value?: number;
  createdAt?: string;
  source?: string;
  description?: string;
  onUpdate?: () => void;
  onEdit?: () => void;
  leadItems?: any[];
  leadTags?: Array<{ id: string; name: string; color: string }>;
  isDraggingActive?: boolean;
  duplicateAttemptsCount?: number;
}

interface LeadCardViewProps extends BaseLeadCardProps {
  isDropdownOpen: boolean;
  setIsDropdownOpen: (open: boolean) => void;
  showDetailsDialog: boolean;
  setShowDetailsDialog: (open: boolean) => void;
  dragging: boolean;
  style?: CSSProperties;
  // DnD attrs são opcionais para permitir uso em overlay simples
  listeners?: Record<string, any>;
  attributes?: Record<string, any>;
  setNodeRef?: (node: HTMLElement | null) => void;
}

// Componente puramente visual, sem lógica de drag
const LeadCardView: React.FC<LeadCardViewProps> = ({
  id,
  name,
  phone,
  date,
  avatarUrl,
  stage,
  createdAt,
  source,
  description,
  onUpdate,
  onEdit,
  leadItems: initialLeadItems,
  leadTags: tags = [],
  isDraggingActive = false,
  duplicateAttemptsCount = 0,
  isDropdownOpen,
  setIsDropdownOpen,
  showDetailsDialog,
  setShowDetailsDialog,
  dragging,
  style,
  listeners,
  attributes,
  setNodeRef,
}) => {
  const [totalValue, setTotalValue] = useState<number>(0);


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
  
  const isWhatsAppLead = source === "WhatsApp" || source?.toLowerCase().includes("whatsapp");
  
  const isWebhookLead = source?.toLowerCase().includes("webhook") || 
                        source?.toLowerCase().includes("formulário") ||
                        tags.some(tag => tag.name.toLowerCase().includes("webhook"));

  const hasRedBorder = isNewLead();
  const leadItems = initialLeadItems || [];

  useEffect(() => {
    if (leadItems.length > 0) {
      const total = leadItems.reduce(
        (sum, item) => sum + (item.total_price || 0),
        0
      );
      setTotalValue(total);
    } else {
      setTotalValue(0);
    }
  }, [leadItems]);

  const getItemIcon = (iconName: string | null, size: string = "h-4 w-4") => {
    if (!iconName) return null;

    if (iconName in customIcons) {
      const CustomIcon = customIcons[iconName];
      return <CustomIcon className={size} />;
    }

    if (iconName in Icons) {
      const LucideIcon = Icons[iconName as keyof typeof Icons] as LucideIcon;
      return <LucideIcon className={size} />;
    }

    return null;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-dragging={dragging}
      className={cn(
        "lead-card cursor-grab active:cursor-grabbing rounded-[10px] border-2 bg-card overflow-hidden relative group",
        dragging
          ? "transition-none"
          : "transition-[border-color,box-shadow] duration-200 ease-in-out",
        hasRedBorder && !dragging
          ? "border-border animate-glow-pulse"
          : "border-border hover:border-primary hover:shadow-[0_4px_18px_0_rgba(0,0,0,0.25)]"
      )}
    >
      <div className="p-1.5">
        <div className="flex items-start gap-2 mb-1">
          <LazyAvatar
            src={avatarUrl}
            name={name}
            size="sm"
            className="h-8 w-8"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div className="flex flex-col gap-1 min-w-0">
                <h3 className="font-semibold text-xs text-foreground leading-tight truncate">
                  {name}
                </h3>
                <div className="flex items-center gap-1 flex-wrap" data-lead-badges>
                  {duplicateAttemptsCount > 0 && (
                    <Badge
                      variant="secondary"
                      className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      {duplicateAttemptsCount} retorno{duplicateAttemptsCount > 1 ? 's' : ''}
                    </Badge>
                  )}
                  {isFacebookLead && (
                    <Badge
                      variant="secondary"
                      className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800"
                    >
                      <svg
                        className="h-2.5 w-2.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                      </svg>
                      Facebook
                    </Badge>
                  )}
                  {isWhatsAppLead && (
                    <Badge
                      variant="secondary"
                      className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-green-50 text-green-700 border-green-200 dark:bg-green-950/50 dark:text-green-400 dark:border-green-800"
                    >
                      <svg
                        className="h-2.5 w-2.5"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                      WhatsApp
                    </Badge>
                  )}
                  {isWebhookLead && !isFacebookLead && !isWhatsAppLead && (
                    <Badge
                      variant="secondary"
                      className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-800"
                    >
                      <Globe className="h-2.5 w-2.5" />
                      Webhook
                    </Badge>
                  )}
                  <LeadTagsBadgeStatic tags={tags} />
                </div>
              </div>
              <DropdownMenu onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghostIcon"
                    size="icon"
                    className="h-4 w-4 -mt-0.5 flex-shrink-0"
                  >
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="bg-background z-50"
                >
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEdit) {
                        onEdit();
                      }
                    }}
                    onSelect={(e) => {
                      e.preventDefault();
                    }}
                  >
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDetailsDialog(true);
                    }}
                    onSelect={(e) => e.preventDefault()}
                  >
                    Ver detalhes
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <div className="space-y-0.5 pl-2">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Phone className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">{phone}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Calendar className="h-3 w-3 flex-shrink-0" />
            <span>{date}</span>
          </div>
        </div>

        {leadItems.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between pl-2 pr-1">
              <div className="text-[11px]">
                <span className="text-muted-foreground">Valor: </span>
                <span className="font-semibold text-green-600">
                  R$ {totalValue.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {leadItems.slice(0, 3).map((item, idx) => (
                  <div
                    key={idx}
                    className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center"
                    title={item.items?.name}
                  >
                    {getItemIcon(item.items?.icon, "h-3 w-3 text-primary")}
                  </div>
                ))}
                {leadItems.length > 3 && (
                  <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center text-[10px] font-medium text-primary">
                    +{leadItems.length - 3}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Faixa verde lateral com ícone de olho - esconder durante drag */}
      {!dragging && (
        <div
          className="absolute top-1/2 -translate-y-1/2 right-0 w-[50px] h-[30px] bg-primary rounded-l-lg flex items-center justify-center cursor-pointer z-20 translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out"
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            setShowDetailsDialog(true);
          }}
        >
          <Eye className="h-4 w-4 text-primary-foreground" />
        </div>
      )}

      <LeadDetailsDialog
        leadId={id}
        leadName={name}
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
      />
    </Card>
  );
};

export const SortableLeadCard = memo((props: BaseLeadCardProps & { isDraggingActive?: boolean }) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: props.id,
      disabled: isDropdownOpen || showDetailsDialog,
    });

  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition: props.isDraggingActive ? "none" : transition,
    opacity: isDragging ? 0.5 : 1,
    willChange: transform ? "transform" : undefined,
    cursor: isDragging ? "grabbing" : "grab",
  };

  return (
    <LeadCardView
      {...props}
      isDropdownOpen={isDropdownOpen}
      setIsDropdownOpen={setIsDropdownOpen}
      showDetailsDialog={showDetailsDialog}
      setShowDetailsDialog={setShowDetailsDialog}
      dragging={isDragging}
      style={style}
      listeners={listeners}
      attributes={attributes}
      setNodeRef={setNodeRef}
    />
  );
}, (prevProps, nextProps) => {
  // Comparação otimizada - ignorar mudanças que não afetam visual
  return (
    prevProps.id === nextProps.id &&
    prevProps.name === nextProps.name &&
    prevProps.phone === nextProps.phone &&
    prevProps.date === nextProps.date &&
    prevProps.avatarUrl === nextProps.avatarUrl &&
    prevProps.value === nextProps.value &&
    prevProps.source === nextProps.source &&
    prevProps.isDraggingActive === nextProps.isDraggingActive &&
    prevProps.leadItems?.length === nextProps.leadItems?.length &&
    prevProps.leadTags?.length === nextProps.leadTags?.length &&
    prevProps.duplicateAttemptsCount === nextProps.duplicateAttemptsCount
  );
});

SortableLeadCard.displayName = "SortableLeadCard";

// Versão sem lógica de drag, usada no DragOverlay
export const LeadCard: React.FC<BaseLeadCardProps> = (props) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  return (
    <LeadCardView
      {...props}
      isDropdownOpen={isDropdownOpen}
      setIsDropdownOpen={setIsDropdownOpen}
      showDetailsDialog={showDetailsDialog}
      setShowDetailsDialog={setShowDetailsDialog}
      dragging={false}
    />
  );
};
