import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GroupQuotedSnapshot {
  evolution_message_id?: string | null;
  participant?: string | null;
  sender_pushname?: string | null;
  corpo_mensagem?: string | null;
  media_type?: string | null;
  direcao?: "ENTRADA" | "SAIDA" | null;
}

export interface GroupMessage {
  id: string;
  evolution_message_id: string | null;
  sender_jid: string | null;
  sender_pushname: string | null;
  corpo_mensagem: string;
  direcao: "ENTRADA" | "SAIDA";
  data_hora: string;
  status_entrega: string | null;
  media_url: string | null;
  media_type: string | null;
  media_metadata: any;
  quoted_message_id: string | null;
  quoted_message: GroupQuotedSnapshot | null;
}

interface Params {
  instanceName: string | null;
  groupId: string | null;
}

interface Result {
  messages: GroupMessage[];
  // Dia mais antigo carregado (formato YYYY-MM-DD). null = nada carregado.
  oldestDayLoaded: string | null;
  // Proximo dia anterior que tem mensagens — null se nao ha mais historia.
  previousDayAvailable: string | null;
  isLoadingInitial: boolean;
  isLoadingPrevious: boolean;
  isError: boolean;
  error: Error | null;
  loadPreviousDay: () => Promise<void>;
  refetch: () => void;
}

/**
 * Carrega mensagens de grupo no estilo WhatsApp Web:
 *
 * - Primeiro carregamento: dia mais recente com msgs (modo "B" do design).
 * - Botao "Carregar dia anterior": busca o proximo dia que tem msgs (pula vazios).
 * - Polling 3s: busca apenas msgs com `data_hora > ultima conhecida` (modo
 *   incremental do edge function) — nao refaz fetch das msgs antigas.
 *
 * Estado mergeado em `messages` (todos os dias, ordem cronologica).
 */
