import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ArrowRightLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ChannelOption {
  id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string | null;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  organizationId: string;
  currentChannelId: string;
}

export function TransferLeadDialog({
  open,
  onOpenChange,
  leadId,
  leadName,
  organizationId,
  currentChannelId,
}: Props) {
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const [{ data: instances }, { data: memberships }] = await Promise.all([
        supabase
          .from("whatsapp_instances")
          .select("id, instance_name, channel_name, channel_color, status")
          .eq("organization_id", organizationId)
          .eq("status", "CONNECTED")
          .order("created_at", { ascending: true }),
        supabase
          .from("lead_channel_memberships")
          .select("whatsapp_instance_id")
          .eq("lead_id", leadId),
      ]);

      if (cancelled) return;

      const existingIds = new Set((memberships || []).map((m: any) => m.whatsapp_instance_id));
      const filtered: ChannelOption[] = (instances || [])
        .filter((i: any) => i.id !== currentChannelId && !existingIds.has(i.id))
        .map((i: any) => ({
          id: i.id,
          instance_name: i.instance_name,
          channel_name: i.channel_name,
          channel_color: i.channel_color,
          status: i.status,
        }));

      setChannels(filtered);
      setSelectedTargetId(filtered[0]?.id ?? null);
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [open, leadId, organizationId, currentChannelId]);

  const handleTransfer = async () => {
    if (!selectedTargetId) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("transfer-lead-to-channel", {
        body: { lead_id: leadId, target_instance_id: selectedTargetId },
      });

      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Erro desconhecido");
      }

      const targetName =
        channels.find((c) => c.id === selectedTargetId)?.channel_name ||
        channels.find((c) => c.id === selectedTargetId)?.instance_name ||
        "canal selecionado";

      toast({
        title: "Lead transferido",
        description: `${leadName} agora também está no canal ${targetName}.`,
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "Erro ao transferir",
        description: err?.message || "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Transferir conversa para outro canal
          </DialogTitle>
          <DialogDescription>
            Selecione o canal para onde <strong>{leadName}</strong> deve ser transferido.
            O canal alvo poderá ver o histórico atual em modo leitura e iniciar uma nova conversa.
            O canal atual continua com acesso normal ao lead.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : channels.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Não há outros canais conectados disponíveis para transferência.
            </p>
          ) : (
            <div className="space-y-2">
              <Label className="text-sm">Canal alvo:</Label>
              {channels.map((c) => (
                <label
                  key={c.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedTargetId === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="target_channel"
                    checked={selectedTargetId === c.id}
                    onChange={() => setSelectedTargetId(c.id)}
                    className="h-4 w-4"
                  />
                  <div
                    className="h-4 w-1 rounded"
                    style={{ backgroundColor: c.channel_color || "#888" }}
                  />
                  <span className="text-sm font-medium">
                    {c.channel_name || c.instance_name}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedTargetId || submitting || loading}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
