import { Card } from "@/components/ui/card";
import { Phone, Calendar, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface LeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
}

export const LeadCard = ({ id, name, phone, date }: LeadCardProps) => {
  return (
    <Card className="p-2.5 cursor-move hover:shadow-md transition-shadow bg-background">
      <div className="flex items-start justify-between mb-1.5">
        <h3 className="font-semibold text-xs text-foreground leading-tight">{name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-5 w-5 -mt-0.5">
              <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background z-50">
            <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
            <DropdownMenuItem>Editar</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">Excluir</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Phone className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{phone}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3 flex-shrink-0" />
          <span>{date}</span>
        </div>
      </div>
    </Card>
  );
};
