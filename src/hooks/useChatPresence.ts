import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { PresenceInfo } from "@/components/chat/types";
import { useToast } from "@/hooks/use-toast";

interface UseChatPresenceProps {
  userId: string | undefined;
  selectedLead: Lead | null;
  presenceStatus: Map<string, PresenceInfo>;
  setPresenceStatus: React.Dispatch<React.SetStateAction<Map<string, PresenceInfo>>>;
}

export function useChatPresence({
  userId,
  selectedLead,
  presenceStatus,
  setPresenceStatus,
}: UseChatPresenceProps) {
  const { toast } = useToast();
  const presenceQueue = useRef<Array<{ lead: Lead; instanceName: string }>>([]);
  const isProcessingQueue = useRef(false);
  const loadingPresence = useRef(false);

  // Set WhatsApp presence when entering/leaving chat
  useEffect(() => {
    let instanceName: string | null = null;

    const setPresence = async (presence: "available" | "unavailable") => {
      if (!instanceName) return;
      try {
        await supabase.functions.invoke("set-whatsapp-presence", {
          body: { instance_name: instanceName, presence },
        });
      } catch (error) {
        console.error("Erro ao definir presença:", error);
      }
    };

    const initPresence = async () => {
      if (!userId) return;
      const { data: instance } = await supabase
        .from("whatsapp_instances")
        .select("instance_name, status")
        .eq("user_id", userId)
        .eq("status", "CONNECTED")
        .maybeSingle();

      if (instance?.instance_name) {
        instanceName = instance.instance_name;
        await setPresence("available");
      }
    };

    initPresence();

    const handleBeforeUnload = () => {
      if (instanceName) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        navigator.sendBeacon(
          `${supabaseUrl}/functions/v1/set-whatsapp-presence`,
          JSON.stringify({ instance_name: instanceName, presence: "unavailable" })
        );
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (instanceName) {
        setPresence("unavailable");
      }
    };
  }, [userId]);

  // Process presence queue
  const processPresenceQueue = useCallback(async () => {
    if (isProcessingQueue.current || presenceQueue.current.length === 0) return;
    isProcessingQueue.current = true;

    while (presenceQueue.current.length > 0) {
      const item = presenceQueue.current.shift();
      if (!item) break;

      try {
        const { data: presenceData, error: presenceError } = await supabase.functions.invoke(
          "fetch-presence-status",
          {
            body: {
              instance_name: item.instanceName,
              phone_number: item.lead.telefone_lead,
              lead_id: item.lead.id,
            },
          }
        );

        if (!presenceError && presenceData?.success) {
          const isRateLimited = Boolean(presenceData.rate_limited);

          if (isRateLimited) {
            setPresenceStatus((prev) => {
              const next = new Map(prev);
              const current = next.get(item.lead.id);
              if (current) {
                next.set(item.lead.id, { ...current, rateLimited: true });
              } else {
                next.set(item.lead.id, { isOnline: false, status: "unknown", rateLimited: true });
              }
              return next;
            });
          } else {
            setPresenceStatus((prev) =>
              new Map(prev).set(item.lead.id, {
                isOnline: presenceData.is_online,
                lastSeen: presenceData.last_seen,
                status: presenceData.status,
                rateLimited: false,
              })
            );
          }
        }
      } catch (error) {
        console.error("Erro ao processar item da fila:", error);
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    isProcessingQueue.current = false;
    loadingPresence.current = false;
  }, [setPresenceStatus]);

  const fetchPresenceStatus = useCallback(
    (lead: Lead, instanceName: string) => {
      presenceQueue.current.push({ lead, instanceName });
      processPresenceQueue();
    },
    [processPresenceQueue]
  );

  const refreshPresenceForLead = useCallback(
    async (lead: Lead) => {
      if (!lead || loadingPresence.current) return;
      loadingPresence.current = true;

      try {
        const { data: instances } = await supabase
          .from("whatsapp_instances")
          .select("*")
          .eq("status", "CONNECTED")
          .limit(1)
          .single();

        if (!instances?.instance_name) {
          toast({
            title: "Erro",
            description: "Nenhuma instância WhatsApp conectada",
            variant: "destructive",
          });
          loadingPresence.current = false;
          return;
        }

        fetchPresenceStatus(lead, instances.instance_name);
      } catch (error) {
        console.error("Erro ao buscar status de presença:", error);
        loadingPresence.current = false;
      }
    },
    [fetchPresenceStatus, toast]
  );

  // Auto-refresh presence for selected lead
  useEffect(() => {
    if (!selectedLead) return;

    refreshPresenceForLead(selectedLead);
    const intervalId = setInterval(() => {
      refreshPresenceForLead(selectedLead);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [selectedLead, refreshPresenceForLead]);

  return {
    refreshPresenceForLead,
    isLoadingPresence: loadingPresence.current,
  };
}
