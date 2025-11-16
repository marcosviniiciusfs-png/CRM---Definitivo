import { Card } from "@/components/ui/card";
import { Phone, Calendar, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LeadCardProps {
  id: string;
  name: string;
  phone: string;
  date: string;
  avatarUrl?: string;
  stage?: string;
  value?: number;
  onUpdate?: () => void;
}

export const LeadCard = ({ id, name, phone, date, avatarUrl, stage, value, onUpdate }: LeadCardProps) => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [editedPhone, setEditedPhone] = useState(phone);
  const [editedValue, setEditedValue] = useState(value?.toString() || "");
  const [editedStage, setEditedStage] = useState(stage || "NOVO");
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSaveChanges = async () => {
    if (!editedName.trim()) {
      toast.error("O nome do lead é obrigatório");
      return;
    }

    if (!editedPhone.trim()) {
      toast.error("O telefone do lead é obrigatório");
      return;
    }

    setIsSaving(true);

    try {
      const updateData: any = {
        nome_lead: editedName.trim(),
        telefone_lead: editedPhone.trim(),
        stage: editedStage,
      };

      // Apenas adicionar valor se foi preenchido
      if (editedValue.trim()) {
        const numericValue = parseFloat(editedValue.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue)) {
          updateData.valor = numericValue;
        }
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success("Lead atualizado com sucesso!");
      setIsEditModalOpen(false);
      
      // Chamar callback para recarregar leads
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao atualizar lead");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
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
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background z-50">
                  <DropdownMenuItem onSelect={() => setIsEditModalOpen(true)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem>Ver detalhes</DropdownMenuItem>
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

    {/* Modal de Edição de Lead */}
    <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Lead: {name}</DialogTitle>
          <DialogDescription>
            Atualize as informações do lead abaixo.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              placeholder="Nome completo"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={editedPhone}
              onChange={(e) => setEditedPhone(e.target.value)}
              placeholder="(00) 00000-0000"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="value">Valor do Negócio</Label>
            <Input
              id="value"
              type="text"
              value={editedValue}
              onChange={(e) => setEditedValue(e.target.value)}
              placeholder="R$ 0,00"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="stage">Etapa do Funil</Label>
            <Select value={editedStage} onValueChange={setEditedStage}>
              <SelectTrigger id="stage">
                <SelectValue placeholder="Selecione a etapa" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="NOVO">Novo Lead</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="FECHADO">Fechado</SelectItem>
                <SelectItem value="PERDIDO">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setIsEditModalOpen(false)}
            disabled={isSaving}
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSaveChanges}
            disabled={isSaving}
          >
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
};
