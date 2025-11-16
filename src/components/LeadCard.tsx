import { Card } from "@/components/ui/card";
import { Phone, Calendar, MoreVertical, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface LeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
  avatarUrl?: string;
}

export const LeadCard = ({ id, name, phone, date, avatarUrl }: LeadCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: id,
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

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing rounded-[10px] border-2 border-border hover:border-hover-border hover:shadow-[0_4px_18px_0_rgba(0,0,0,0.25)] transition-all duration-500 ease-in-out bg-card overflow-hidden relative group"
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-4 w-4 -mt-0.5 flex-shrink-0">
                    <MoreVertical className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background z-50">
                  <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
                  <DropdownMenuItem>Editar</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
        
        <div className="space-y-0.5 pl-10">
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

      {/* Faixa azul lateral com ícone de olho - desliza da direita na entrada */}
      <div 
        className="absolute top-1/2 -translate-y-1/2 right-0 w-[50px] h-[30px] bg-[#008bf8] rounded-l-lg flex items-center justify-center cursor-pointer z-20 translate-x-full opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all duration-300 ease-out"
        onClick={(e) => {
          e.stopPropagation();
          // Ação de visualizar detalhes do lead
        }}
      >
        <Eye className="h-4 w-4 text-white" />
      </div>
    </Card>
  );
};
