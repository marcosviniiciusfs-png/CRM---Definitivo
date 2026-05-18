import { supabase } from "@/integrations/supabase/client";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import { useEffect, useMemo, useState } from "react";
import { useAssignedChannels } from "@/hooks/useAssignedChannels";

interface Props {
  organizationId: string;
  selectedChannelId: string | null;
  onChannelChange: (channelId: string | null) => void;
}

export function ChannelSelector({ organizationId, selectedChannelId, onChannelChange }: Props) {
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const { assignedChannelIds, hasFullAccess, loading } = useAssignedChannels();

  useEffect(() => {
    if (!organizationId) return;

    supabase
      .from("whatsapp_instances")
      .select("id, instance_name, channel_name, channel_color, status")
      .eq("organization_id", organizationId)
      .eq("status", "CONNECTED")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setChannels((data || []) as WhatsAppChannel[]);
      });
  }, [organizationId]);

  // Members veem apenas canais aos quais foram atribuidos. Owner/admin
  // (hasFullAccess) ve todos. Set vazio = member sem WCM = 0 canais
  // visiveis (alinhado com isLeadVisibleByChannel + useLeadMemberships
  // apos a remocao do fallback legacy).
  const visibleChannels = useMemo(() => {
    if (hasFullAccess) return channels;
    if (loading || !assignedChannelIds) return [];
    return channels.filter((c) => assignedChannelIds.has(c.id));
  }, [channels, hasFullAccess, loading, assignedChannelIds]);

  // Nenhum canal visivel: nao renderiza nada (Chat ja vai estar vazio).
  if (visibleChannels.length === 0) return null;

  // Exatamente 1 canal: mostra label informativo com o nome do canal +
  // borda colorida. Nao ha o que alternar, mas o member precisa saber
  // em qual canal esta operando.
  if (visibleChannels.length === 1) {
    const ch = visibleChannels[0];
    return (
      <div className="px-3 pb-1">
        <div className="w-full flex items-center gap-2 text-[12px] bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-foreground">
          <div
            className="h-3 w-1 rounded shrink-0"
            style={{ backgroundColor: ch.channel_color || "#888" }}
            aria-hidden
          />
          <span className="text-muted-foreground">Canal:</span>
          <span className="font-medium truncate">
            {ch.channel_name || ch.instance_name}
          </span>
        </div>
      </div>
    );
  }

  // 2+ canais visiveis: dropdown para alternar.
  return (
    <div className="px-3 pb-1">
      <select
        value={selectedChannelId || ""}
        onChange={(e) => onChannelChange(e.target.value || null)}
        className="w-full text-[12px] bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        <option value="">Todos os canais</option>
        {visibleChannels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.channel_name || ch.instance_name}
          </option>
        ))}
      </select>
    </div>
  );
}
