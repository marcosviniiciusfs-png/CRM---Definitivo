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
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Lead } from "@/types/chat";

interface EditLeadModalProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const EditLeadModal = ({ lead, open, onClose, onUpdate }: EditLeadModalProps) => {
  const [editedName, setEditedName] = useState(lead.nome_lead);
  const [editedPhone, setEditedPhone] = useState(lead.telefone_lead);
  const [editedValue, setEditedValue] = useState(lead.valor?.toString() || "");
  const [editedStage, setEditedStage] = useState(lead.stage || "NOVO");
  const [isSaving, setIsSaving] = useState(false);

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

      if (editedValue.trim()) {
        const numericValue = parseFloat(editedValue.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue)) {
          updateData.valor = numericValue;
        }
      }

      const { error } = await supabase
        .from("leads")
        .update(updateData)
        .eq("id", lead.id);

      if (error) throw error;

      toast.success("Lead atualizado com sucesso!");
      onClose();
      onUpdate();
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao atualizar lead");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Lead: {lead.nome_lead}</DialogTitle>
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
            onClick={onClose}
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
  );
};
