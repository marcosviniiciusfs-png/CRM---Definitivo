import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

/**
 * Hook que retorna o conjunto de IDs de canais WhatsApp aos quais o usuario
 * logado tem acesso para visualizar leads/mensagens.
 *
 * Regras:
 * - Owner / admin (canViewAllLeads = true): retorna `null` (significa "todos
 *   os canais"). Os componentes interpretam null como bypass do filtro.
 * - Member com 1+ atribuicao em whatsapp_channel_members: retorna o Set
 *   dos IDs atribuidos. So ve leads desses canais.
 * - Member SEM nenhuma atribuicao (Set vazio): tratamos como "org nao
 *   opt-ou para o filtro de canal" e nao filtramos nada (comportamento
 *   legado pre-feature). Sem essa fallback, members em orgs que nunca
 *   configuraram a tabela WCM perdem visibilidade de TODOS os leads
 *   WhatsApp no Chat (Pipeline continua mostrando porque nao usa esse
 *   filtro). Quem quiser restringir um member precisa atribui-lo a pelo
 *   menos um canal — restricoes implicitas via "remover todas as
 *   atribuicoes" devem ser feitas via section_access ou cargo custom.
 *
 * `loading` indica que o hook ainda nao terminou de buscar os dados — ate la
 * o consumidor deve evitar renderizar listas filtradas para nao "vazar" dados.
 */
export function useAssignedChannels(): {
  assignedChannelIds: Set<string> | null;
  loading: boolean;
  hasFullAccess: boolean;
} {
  const { user } = useAuth();
  const { organizationId, permissions } = useOrganization();
  const hasFullAccess = !!permissions.canViewAllLeads;

  const [assignedChannelIds, setAssignedChannelIds] = useState<Set<string> | null>(
    hasFullAccess ? null : new Set()
  );
  const [loading, setLoading] = useState(!hasFullAccess);

  useEffect(() => {
    if (hasFullAccess) {
      setAssignedChannelIds(null);
      setLoading(false);
      return;
    }

    if (!user?.id || !organizationId) {
      setAssignedChannelIds(new Set());
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAssignments = async () => {
      const { data } = await supabase
        .from("whatsapp_channel_members")
        .select("whatsapp_instance_id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId);

      if (cancelled) return;
      const ids = new Set<string>((data || []).map((r: any) => r.whatsapp_instance_id));
      setAssignedChannelIds(ids);
      setLoading(false);
    };

    fetchAssignments();

    // Realtime: atualiza quando admin muda atribuicoes do user logado.
    const channel = supabase
      .channel(`wcm-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_channel_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchAssignments();
        }
      )
      .subscribe();

    // Polling defensivo (Realtime tem se mostrado nao confiavel neste ambiente).
    const interval = setInterval(fetchAssignments, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user?.id, organizationId, hasFullAccess]);

  return { assignedChannelIds, loading, hasFullAccess };
}

/**
 * Helper para decidir se um lead e visivel para o user atual com base na
 * atribuicao de canais.
 *
 * - Lead sem whatsapp_instance_id (criado manual / Facebook / etc.): sempre visivel.
 * - Owner/admin com hasFullAccess (assignedChannelIds === null): sempre visivel.
 * - Member com Set nao-vazio: visivel apenas se o canal do lead esta no Set.
 * - Member com Set vazio (sem WCM): NAO visivel. Owner precisa atribuir
 *   explicitamente. Migration 20260516120000 fez backfill defensivo no
 *   deploy para nao quebrar acesso de members existentes.
 */
export function isLeadVisibleByChannel(
  leadInstanceId: string | null | undefined,
  assignedChannelIds: Set<string> | null
): boolean {
  if (!leadInstanceId) return true;
  if (assignedChannelIds === null) return true;
  return assignedChannelIds.has(leadInstanceId);
}
