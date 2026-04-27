import { supabase } from "@/integrations/supabase/client";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import { useEffect, useState } from "react";

interface Props {
  organizationId: string;
  selectedChannelId: string | null;
  onChannelChange: (channelId: string | null) => void;
}

export function ChannelSelector({ organizationId, selectedChannelId, onChannelChange }: Props) {
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);

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

  if (channels.length <= 1) return null;

  return (
    <div className="px-3 pb-1">
      <select
        value={selectedChannelId || ""}
        onChange={(e) => onChannelChange(e.target.value || null)}
        className="w-full text-[12px] bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        <option value="">Todos os canais</option>
        {channels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.channel_name || ch.instance_name}
          </option>
        ))}
      </select>
    </div>
  );
}
