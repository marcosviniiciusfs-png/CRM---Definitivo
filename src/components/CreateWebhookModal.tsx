import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface CreateWebhookModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onCreated: () => void;
}

export const CreateWebhookModal = ({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: CreateWebhookModalProps) => {
  const [name, setName] = useState("");
  const [tagName, setTagName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error("Digite um nome para o webhook");
      return;
    }

    if (!tagName.trim()) {
      toast.error("Digite um nome para a tag");
      return;
    }

    setLoading(true);
    try {
      // Criar a tag primeiro
      const { data: tagData, error: tagError } = await supabase
        .from("lead_tags")
        .insert({
          name: tagName,
          organization_id: organizationId,
          color: "#10b981",
        })
        .select("id")
        .single();

      if (tagError) throw tagError;

      // Criar o webhook
      const { error: webhookError } = await supabase
        .from("webhook_configs")
        .insert({
          organization_id: organizationId,
          tag_id: tagData.id,
          name: name,
          is_active: true,
        });

      if (webhookError) throw webhookError;

      toast.success("Webhook criado com sucesso!");
      setName("");
      setTagName("");
      onOpenChange(false);
      onCreated();
    } catch (error: any) {
      console.error("Erro ao criar webhook:", error);
      toast.error("Erro ao criar webhook. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Criar Novo Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-name">Nome do Webhook</Label>
            <Input
              id="webhook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Landing Page, Formulário Site"
            />
            <p className="text-xs text-muted-foreground">
              Nome para identificar este webhook na lista
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tag-name">Nome da Tag</Label>
            <Input
              id="tag-name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Ex: Landing Page, Site, Campanha"
            />
            <p className="text-xs text-muted-foreground">
              Esta tag será aplicada automaticamente aos leads criados por este webhook
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={loading || !name.trim() || !tagName.trim()}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Webhook
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
