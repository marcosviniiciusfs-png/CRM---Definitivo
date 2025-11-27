import { Card } from "@/components/ui/card";
import { Phone, Calendar, Pencil, Eye, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { LeadDetailsDialog } from "@/components/LeadDetailsDialog";
import { LeadTagsBadge } from "@/components/LeadTagsBadge";
import { supabase } from "@/integrations/supabase/client";
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

interface LeadCardProps {
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
}

export const LeadCard = ({ id, name, phone, date, avatarUrl, stage, value, createdAt, source, description, onUpdate, onEdit }: LeadCardProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [leadItems, setLeadItems] = useState<any[]>([]);
  const [totalValue, setTotalValue] = useState<number>(0);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
    disabled: isDropdownOpen || showDetailsDialog,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  const getInitials = (fullName: string) => {
    return fullName
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Verificar se é um lead novo (menos de 10 minutos e stage NOVO)
  const isNewLead = () => {
    if (stage !== 'NOVO' || !createdAt) return false;
    
    const now = new Date().getTime();
    const created = new Date(createdAt).getTime();
    const diffMinutes = (now - created) / (1000 * 60);
    
    return diffMinutes < 10;
  };

  // Verificar se é lead do Facebook
  const isFacebookLead = source === 'Facebook Leads' || description?.includes('=== INFORMAÇÕES DO FORMULÁRIO ===');

  const hasRedBorder = isNewLead();

  // Buscar produtos/serviços atribuídos ao lead
  useEffect(() => {
    const fetchLeadItems = async () => {
      const { data, error } = await supabase
        .from('lead_items')
        .select(`
          *,
          items:item_id (
            id,
            name,
            icon,
            sale_price
          )
        `)
        .eq('lead_id', id);

      if (!error && data) {
        setLeadItems(data);
        const total = data.reduce((sum, item) => sum + (item.total_price || 0), 0);
        setTotalValue(total);
      }
    };

    fetchLeadItems();
  }, [id]);

  // Função para renderizar ícone
  const getItemIcon = (iconName: string | null, size: string = "h-4 w-4") => {
    if (!iconName) return null;
    
    // Verificar ícones customizados primeiro
    if (iconName in customIcons) {
      const CustomIcon = customIcons[iconName];
      return <CustomIcon className={size} />;
    }
    
    // Verificar ícones do Lucide
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
      className={cn(
        "cursor-grab active:cursor-grabbing rounded-[10px] border-2 transition-all duration-500 ease-in-out bg-card overflow-hidden relative group",
        hasRedBorder 
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
                <h3 className="font-semibold text-xs text-foreground leading-tight truncate">{name}</h3>
                <div className="flex items-center gap-1 flex-wrap">
                  {isFacebookLead && (
                    <Badge 
                      variant="secondary" 
                      className="w-fit text-[9px] px-1.5 py-0 h-4 bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-400 dark:border-blue-800"
                    >
                      <svg className="h-2.5 w-2.5 mr-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      Facebook
                    </Badge>
                  )}
                  <LeadTagsBadge leadId={id} />
                </div>
              </div>
              <DropdownMenu onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-4 w-4 -mt-0.5 flex-shrink-0">
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background z-50">
                  <DropdownMenuItem 
                    onClick={(e) => {
                      e.stopPropagation();
                      console.log("Editar clicado para:", name);
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
                  <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
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

        {/* Valor e ícones dos produtos */}
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

      {/* Faixa verde lateral com ícone de olho - desliza da direita na entrada */}
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
          console.log("Click no olho detectado para lead:", id);
          setShowDetailsDialog(true);
        }}
      >
        <Eye className="h-4 w-4 text-primary-foreground" />
      </div>

      <LeadDetailsDialog
        open={showDetailsDialog}
        onOpenChange={setShowDetailsDialog}
        leadId={id}
        leadName={name}
      />
    </Card>
  );
};
