import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAssignedChannels } from "@/hooks/useAssignedChannels";

export interface LeadMembershipCard {
  lead_id: string;
  whatsapp_instance_id: string;
  source: 'inbound' | 'transferred';
  transferred_from_instance_id: string | null;
  transferred_at: string | null;
  transferred_by_user_id: string | null;
  last_message_at: string | null;
  membership_created_at: string;
  nome_lead: string;
  telefone_lead: string;
  email: string | null;
  stage: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  last_seen: string | null;
  source_lead: string | null;
  responsavel: string | null;
  responsavel_user_id: string | null;
  lead_created_at: string;
  lead_updated_at: string;
  organization_id: string;
  lead_whatsapp_instance_id: string | null;
}

interface UseLeadMembershipsResult {
  cards: LeadMembershipCard[];
  loading: boolean;
  reload: () => Promise<void>;
}

const MAX_CARDS = 300;

/**
 * Carrega cards da sidebar do Chat = pares (lead, canal) que o user
 * tem acesso a ver. Substitui a query antiga direta em `leads`.
 *
 * - Owner/admin (hasFullAccess): todos memberships da org.
 * - Member com WCM nao-vazio: memberships cujo instance esta no WCM.
 * - Member com WCM vazio: tudo (compatibilidade pre-feature).
 *
 * Ordenacao por last_message_at DESC NULLS LAST.
 */
export function useLeadMemberships(): UseLeadMembershipsResult {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const { assignedChannelIds, hasFullAccess, loading: wcmLoading } = useAssignedChannels();

  const [cards, setCards] = useState<LeadMembershipCard[]>([]);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const reload = useCallback(async () => {
    if (!user?.id || !organizationId) return;
    if (wcmLoading) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      let instanceFilter: string[] | null = null;
      if (!hasFullAccess) {
        if (assignedChannelIds === null) {
          instanceFilter = null;
        } else if (assignedChannelIds.size === 0) {
          instanceFilter = null;
        } else {
          instanceFilter = Array.from(assignedChannelIds);
        }
      }

      let query = supabase
        .from('lead_channel_memberships')
        .select(`
          lead_id,
          whatsapp_instance_id,
          source,
          transferred_from_instance_id,
          transferred_at,
          transferred_by_user_id,
          last_message_at,
          created_at,
          organization_id,
          lead:leads!inner (
            id, nome_lead, telefone_lead, email, stage, avatar_url,
            is_online, last_seen, source, responsavel, responsavel_user_id,
            created_at, updated_at, whatsapp_instance_id
          )
        `)
        .eq('organization_id', organizationId)
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(MAX_CARDS);

      if (instanceFilter) {
        query = query.in('whatsapp_instance_id', instanceFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error('useLeadMemberships error:', error);
        return;
      }

      const mapped: LeadMembershipCard[] = (data || []).map((row: any) => ({
        lead_id: row.lead_id,
        whatsapp_instance_id: row.whatsapp_instance_id,
        source: row.source,
        transferred_from_instance_id: row.transferred_from_instance_id,
        transferred_at: row.transferred_at,
        transferred_by_user_id: row.transferred_by_user_id,
        last_message_at: row.last_message_at,
        membership_created_at: row.created_at,
        nome_lead: row.lead?.nome_lead || '',
        telefone_lead: row.lead?.telefone_lead || '',
        email: row.lead?.email || null,
        stage: row.lead?.stage || null,
        avatar_url: row.lead?.avatar_url || null,
        is_online: row.lead?.is_online ?? null,
        last_seen: row.lead?.last_seen || null,
        source_lead: row.lead?.source || null,
        responsavel: row.lead?.responsavel || null,
        responsavel_user_id: row.lead?.responsavel_user_id || null,
        lead_created_at: row.lead?.created_at || '',
        lead_updated_at: row.lead?.updated_at || '',
        organization_id: row.organization_id,
        lead_whatsapp_instance_id: row.lead?.whatsapp_instance_id ?? null,
      }));

      setCards(mapped);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [user?.id, organizationId, hasFullAccess, assignedChannelIds, wcmLoading]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { cards, loading, reload };
}
