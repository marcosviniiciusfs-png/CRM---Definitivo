import { useEffect, useState } from "react";
import { Loader2, Target, Tag as TagIcon } from "lucide-react";
import { useTrackingRules } from "@/hooks/useTrackingRules";
import { useOrganization } from "@/contexts/OrganizationContext";
import { TrackingChannelCard } from "./TrackingChannelCard";
import { TrackingChannelDialog } from "./TrackingChannelDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const TAG_NAME = 'Lead de anúncio';
const TAG_COLOR_DEFAULT = '#FB923C';

interface AdTagInfo {
  id: string;
  name: string;
  color: string;
}

export function WhatsAppTrackingTab() {
  const { organizationId, permissions } = useOrganization();
  const { channels, loading, upsertRule } = useTrackingRules();
  const { toast } = useToast();
  const [adTag, setAdTag] = useState<AdTagInfo | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<typeof channels[number] | null>(null);

  const canEdit = permissions.role === 'owner' || permissions.role === 'admin';

  useEffect(() => {
    if (!organizationId) return;
    supabase
      .from('lead_tags')
      .select('id, name, color')
      .eq('organization_id', organizationId)
      .eq('name', TAG_NAME)
      .maybeSingle()
      .then(({ data }) => setAdTag(data as AdTagInfo | null));
  }, [organizationId, channels]); // re-fetch quando channels muda (auto-criação após primeiro tag)

  // Re-sync selectedChannel from channels whenever channels updates (auto-save propagation)
  useEffect(() => {
    if (selectedChannel) {
      const fresh = channels.find(c => c.instance_id === selectedChannel.instance_id);
      if (fresh) setSelectedChannel(fresh);
    }
  }, [channels]);

  const handleSave = async (
    instanceId: string,
    patch: { enabled?: boolean; keywords?: string[] }
  ) => {
    try {
      await upsertRule(instanceId, patch);
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err?.message || 'Tente novamente',
        variant: 'destructive',
      });
    }
  };

  if (!canEdit) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Apenas owner ou admin pode configurar o trackeamento.
      </div>
    );
  }

  if (loading && channels.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Target className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
        <h3 className="text-sm font-medium mb-1">Nenhum canal WhatsApp conectado</h3>
        <p className="text-xs text-muted-foreground">
          Conecte um canal WhatsApp na aba <strong>Conexões</strong> primeiro.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Trackeamento WhatsApp</h2>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Identifique automaticamente leads que vêm de anúncios WhatsApp marcando-os com a tag{" "}
          <strong>Lead de anúncio</strong>.
        </p>

        <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md text-xs">
          <TagIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Tag aplicada:</span>
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium"
            style={{
              backgroundColor: `${adTag?.color || TAG_COLOR_DEFAULT}33`,
              color: adTag?.color || TAG_COLOR_DEFAULT,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: adTag?.color || TAG_COLOR_DEFAULT }}
            />
            {adTag?.name || TAG_NAME}
          </span>
          {!adTag && (
            <span className="text-muted-foreground italic ml-auto">
              (será criada quando o primeiro lead bater)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {channels.map(c => (
          <TrackingChannelCard
            key={c.instance_id}
            channel={c}
            canEdit={canEdit}
            onCardClick={() => setSelectedChannel(c)}
            onToggle={(en) => handleSave(c.instance_id, { enabled: en })}
          />
        ))}
      </div>

      <TrackingChannelDialog
        channel={selectedChannel}
        canEdit={canEdit}
        onClose={() => setSelectedChannel(null)}
        onSave={handleSave}
      />
    </div>
  );
}
