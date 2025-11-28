import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { FunnelStagesConfig } from "./FunnelStagesConfig";
import { FunnelSourceMapping } from "./FunnelSourceMapping";

interface FunnelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  funnel?: any;
  onSuccess: () => void;
}

export const FunnelConfigDialog = ({
  open,
  onOpenChange,
  funnel,
  onSuccess,
}: FunnelConfigDialogProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [funnelId, setFunnelId] = useState<string | null>(null);

  useEffect(() => {
    if (funnel) {
      setName(funnel.name);
      setDescription(funnel.description || "");
      setIsActive(funnel.is_active);
      setFunnelId(funnel.id);
    } else {
      setName("");
      setDescription("");
      setIsActive(true);
      setFunnelId(null);
    }
  }, [funnel, open]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Nome do funil é obrigatório");
      return;
    }

    setLoading(true);
    try {
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!orgData) {
        toast.error("Organização não encontrada");
        return;
      }

      if (funnel) {
        // Atualizar funil existente
        const { error } = await supabase
          .from("sales_funnels")
          .update({
            name,
            description,
            is_active: isActive,
            updated_at: new Date().toISOString(),
          })
          .eq("id", funnel.id);

        if (error) throw error;
        toast.success("Funil atualizado!");
        onSuccess();
      } else {
        // Criar novo funil
        const { data: newFunnel, error } = await supabase
          .from("sales_funnels")
          .insert({
            name,
            description,
            is_active: isActive,
            organization_id: orgData.organization_id,
            is_default: false,
          })
          .select()
          .single();

        if (error) throw error;
        setFunnelId(newFunnel.id);
        toast.success("Funil criado! Agora configure as etapas.");
        // NÃO chamar onSuccess aqui para manter o modal aberto
      }
    } catch (error) {
      console.error("Erro ao salvar funil:", error);
      toast.error("Erro ao salvar funil");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {funnel ? "Editar Funil" : "Novo Funil"}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full" value={funnelId ? undefined : "info"}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="stages" disabled={!funnelId}>
              Etapas {!funnelId && "(salve primeiro)"}
            </TabsTrigger>
            <TabsTrigger value="sources" disabled={!funnelId}>
              Origens {!funnelId && "(salve primeiro)"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Funil *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Vendas Odontologia"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o propósito deste funil..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between py-2">
              <div className="space-y-0.5">
                <Label>Funil Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Funis inativos não aparecem no pipeline
                </p>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              {funnelId && (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Concluir
                </Button>
              )}
              {!funnelId && (
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
              )}
              <Button onClick={handleSave} disabled={loading}>
                {loading ? "Salvando..." : funnelId ? "Atualizar" : "Criar e Configurar"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="stages" className="mt-4">
            {funnelId && <FunnelStagesConfig funnelId={funnelId} />}
          </TabsContent>

          <TabsContent value="sources" className="mt-4">
            {funnelId && (
              <div className="space-y-4">
                <FunnelSourceMapping funnelId={funnelId} />
                <div className="flex justify-end pt-4 border-t">
                  <Button
                    onClick={() => {
                      toast.success("Funil criado com sucesso!");
                      onSuccess();
                      onOpenChange(false);
                    }}
                    size="lg"
                  >
                    Criar Funil
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
