import { Card } from "@/components/ui/card";
import { Phone, Calendar, Pencil, Eye, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

  const getInitials = (fullName: string) => {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

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
          <Avatar className="h-8 w-8">
            <AvatarImage src={avatarUrl || undefined} alt={name} />
            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
              {getInitials(name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div className="flex flex-col gap-1 min-w-0">
                <h3 className="font-semibold text-xs text-foreground leading-tight truncate">
                  {name}
                </h3>
                <div className="flex items-center gap-1 flex-wrap">
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
                  <LeadTagsBadgeStatic tags={tags} />
                </div>
              </div>
              <DropdownMenu onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger
                  asChild
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
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

// Componente original usado dentro das colunas (com drag & drop) - Memoizado para performance
export const SortableLeadCard = memo<BaseLeadCardProps>((props) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: props.id,
      disabled: isDropdownOpen || showDetailsDialog,
    });

  const style: CSSProperties = {
    transform: DndCSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.5 : 1,
    willChange: transform ? "transform" : undefined,
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
