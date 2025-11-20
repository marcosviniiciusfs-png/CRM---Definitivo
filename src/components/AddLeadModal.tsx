import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface AddLeadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AddLeadModal = ({ open, onClose, onSuccess }: AddLeadModalProps) => {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [valor, setValor] = useState("");
  const [stage, setStage] = useState("NOVO");
  const [isSaving, setIsSaving] = useState(false);

  const formatPhoneNumber = (value: string) => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    // Aplica a máscara
    if (numbers.length <= 2) {
      return `+${numbers}`;
    } else if (numbers.length <= 4) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    } else if (numbers.length <= 9) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4)}`;
    } else if (numbers.length <= 13) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
    }
    // Limita a 13 dígitos (55 + DDD + 9 dígitos)
    return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4, 9)}-${numbers.slice(9, 13)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setTelefone(formatted);
  };

  const validatePhone = (phone: string): boolean => {
    // Remove tudo que não é número
    const numbers = phone.replace(/\D/g, '');
    
    // Valida se tem 13 dígitos (55 + DDD com 2 dígitos + número com 9 dígitos)
    // ou 12 dígitos (55 + DDD com 2 dígitos + número com 8 dígitos para telefone fixo)
    if (numbers.length < 12 || numbers.length > 13) {
      return false;
    }
    
    // Valida se começa com +55
    if (!numbers.startsWith('55')) {
      return false;
    }
    
    return true;
  };

  const handleClose = () => {
    setNome("");
    setTelefone("");
    setEmail("");
    setEmpresa("");
    setValor("");
    setStage("NOVO");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nome.trim()) {
      toast.error("O nome do lead é obrigatório");
      return;
    }

    if (!telefone.trim()) {
      toast.error("O telefone do lead é obrigatório");
      return;
    }

    if (!validatePhone(telefone)) {
      toast.error("Telefone inválido. Use o formato: +55 XX XXXXX-XXXX");
      return;
    }

    setIsSaving(true);

    try {
      const insertData: any = {
        nome_lead: nome.trim(),
        telefone_lead: telefone.trim(),
        email: email.trim() || null,
        empresa: empresa.trim() || null,
        stage,
        source: "Manual",
      };

      if (valor.trim()) {
        const numericValue = parseFloat(valor.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(numericValue)) {
          insertData.valor = numericValue;
        }
      }

      const { error } = await supabase
        .from("leads")
        .insert(insertData);

      if (error) throw error;

      toast.success("Lead adicionado com sucesso!");
      handleClose();
      onSuccess();
    } catch (error) {
      console.error("Erro ao adicionar lead:", error);
      toast.error("Erro ao adicionar lead");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar Novo Lead</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">
              Nome <span className="text-destructive">*</span>
            </Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do lead"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="telefone">
              Telefone <span className="text-destructive">*</span>
            </Label>
            <Input
              id="telefone"
              value={telefone}
              onChange={handlePhoneChange}
              placeholder="+55 11 99999-9999"
              required
            />
            <p className="text-xs text-muted-foreground">
              Formato: +55 XX XXXXX-XXXX
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="empresa">Empresa</Label>
            <Input
              id="empresa"
              value={empresa}
              onChange={(e) => setEmpresa(e.target.value)}
              placeholder="Nome da empresa"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="valor">Valor</Label>
            <Input
              id="valor"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="R$ 0,00"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">Status</Label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOVO">Novo</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="FECHADO">Fechado</SelectItem>
                <SelectItem value="PERDIDO">Perdido</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Adicionar Lead"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
