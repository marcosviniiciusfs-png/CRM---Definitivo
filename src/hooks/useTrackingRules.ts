import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

export interface TrackingRule {
  whatsapp_instance_id: string;
  organization_id: string;
  enabled: boolean;
  keywords: string[];
  match_mode: 'any' | 'all' | 'exact_phrase';
  case_sensitive: boolean;
  updated_at: string;
}

export interface ChannelWithRule {
  instance_id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string | null;
  phone_number: string | null;
  rule: TrackingRule | null;
}

interface UseTrackingRulesResult {
  channels: ChannelWithRule[];
  loading: boolean;
  reload: () => Promise<void>;
  upsertRule: (
    instanceId: string,
    patch: Partial<Pick<TrackingRule, 'enabled' | 'keywords' | 'match_mode' | 'case_sensitive'>>
  ) => Promise<void>;
}

export function useTrackingRules(): UseTrackingRulesResult {
  const { organizationId } = useOrganization();
  const [channels, setChannels] = useState<ChannelWithRule[]>([]);
  const [loading, setLoading] = useState(false);
  const inflight = useRef(false);

  const reload = useCallback(async () => {
    if (!organizationId) return;
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);

    try {
      const [{ data: instances, error: instErr }, { data: rules, error: ruleErr }] = await Promise.all([
        supabase
          .from('whatsapp_instances')
          .select('id, instance_name, channel_name, channel_color, phone_number, status')
          .eq('organization_id', organizationId)
          .eq('status', 'CONNECTED')
          .order('created_at', { ascending: true }),
        // @ts-expect-error - whatsapp_tracking_rules table types not yet regenerated
        supabase
          .from('whatsapp_tracking_rules')
          .select('*')
          .eq('organization_id', organizationId),
      ]);

      if (instErr) {
        console.error('useTrackingRules instances error:', instErr);
        return;
      }
      if (ruleErr) {
        console.error('useTrackingRules rules error:', ruleErr);
        return;
      }

      const ruleByInstance = new Map<string, TrackingRule>();
      (rules || []).forEach((r: any) => ruleByInstance.set(r.whatsapp_instance_id, r as TrackingRule));

      const merged: ChannelWithRule[] = (instances || []).map((i: any) => ({
        instance_id: i.id,
        instance_name: i.instance_name,
        channel_name: i.channel_name,
        channel_color: i.channel_color,
        phone_number: i.phone_number,
        rule: ruleByInstance.get(i.id) || null,
      }));

      setChannels(merged);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [organizationId]);

  const upsertRule = useCallback(async (
    instanceId: string,
    patch: Partial<Pick<TrackingRule, 'enabled' | 'keywords' | 'match_mode' | 'case_sensitive'>>
  ) => {
    if (!organizationId) return;

    // Merge com row existente (se houver)
    const current = channels.find(c => c.instance_id === instanceId)?.rule;
    const next = {
      whatsapp_instance_id: instanceId,
      organization_id: organizationId,
      enabled: patch.enabled ?? current?.enabled ?? true,
      keywords: patch.keywords ?? current?.keywords ?? [],
      match_mode: patch.match_mode ?? current?.match_mode ?? 'any',
      case_sensitive: patch.case_sensitive ?? current?.case_sensitive ?? false,
    };

    const { error } = await supabase
      // @ts-expect-error - whatsapp_tracking_rules table types not yet regenerated
      .from('whatsapp_tracking_rules')
      .upsert(next, { onConflict: 'whatsapp_instance_id' });

    if (error) {
      console.error('upsertRule error:', error);
      throw error;
    }

    // Atualiza estado local sem refetch (otimista)
    setChannels(prev => prev.map(c =>
      c.instance_id === instanceId
        ? { ...c, rule: { ...next, updated_at: new Date().toISOString() } as TrackingRule }
        : c
    ));
  }, [organizationId, channels]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { channels, loading, reload, upsertRule };
}
