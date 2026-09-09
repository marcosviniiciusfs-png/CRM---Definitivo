import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganization } from "@/contexts/OrganizationContext";

interface AssignedChannelsContextValue {
  assignedChannelIds: Set<string> | null;
  loading: boolean;
  hasFullAccess: boolean;
  refresh: () => Promise<void>;
}

const AssignedChannelsContext = createContext<AssignedChannelsContextValue | null>(null);

const FALLBACK_REFRESH_MS = 5 * 60 * 1000;

/**
 * Mantem uma unica consulta/assinatura de canais por sessao. Antes deste
 * provider, cada uso de useAssignedChannels abria seu proprio canal Realtime e
 * um polling de 15 segundos; no Chat o hook era montado varias vezes.
 */
export function AssignedChannelsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { organizationId, permissions } = useOrganization();
  const hasFullAccess = !!permissions.canViewAllLeads;
  const [assignedChannelIds, setAssignedChannelIds] = useState<Set<string> | null>(
    hasFullAccess ? null : new Set(),
  );
  const [loading, setLoading] = useState(!hasFullAccess);
  const requestInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (hasFullAccess) {
      setAssignedChannelIds(null);
      setLoading(false);
      return;
    }

    if (!user?.id || !organizationId || requestInFlight.current) {
      if (!user?.id || !organizationId) {
        setAssignedChannelIds(new Set());
        setLoading(false);
      }
      return;
    }

    requestInFlight.current = true;
    try {
      const { data, error } = await supabase
        .from("whatsapp_channel_members")
        .select("whatsapp_instance_id")
        .eq("user_id", user.id)
        .eq("organization_id", organizationId);

      if (error) throw error;
      setAssignedChannelIds(
        new Set<string>((data ?? []).map((row) => row.whatsapp_instance_id)),
      );
    } catch (error) {
      console.error("Falha ao carregar canais atribuidos:", error);
    } finally {
      requestInFlight.current = false;
      setLoading(false);
    }
  }, [hasFullAccess, organizationId, user?.id]);

  useEffect(() => {
    void refresh();

    if (hasFullAccess || !user?.id || !organizationId) return;

    const channel = supabase
      .channel(`assigned-channels-${organizationId}-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_channel_members",
          filter: `user_id=eq.${user.id}`,
        },
        () => void refresh(),
      )
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    // Fallback de baixa frequencia caso o websocket seja interrompido.
    const fallbackTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, FALLBACK_REFRESH_MS);

    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(fallbackTimer);
      void supabase.removeChannel(channel);
    };
  }, [hasFullAccess, organizationId, refresh, user?.id]);

  const value = useMemo(
    () => ({ assignedChannelIds, loading, hasFullAccess, refresh }),
    [assignedChannelIds, hasFullAccess, loading, refresh],
  );

  return (
    <AssignedChannelsContext.Provider value={value}>
      {children}
    </AssignedChannelsContext.Provider>
  );
}

export function useAssignedChannelsContext(): AssignedChannelsContextValue {
  const context = useContext(AssignedChannelsContext);
  if (!context) {
    throw new Error("useAssignedChannels deve ser usado dentro de AssignedChannelsProvider");
  }
  return context;
}
