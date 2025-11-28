import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FunnelStageBuilder } from "./FunnelStageBuilder";
import { FunnelSourceMappings } from "./FunnelSourceMappings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2 } from "lucide-react";

interface FunnelBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funnelId?: string | null;
}

interface FunnelStage {
  id?: string;
  name: string;
  description: string;
  color: string;
  icon: string | null;
  position: number;
  is_final: boolean;
  stage_type: 'custom' | 'won' | 'lost';
  default_value: number;
  max_days_in_stage: number | null;
  required_fields: string[];
}

export const FunnelBuilderModal = ({ open, onClose, onSuccess, funnelId }: FunnelBuilderModalProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<FunnelStage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTab, setCurrentTab] = useState("basic");

  useEffect(() => {
    if (open) {
      if (funnelId) {
        loadFunnel();
      } else {
        resetForm();
      }
    }
  }, [open, funnelId]);

  const resetForm = () => {
    setName("");
    setDescription("");
    // Inicializar com etapas padrão
    setStages([
      {
        name: "Novo Lead",
        description: "",
        color: "#3B82F6",
        icon: "UserPlus",
        position: 0,
        is_final: false,
        stage_type: "custom",
        default_value: 0,
        max_days_in_stage: null,
        required_fields: []
      },
      {
        name: "Ganho",
        description: "Lead convertido com sucesso",
        color: "#10B981",
        icon: "Check",
        position: 1,
        is_final: true,
        stage_type: "won",
        default_value: 0,
        max_days_in_stage: null,
        required_fields: []
      },
      {
        name: "Perdido",
        description: "Lead não convertido",
        color: "#EF4444",
        icon: "X",
        position: 2,
        is_final: true,
        stage_type: "lost",
        default_value: 0,
        max_days_in_stage: null,
        required_fields: []
      }
    ]);
    setCurrentTab("basic");
  };

  const loadFunnel = async () => {
    if (!funnelId) return;
    
    setIsLoading(true);
    try {
      // Carregar funil
      const { data: funnelData, error: funnelError } = await supabase
        .from("sales_funnels")
        .select("*")
        .eq("id", funnelId)
        .single();

      if (funnelError) throw funnelError;

      setName(funnelData.name);
      setDescription(funnelData.description || "");

      // Carregar etapas
      const { data: stagesData, error: stagesError } = await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", funnelId)
        .order("position");

      if (stagesError) throw stagesError;

      setStages(stagesData.map(stage => ({
        id: stage.id,
        name: stage.name,
        description: stage.description || "",
        color: stage.color,
        icon: stage.icon,
        position: stage.position,
        is_final: stage.is_final,
        stage_type: stage.stage_type as 'custom' | 'won' | 'lost',
        default_value: Number(stage.default_value) || 0,
        max_days_in_stage: stage.max_days_in_stage,
        required_fields: Array.isArray(stage.required_fields) 
          ? (stage.required_fields as any[]).filter(f => typeof f === 'string') as string[]
          : []
      })));
    } catch (error) {
      console.error("Erro ao carregar funil:", error);
      toast.error("Erro ao carregar funil");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("O nome do funil é obrigatório");
      return;
    }

    // Validar etapas
    const customStages = stages.filter(s => !s.is_final);
    if (customStages.length === 0) {
      toast.error("Adicione pelo menos uma etapa customizada");
      return;
    }

    if (customStages.length > 6) {
      toast.error("Máximo de 6 etapas customizáveis permitidas");
      return;
    }

    // Verificar se tem etapas finais
    const hasWon = stages.some(s => s.stage_type === 'won');
    const hasLost = stages.some(s => s.stage_type === 'lost');

    if (!hasWon || !hasLost) {
      toast.error("O funil deve ter etapas 'Ganho' e 'Perdido'");
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Buscar organização do usuário
      const { data: memberData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!memberData?.organization_id) {
        throw new Error("Organização não encontrada");
      }

      let savedFunnelId = funnelId;

      if (funnelId) {
        // Atualizar funil existente
        const { error: updateError } = await supabase
          .from("sales_funnels")
          .update({
            name,
            description,
            updated_at: new Date().toISOString()
          })
          .eq("id", funnelId);

        if (updateError) throw updateError;

        // Deletar etapas antigas
        const { error: deleteError } = await supabase
          .from("funnel_stages")
          .delete()
          .eq("funnel_id", funnelId);

        if (deleteError) throw deleteError;
      } else {
        // Criar novo funil
        const { data: newFunnel, error: createError } = await supabase
          .from("sales_funnels")
          .insert({
            organization_id: memberData.organization_id,
            name,
            description,
            is_active: true,
            is_default: false
          })
          .select()
          .single();

        if (createError) throw createError;
        savedFunnelId = newFunnel.id;
      }

      // Reordenar etapas e salvar
      const sortedStages = [...stages].sort((a, b) => {
        // Etapas customizadas primeiro, depois finais
        if (a.is_final && !b.is_final) return 1;
        if (!a.is_final && b.is_final) return -1;
        return a.position - b.position;
      });

      const stagesToInsert = sortedStages.map((stage, index) => ({
        funnel_id: savedFunnelId,
        name: stage.name,
        description: stage.description,
        color: stage.color,
        icon: stage.icon,
        position: index,
        is_final: stage.is_final,
        stage_type: stage.stage_type,
        default_value: stage.default_value,
        max_days_in_stage: stage.max_days_in_stage,
        required_fields: stage.required_fields
      }));

      const { error: stagesError } = await supabase
        .from("funnel_stages")
        .insert(stagesToInsert);

      if (stagesError) throw stagesError;

      toast.success(funnelId ? "Funil atualizado com sucesso!" : "Funil criado com sucesso!");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Erro ao salvar funil:", error);
      toast.error("Erro ao salvar funil");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>
            {funnelId ? "Editar Funil" : "Criar Novo Funil"}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs value={currentTab} onValueChange={setCurrentTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Informações</TabsTrigger>
              <TabsTrigger value="stages">Etapas</TabsTrigger>
              <TabsTrigger value="sources">Origens</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[calc(90vh-250px)] mt-4">
              <TabsContent value="basic" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome do Funil *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Vendas de Produtos, Agendamentos..."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descrição</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descreva o objetivo deste funil..."
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="stages">
                <FunnelStageBuilder
                  stages={stages}
                  onChange={setStages}
                />
              </TabsContent>

              <TabsContent value="sources">
                {funnelId && (
                  <FunnelSourceMappings
                    funnelId={funnelId}
                    stages={stages}
                  />
                )}
                {!funnelId && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Salve o funil primeiro para configurar as origens de leads
                  </p>
                )}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {funnelId ? "Salvar Alterações" : "Criar Funil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};