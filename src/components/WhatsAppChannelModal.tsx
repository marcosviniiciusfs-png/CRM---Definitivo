import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import WhatsAppConnection from "@/components/WhatsAppConnection";

const MAX_CHANNELS = 5;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  canManage: boolean;
}

export function WhatsAppChannelModal({ open, onOpenChange, organizationId, canManage }: Props) {
  const { toast } = useToast();
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});

  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, channel_name, channel_color, status, phone_number, created_at, connected_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar canais", description: error.message, variant: "destructive" });
    } else {
      setChannels((data || []) as WhatsAppChannel[]);
    }
    setLoading(false);
  }, [organizationId, toast]);

  const loadLeadCounts = useCallback(async (channelIds: string[]) => {
    if (channelIds.length === 0) return;
    const { data } = await supabase
      .from("leads")
      .select("whatsapp_instance_id")
      .in("whatsapp_instance_id", channelIds);

    const counts: Record<string, number> = {};
    (data || []).forEach((l: any) => {
      const id = l.whatsapp_instance_id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    setLeadCounts(counts);
  }, []);

  useEffect(() => {
    if (open) loadChannels();
  }, [open, loadChannels]);

  useEffect(() => {
    if (channels.length > 0) loadLeadCounts(channels.map((c) => c.id));
  }, [channels, loadLeadCounts]);

  // Watch for new connections while the connect panel is shown.
  // WhatsAppConnection is a self-contained component with no onConnected callback,
  // so we poll the DB to detect when a channel reaches CONNECTED status.
  useEffect(() => {
    if (!showConnect) return;

    const interval = setInterval(() => {
      loadChannels();
    }, 4000);

    return () => clearInterval(interval);
  }, [showConnect, loadChannels]);

  const handleSaveName = async (channelId: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({ channel_name: editName.trim() })
      .eq("id", channelId);

    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
    } else {
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, channel_name: editName.trim() } : c))
      );
      setEditingId(null);
    }
  };

  const handleDisconnect = async (channel: WhatsAppChannel) => {
    const { error } = await supabase.functions.invoke("disconnect-whatsapp-instance", {
      body: { instance_name: channel.instance_name },
    });

    if (error) {
      toast({ title: "Erro ao desconectar", variant: "destructive" });
    } else {
      toast({ title: "Canal desconectado" });
      loadChannels();
    }
  };

  const connectedCount = channels.filter((c) => c.status === "CONNECTED").length;
  const remaining = MAX_CHANNELS - channels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center text-base">
              💬
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">Canais WhatsApp</h3>
              <p className="text-[11px] text-muted-foreground">
                {connectedCount} de {MAX_CHANNELS} canais conectados
              </p>
            </div>
          </div>
        </div>

        {/* Channel List */}
        <div className="px-4 py-2 max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhum canal conectado
            </div>
          ) : (
            channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-3 py-3 border-b last:border-b-0"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                  style={{ background: `${channel.channel_color}20` }}
                >
                  📱
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === channel.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleSaveName(channel.id)}
                      />
                      <Button size="sm" variant="default" className="h-7 text-[11px] px-3" onClick={() => handleSaveName(channel.id)}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setEditingId(null)}>✕</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate">
                          {channel.channel_name || channel.instance_name}
                        </span>
                        {channel.status === "CONNECTED" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {channel.phone_number || "Aguardando..."}
                        {leadCounts[channel.id] != null && ` · ${leadCounts[channel.id]} leads`}
                      </div>
                    </>
                  )}
                </div>
                {editingId !== channel.id && canManage && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2.5"
                      onClick={() => { setEditingId(channel.id); setEditName(channel.channel_name || channel.instance_name); }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2.5 text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => handleDisconnect(channel)}
                    >
                      Desconectar
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t">
          {showConnect ? (
            <div className="space-y-3">
              <WhatsAppConnection />
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowConnect(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white text-[13px] font-semibold h-9"
              disabled={remaining <= 0 || !canManage}
              onClick={() => setShowConnect(true)}
            >
              + Conectar novo canal {remaining > 0 ? `(${remaining} restante${remaining !== 1 ? "s" : ""})` : "(limite atingido)"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
