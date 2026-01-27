import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy, RefreshCw, Check } from "lucide-react";
import { FunnelSelector } from "@/components/FunnelSelector";

interface WebhookConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: {
    id: string;
    webhook_token: string;
    is_active: boolean;
    name: string | null;
    tag_id: string | null;
  } | null;
  tagName: string;
  organizationId: string;
  onUpdated: () => void;
}

export const WebhookConfigModal = ({
  open,
  onOpenChange,
  webhook,
  tagName,
  organizationId,
  onUpdated,
}: WebhookConfigModalProps) => {
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (webhook) {
      setName(webhook.name || tagName || "");
      setIsActive(webhook.is_active);
    }
  }, [webhook, tagName]);

  if (!webhook) return null;

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/form-webhook/${webhook.webhook_token}`;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    setRegenerating(true);
    try {
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const { error } = await supabase
        .from("webhook_configs")
        .update({ webhook_token: newToken })
        .eq("id", webhook.id);

      if (error) throw error;

      toast.success("Token regenerado! A URL anterior não funcionará mais.");
      onUpdated();
    } catch (error) {
      console.error("Erro ao regenerar token:", error);
      toast.error("Erro ao regenerar token");
    } finally {
      setRegenerating(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("webhook_configs")
        .update({
          name: name.trim() || null,
          is_active: isActive,
        })
        .eq("id", webhook.id);

      if (error) throw error;

      // Atualizar nome da tag também, se existir
      if (webhook.tag_id && name.trim()) {
        await supabase
          .from("lead_tags")
          .update({ name: name.trim() })
          .eq("id", webhook.tag_id);
      }

      toast.success("Webhook atualizado!");
      onOpenChange(false);
      onUpdated();
    } catch (error) {
      console.error("Erro ao salvar webhook:", error);
      toast.error("Erro ao salvar webhook");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurar Webhook</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="config-name">Nome do Webhook</Label>
            <Input
              id="config-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do webhook"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">
                Webhooks inativos não criarão leads
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>URL do Webhook</Label>
            <div className="flex gap-2">
              <Input value={webhookUrl} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Use esta URL como destino do seu formulário. Envie dados via POST com os campos:{" "}
              <code className="px-1 py-0.5 bg-muted rounded">nome</code> e{" "}
              <code className="px-1 py-0.5 bg-muted rounded">telefone</code> (obrigatórios).
            </p>
          </div>

          <Button
            variant="outline"
            onClick={handleRegenerateToken}
            disabled={regenerating}
            className="w-full"
          >
            {regenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Regenerar Token
          </Button>

          <div className="pt-2 border-t">
            <FunnelSelector sourceType="webhook" className="w-full" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
