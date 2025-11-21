import { Card } from "@/components/ui/card";
import { Phone, Calendar, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState } from "react";
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

interface LeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
  avatarUrl?: string;
  stage?: string;
  value?: number;
  createdAt?: string;
  onUpdate?: () => void;
  onEdit?: () => void;
}

export const LeadCard = ({ id, name, phone, date, avatarUrl, stage, value, createdAt, onUpdate, onEdit }: LeadCardProps) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

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

  const hasRedBorder = isNewLead();

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
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-xs text-foreground leading-tight truncate">{name}</h3>
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
