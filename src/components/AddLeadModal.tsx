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
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Funnel {
  id: string;
  name: string;
}

interface Stage {
  id: string;
  name: string;
  color: string;
  is_final: boolean;
}

interface AddLeadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const sourceOptions = [
  { value: "Manual", label: "Cadastro Manual" },
  { value: "Facebook", label: "Facebook" },
  { value: "WhatsApp", label: "WhatsApp" },
  { value: "Google ADS", label: "Google ADS" },
  { value: "TikTok", label: "TikTok" },
  { value: "Outro", label: "Outro" },
];

export const AddLeadModal = ({ open, onClose, onSuccess }: AddLeadModalProps) => {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [idade, setIdade] = useState("");
  const [valor, setValor] = useState("");
  const [source, setSource] = useState("Manual");
  const [customSource, setCustomSource] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Funnel and stage states
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [loadingFunnels, setLoadingFunnels] = useState(false);
  const [loadingStages, setLoadingStages] = useState(false);

  const formatPhoneNumber = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    
    if (numbers.length <= 2) {
      return `+${numbers}`;
    } else if (numbers.length <= 4) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2)}`;
    } else if (numbers.length <= 9) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4)}`;
    } else if (numbers.length <= 13) {
      return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4, 9)}-${numbers.slice(9)}`;
    }
    return `+${numbers.slice(0, 2)} ${numbers.slice(2, 4)} ${numbers.slice(4, 9)}-${numbers.slice(9, 13)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setTelefone(formatted);
  };

  const validatePhone = (phone: string): boolean => {
    const numbers = phone.replace(/\D/g, '');
    if (numbers.length < 12 || numbers.length > 13) {
      return false;
    }
    if (!numbers.startsWith('55')) {
      return false;
    }
    return true;
  };

  // Load funnels when modal opens
  useEffect(() => {
    if (open) {
      loadFunnels();
    }
  }, [open]);

  const loadFunnels = async () => {
    setLoadingFunnels(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!orgData) return;

      const { data: funnelsData } = await supabase
        .from("sales_funnels")
        .select("id, name")
        .eq("organization_id", orgData.organization_id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("name");

      if (funnelsData && funnelsData.length > 0) {
        setFunnels(funnelsData);
        setSelectedFunnelId(funnelsData[0].id);
      }
    } finally {
      setLoadingFunnels(false);
    }
  };

  // Load stages when funnel changes
  useEffect(() => {
    if (selectedFunnelId) {
      loadStages(selectedFunnelId);
    } else {
      setStages([]);
      setSelectedStageId("");
    }
  }, [selectedFunnelId]);

  const loadStages = async (funnelId: string) => {
    setLoadingStages(true);
    try {
      const { data: stagesData } = await supabase
        .from("funnel_stages")
        .select("id, name, color, is_final")
        .eq("funnel_id", funnelId)
        .order("position");

      if (stagesData && stagesData.length > 0) {
        setStages(stagesData);
        setSelectedStageId(stagesData[0].id);
      } else {
        setStages([]);
        setSelectedStageId("");
      }
    } finally {
      setLoadingStages(false);
    }
  };

  const handleClose = () => {
    setNome("");
    setTelefone("");
    setEmail("");
    setEmpresa("");
    setIdade("");
    setValor("");
    setSource("Manual");
    setCustomSource("");
    setSelectedFunnelId("");
    setSelectedStageId("");
    setStages([]);
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

    if (source === "Outro" && !customSource.trim()) {
      toast.error("Especifique a origem do lead");
      return;
    }

    if (!selectedFunnelId) {
      toast.error("Selecione um funil");
      return;
    }

    if (!selectedStageId) {
      toast.error("Selecione uma etapa do funil");
      return;
    }

    setIsSaving(true);

    try {
      const finalSource = source === "Outro" ? customSource.trim() : source;
      
      const insertData: any = {
        nome_lead: nome.trim(),
        telefone_lead: telefone.trim(),
        email: email.trim() || null,
        empresa: empresa.trim() || null,
        idade: idade.trim() ? parseInt(idade) : null,
        source: finalSource,
        funnel_id: selectedFunnelId,
        funnel_stage_id: selectedStageId,
        stage: "NOVO",
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
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
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
            <Label htmlFor="idade">Idade</Label>
            <Input
              id="idade"
              type="number"
              min="0"
              max="150"
              value={idade}
              onChange={(e) => setIdade(e.target.value)}
              placeholder="Ex: 25"
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
            <Label htmlFor="source">Origem do Lead</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a origem" />
              </SelectTrigger>
              <SelectContent>
                {sourceOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {source === "Outro" && (
            <div className="space-y-2">
              <Label htmlFor="customSource">Especifique a origem</Label>
              <Input
                id="customSource"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value.slice(0, 17))}
                placeholder="Digite a origem"
                maxLength={17}
              />
              <p className="text-xs text-muted-foreground text-right">
                {customSource.length}/17 caracteres
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="funnel">Funil</Label>
            <Select 
              value={selectedFunnelId} 
              onValueChange={setSelectedFunnelId}
              disabled={loadingFunnels}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingFunnels ? "Carregando..." : "Selecione o funil"} />
              </SelectTrigger>
              <SelectContent>
                {funnels.map((funnel) => (
                  <SelectItem key={funnel.id} value={funnel.id}>
                    {funnel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="stage">Etapa</Label>
            <Select 
              value={selectedStageId} 
              onValueChange={setSelectedStageId}
              disabled={loadingStages || !selectedFunnelId}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingStages ? "Carregando..." : "Selecione a etapa"} />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full shrink-0" 
                        style={{ backgroundColor: stage.color }}
                      />
                      <span>{stage.name}</span>
                      {stage.is_final && (
                        <span className="text-xs text-muted-foreground">(Final)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
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