export function useGroupMessages({ instanceName, groupId }: Params): Result {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [oldestDayLoaded, setOldestDayLoaded] = useState<string | null>(null);
  const [previousDayAvailable, setPreviousDayAvailable] = useState<string | null>(null);
  const [isLoadingInitial, setIsLoadingInitial] = useState(false);
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(false);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMountedRef = useRef(false);
  const lastDataHoraRef = useRef<string | null>(null);
  // Snapshot do messages para uso dentro do polling (evita re-criar interval a cada msg).
  const messagesRef = useRef<GroupMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Helper para mergear sem duplicar (por id ou evolution_message_id).
  const mergeMessages = useCallback((existing: GroupMessage[], incoming: GroupMessage[], position: "prepend" | "append"): GroupMessage[] => {
    const byId = new Set(existing.map((m) => m.id));
    const byEv = new Set(existing.filter((m) => m.evolution_message_id).map((m) => m.evolution_message_id));
    const fresh = incoming.filter((m) => {
      if (byId.has(m.id)) return false;
      if (m.evolution_message_id && byEv.has(m.evolution_message_id)) return false;
      return true;
    });
    if (fresh.length === 0) return existing;
    const merged = position === "prepend" ? [...fresh, ...existing] : [...existing, ...fresh];
    // Garantir ordem cronologica (ascending) ao final
    return merged.sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
  }, []);

  // ----- Carregamento inicial (dia mais recente com msgs) -----
  const loadInitial = useCallback(async () => {
    if (!instanceName || !groupId) return;
    setIsLoadingInitial(true);
    setIsError(false);
    setError(null);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("get-group-messages", {
        body: { instance_name: instanceName, group_id: groupId },
      });
      if (invErr) throw new Error(invErr.message);
      if (!data?.success) throw new Error(data?.error || "Resposta inesperada");
      const msgs = (data.messages || []) as GroupMessage[];
      if (!isMountedRef.current) return;
      setMessages(msgs);
      setOldestDayLoaded(data.currentDay || null);
      setPreviousDayAvailable(data.previousDayWithMessages || null);
      if (msgs.length > 0) {
        lastDataHoraRef.current = msgs[msgs.length - 1].data_hora;
      } else {
        lastDataHoraRef.current = null;
      }
    } catch (e: any) {
      if (!isMountedRef.current) return;
      setIsError(true);
      setError(e);
    } finally {
      if (isMountedRef.current) setIsLoadingInitial(false);
    }
  }, [instanceName, groupId]);

  // ----- Reset ao trocar de grupo -----
  useEffect(() => {
    setMessages([]);
    setOldestDayLoaded(null);
    setPreviousDayAvailable(null);
    setIsError(false);
    setError(null);
    lastDataHoraRef.current = null;
    if (instanceName && groupId) void loadInitial();
  }, [instanceName, groupId, loadInitial]);

  // ----- Botao "Carregar dia anterior" -----
  const loadPreviousDay = useCallback(async () => {
    if (!instanceName || !groupId || !previousDayAvailable || isLoadingPrevious) return;
    setIsLoadingPrevious(true);
    try {
      const { data, error: invErr } = await supabase.functions.invoke("get-group-messages", {
        body: { instance_name: instanceName, group_id: groupId, day: previousDayAvailable },
      });
      if (invErr) throw new Error(invErr.message);
      if (!data?.success) throw new Error(data?.error || "Resposta inesperada");
      const olderMsgs = (data.messages || []) as GroupMessage[];
      if (!isMountedRef.current) return;
      setMessages((prev) => mergeMessages(prev, olderMsgs, "prepend"));
      setOldestDayLoaded(data.currentDay || previousDayAvailable);
      setPreviousDayAvailable(data.previousDayWithMessages || null);
    } catch (e: any) {
      if (!isMountedRef.current) return;
      setError(e);
    } finally {
      if (isMountedRef.current) setIsLoadingPrevious(false);
    }
  }, [instanceName, groupId, previousDayAvailable, isLoadingPrevious, mergeMessages]);

  // ----- Polling incremental (3s) -----
  // Faz duas coisas:
  //  1. fetch incremental (since_data_hora) -> novas msgs
  //  2. refresh de status_entrega de saidas pendentes (SENT/DELIVERED -> READ),
  //     ja que since_data_hora nao pega UPDATEs (data_hora nao muda).
  useEffect(() => {
    if (!instanceName || !groupId) return;

    const tick = async () => {
      if (!isMountedRef.current) return;
      const since = lastDataHoraRef.current;

      // 1) Novas msgs
      try {
        const body: Record<string, unknown> = { instance_name: instanceName, group_id: groupId };
        if (since) body.since_data_hora = since;
        else body.day = oldestDayLoaded; // sem `since`, recarrega mesmo dia atual
        const { data, error: invErr } = await supabase.functions.invoke("get-group-messages", { body });
        if (invErr || !data?.success) return;
        const incoming = (data.messages || []) as GroupMessage[];
        if (incoming.length > 0 && isMountedRef.current) {
          setMessages((prev) => {
            const merged = mergeMessages(prev, incoming, "append");
            if (merged !== prev && merged.length > 0) {
              lastDataHoraRef.current = merged[merged.length - 1].data_hora;
            }
            return merged;
          });
        }
      } catch {
        // silencioso
      }

      // 2) Status refresh — SELECT direto via supabase (RLS protege por org).
      // Lista as saidas pendentes (nao-READ) e re-busca status atual.
      if (!isMountedRef.current) return;
      const pendingIds = messagesRef.current
        .filter((m) => m.direcao === "SAIDA" && m.status_entrega !== "READ")
        .map((m) => m.id);
      if (pendingIds.length > 0) {
        try {
          // Cap defensivo: olha so as 50 mais recentes pendentes (raro ter mais).
          const slice = pendingIds.slice(-50);
          // Tabela ainda nao foi adicionada ao types.ts gerado — cast para destravar.
          const { data: statuses } = await (supabase as any)
            .from("mensagens_grupo")
            .select("id, status_entrega")
            .in("id", slice);
          if (statuses && statuses.length > 0 && isMountedRef.current) {
            const map = new Map<string, string | null>(
              statuses.map((r: any) => [r.id as string, (r.status_entrega ?? null) as string | null])
            );
            setMessages((prev) => {
              let changed = false;
              const next = prev.map((m) => {
                const ns = map.get(m.id);
                if (ns !== undefined && ns !== m.status_entrega) {
                  changed = true;
                  return { ...m, status_entrega: ns };
                }
                return m;
              });
              return changed ? next : prev;
            });
          }
        } catch {
          // silencioso
        }
      }
    };

    const interval = setInterval(tick, 3000);
    return () => clearInterval(interval);
  }, [instanceName, groupId, oldestDayLoaded, mergeMessages]);

  return {
    messages,
    oldestDayLoaded,
    previousDayAvailable,
    isLoadingInitial,
    isLoadingPrevious,
    isError,
    error,
    loadPreviousDay,
    refetch: loadInitial,
  };
}
