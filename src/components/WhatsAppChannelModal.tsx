import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { ChannelAssignMembersDialog } from "@/components/ChannelAssignMembersDialog";

const MAX_CHANNELS = 5;
const ALERT_SOURCES = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "facebook", label: "Facebook Leads" },
  { value: "webhook", label: "Formulários" },
] as const;
const DEFAULT_ALERT_SOURCES = ALERT_SOURCES.map(({ value }) => value);
type AlertSource = (typeof ALERT_SOURCES)[number]["value"];
const LIVE_CHECK_TIMEOUT_MS = 12_000;

const withTimeout = async <T,>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Tempo limite da consulta excedido")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

interface WhatsAppGroupOption {
  id: string;
  subject: string;
  size?: number;
}

interface EvolutionGroupResult {
  id?: unknown;
  subject?: unknown;
  size?: unknown;
}

const isConnected = (status?: string | null) =>
  ["connected", "open"].includes(String(status || "").toLowerCase());

interface LeadCountRow {
  whatsapp_instance_id: string | null;
}

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
  const [leadCaptureSaving, setLeadCaptureSaving] = useState<string | null>(null);
  const [alertGroupDrafts, setAlertGroupDrafts] = useState<Record<string, string>>({});
  const [alertSourceDrafts, setAlertSourceDrafts] = useState<Record<string, AlertSource[]>>({});
  const [alertSaving, setAlertSaving] = useState<string | null>(null);
  const [groupsByChannel, setGroupsByChannel] = useState<Record<string, WhatsAppGroupOption[]>>({});
  const [groupsLoading, setGroupsLoading] = useState<Record<string, boolean>>({});
  const [statusChecking, setStatusChecking] = useState<Record<string, boolean>>({});

  // Stale-while-revalidate: only the very first load shows the spinner.
  // Subsequent refetches (polling, post-action refreshes) keep the rendered
  // list in place to avoid flicker.
  const hasLoadedOnceRef = useRef(false);
  const requestedGroupsRef = useRef(new Set<string>());
  const requestedStatusChecksRef = useRef(new Set<string>());

  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    if (!hasLoadedOnceRef.current) setLoading(true);

    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, channel_name, channel_color, status, phone_number, created_at, connected_at, accepts_leads, lead_alerts_enabled, lead_alert_group_id, lead_alert_last_sent_at, lead_alert_source_filters")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar canais", description: error.message, variant: "destructive" });
    } else {
      setChannels((data || []) as WhatsAppChannel[]);
    }
    if (!hasLoadedOnceRef.current) {
      setLoading(false);
      hasLoadedOnceRef.current = true;
    }
  }, [organizationId, toast]);

  const loadLeadCounts = useCallback(async (channelIds: string[]) => {
    if (channelIds.length === 0) return;
    const { data } = await supabase
      .from("leads")
      .select("whatsapp_instance_id")
      .in("whatsapp_instance_id", channelIds);

    const counts: Record<string, number> = {};
    ((data || []) as LeadCountRow[]).forEach((l) => {
      const id = l.whatsapp_instance_id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    setLeadCounts(counts);
  }, []);

  const loadChannelGroups = useCallback(async (channel: WhatsAppChannel) => {
    if (!channel.instance_name || !isConnected(channel.status)) return;
    setGroupsLoading((current) => ({ ...current, [channel.id]: true }));

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("get-contact-groups", {
          body: { instance_name: channel.instance_name },
        }),
        LIVE_CHECK_TIMEOUT_MS,
      );
      if (error || data?.success === false) throw new Error(data?.error || error?.message);

      const rawGroups: EvolutionGroupResult[] = Array.isArray(data?.groups) ? data.groups : [];
      const groups = rawGroups
        .map((group) => ({
          id: String(group.id || ""),
          subject: String(group.subject || group.id || "Grupo sem nome"),
          size: typeof group.size === "number" ? group.size : undefined,
        }))
        .filter((group: WhatsAppGroupOption) => group.id.endsWith("@g.us"));

      setGroupsByChannel((current) => ({ ...current, [channel.id]: groups }));
    } catch (error: unknown) {
      toast({
        title: "Erro ao carregar grupos",
        description: error instanceof Error ? error.message : "Não foi possível listar os grupos deste canal.",
        variant: "destructive",
      });
    } finally {
      setGroupsLoading((current) => ({ ...current, [channel.id]: false }));
    }
  }, [toast]);

  useEffect(() => {
    if (open) loadChannels();
  }, [open, loadChannels]);

  useEffect(() => {
    if (channels.length > 0) loadLeadCounts(channels.map((c) => c.id));
  }, [channels, loadLeadCounts]);

  useEffect(() => {
    setAlertGroupDrafts((current) => {
      const next = { ...current };
      channels.forEach((channel) => {
        if (next[channel.id] === undefined) next[channel.id] = channel.lead_alert_group_id || "";
      });
      return next;
    });
    setAlertSourceDrafts((current) => {
      const next = { ...current };
      channels.forEach((channel) => {
        if (next[channel.id] === undefined) {
          next[channel.id] = (channel.lead_alert_source_filters?.length
            ? channel.lead_alert_source_filters
            : DEFAULT_ALERT_SOURCES) as AlertSource[];
        }
      });
      return next;
    });
  }, [channels]);

  useEffect(() => {
    if (!open) {
      requestedGroupsRef.current.clear();
      return;
    }
    channels.forEach((channel) => {
      if (!channel.instance_name || !isConnected(channel.status) || requestedGroupsRef.current.has(channel.id)) return;
      requestedGroupsRef.current.add(channel.id);
      void loadChannelGroups(channel);
    });
  }, [open, channels, loadChannelGroups]);

  // Stored connection states can become stale when a webhook is missed. Check
  // every channel once per modal session so this works for every organization.
  useEffect(() => {
    if (!open) {
      requestedStatusChecksRef.current.clear();
      setStatusChecking({});
      return;
    }

    const unchecked = channels.filter(
      (channel) => channel.instance_name && !requestedStatusChecksRef.current.has(channel.id),
    );
    if (unchecked.length === 0) return;

    unchecked.forEach((channel) => requestedStatusChecksRef.current.add(channel.id));
    setStatusChecking((current) => {
      const next = { ...current };
      unchecked.forEach((channel) => { next[channel.id] = true; });
      return next;
    });

    let cancelled = false;
    (async () => {
      await Promise.allSettled(
        unchecked.map((channel) =>
          withTimeout(
            supabase.functions.invoke("check-whatsapp-status", {
              body: { instance_name: channel.instance_name },
            }),
            LIVE_CHECK_TIMEOUT_MS,
          )
        )
      );
      if (!cancelled) {
        setStatusChecking((current) => {
          const next = { ...current };
          unchecked.forEach((channel) => { delete next[channel.id]; });
          return next;
        });
        void loadChannels();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, channels, loadChannels]);

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

  const handleLeadCaptureToggle = async (channelId: string, enabled: boolean) => {
    if (!canManage || !organizationId) return;

    setLeadCaptureSaving(channelId);
    try {
      if (enabled) {
        const { error: disableOthersError } = await supabase
          .from("whatsapp_instances")
          .update({ accepts_leads: false })
          .eq("organization_id", organizationId)
          .neq("id", channelId);

        if (disableOthersError) throw disableOthersError;
      }

      const { error } = await supabase
        .from("whatsapp_instances")
        .update({ accepts_leads: enabled })
        .eq("id", channelId)
        .eq("organization_id", organizationId);

      if (error) throw error;

      setChannels((prev) =>
        prev.map((channel) => ({
          ...channel,
          accepts_leads: channel.id === channelId ? enabled : enabled ? false : channel.accepts_leads,
        })),
      );

      toast({
        title: enabled ? "Canal recebendo novos leads" : "Canal pausado para novos leads",
        description: enabled
          ? "Este número será usado para criar leads novos."
          : "Este número continuará nas conversas, mas não criará novos leads.",
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível alterar o número criador de leads.";
      toast({
        title: "Erro ao atualizar canal",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLeadCaptureSaving(null);
    }
  };

  const handleAlertSourceToggle = (channel: WhatsAppChannel, source: AlertSource) => {
    const current = alertSourceDrafts[channel.id] || DEFAULT_ALERT_SOURCES;
    if (current.includes(source) && current.length === 1) {
      toast({
        title: "Selecione pelo menos uma origem",
        description: "O aviso precisa permanecer vinculado a uma origem de lead.",
        variant: "destructive",
      });
      return;
    }
    const next = current.includes(source)
      ? current.filter((item) => item !== source)
      : [...current, source];
    setAlertSourceDrafts((drafts) => ({ ...drafts, [channel.id]: next }));
    if (channel.lead_alerts_enabled) void handleLeadAlertToggle(channel, true, undefined, next);
  };

  const handleLeadAlertToggle = async (
    channel: WhatsAppChannel,
    enabled: boolean,
    groupOverride?: string,
    sourcesOverride?: AlertSource[],
  ) => {
    if (!canManage || !organizationId) return;
    const groupId = (groupOverride || alertGroupDrafts[channel.id] || channel.lead_alert_group_id || "").trim();
    const sources = sourcesOverride || alertSourceDrafts[channel.id] || DEFAULT_ALERT_SOURCES;

    if (enabled && !groupId.endsWith("@g.us")) {
      toast({
        title: "Selecione um grupo",
        description: "Escolha o grupo do WhatsApp antes de ativar os avisos.",
        variant: "destructive",
      });
      return;
    }

    setAlertSaving(channel.id);
    try {
      if (enabled) {
        const { error: disableError } = await supabase
          .from("whatsapp_instances")
          .update({ lead_alerts_enabled: false, lead_alert_group_id: null })
          .eq("organization_id", organizationId)
          .neq("id", channel.id);
        if (disableError) throw disableError;
      }

      const { error } = await supabase
        .from("whatsapp_instances")
        .update({
          lead_alerts_enabled: enabled,
          lead_alert_group_id: enabled ? groupId : null,
          lead_alert_source_filters: sources,
        })
        .eq("id", channel.id)
        .eq("organization_id", organizationId);
      if (error) throw error;

      setChannels((current) => current.map((item) => ({
        ...item,
        lead_alerts_enabled: item.id === channel.id ? enabled : enabled ? false : item.lead_alerts_enabled,
        lead_alert_group_id: item.id === channel.id ? (enabled ? groupId : null) : enabled ? null : item.lead_alert_group_id,
        lead_alert_source_filters: item.id === channel.id ? sources : item.lead_alert_source_filters,
      })));
      toast({
        title: enabled ? "Avisos de novos leads ativados" : "Avisos de novos leads desativados",
        description: enabled
          ? "Novos leads das origens selecionadas serão enviados ao grupo."
          : "Este canal não enviará avisos ao grupo.",
      });
    } catch (error: unknown) {
      toast({
        title: "Erro ao atualizar avisos",
        description: error instanceof Error ? error.message : "Não foi possível salvar a configuração.",
        variant: "destructive",
      });
    } finally {
      setAlertSaving(null);
    }
  };

  const handleDisconnect = async (channel: WhatsAppChannel) => {
    // The Edge Function expects `instanceId` (matches whatsapp_instances.id),
    // not `instance_name`. The previous payload made the function fail with
    // "Instance ID is required" → toast "Erro ao desconectar" no console.
    const { data, error } = await supabase.functions.invoke("disconnect-whatsapp-instance", {
      body: { instanceId: channel.id },
    });

    if (error || !data?.success) {
      toast({
        title: "Erro ao desconectar",
        description: data?.error || error?.message || undefined,
        variant: "destructive",
      });
    } else {
      toast({ title: "Canal desconectado" });
      loadChannels();
    }
  };

  const [reconfiguring, setReconfiguring] = useState(false);
  const [assigningChannel, setAssigningChannel] = useState<WhatsAppChannel | null>(null);
  const handleReconfigureWebhooks = async () => {
    setReconfiguring(true);
    try {
      const { data, error } = await supabase.functions.invoke("fix-webhook-config");
      if (error) {
        toast({
          title: "Erro ao reconfigurar webhooks",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Webhooks reconfigurados",
          description: data?.message || "Mensagens devem voltar a chegar em alguns segundos.",
        });
      }
    } finally {
      setReconfiguring(false);
    }
  };

  const connectedCount = channels.filter((c) => isConnected(c.status)).length;
  const remaining = MAX_CHANNELS - channels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Canais WhatsApp</DialogTitle>
        <DialogDescription className="sr-only">
          Gerencie os canais WhatsApp conectados a esta organização. Conecte até 5 números diferentes.
        </DialogDescription>
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
          {connectedCount > 0 && canManage && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[10px] px-2.5"
              disabled={reconfiguring}
              onClick={handleReconfigureWebhooks}
              title="Reaplica a configuracao de webhook em todos os canais conectados desta organizacao. Use se as mensagens pararam de chegar apos conectar um novo canal."
            >
              {reconfiguring ? "Reconfigurando..." : "Reconfigurar webhooks"}
            </Button>
          )}
        </div>

        {/* Channel List */}
        <div className="px-4 py-2 max-h-[62vh] overflow-y-auto">
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
                        {isConnected(channel.status) && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {channel.phone_number || "Aguardando..."}
                        {leadCounts[channel.id] != null && ` · ${leadCounts[channel.id]} leads`}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-2.5 py-2">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold">
                              Número que cria leads
                            </p>
                            <p className="truncate text-[10px] text-muted-foreground">
                              {statusChecking[channel.id]
                                ? "Verificando conexão..."
                                : !isConnected(channel.status)
                                  ? "Status não confirmado; configuração disponível"
                                  : channel.accepts_leads !== false
                                    ? "Recebe novos contatos como leads"
                                    : "Somente conversas existentes"}
                            </p>
                          </div>
                          <Switch
                            checked={channel.accepts_leads !== false}
                            disabled={!canManage || leadCaptureSaving === channel.id}
                            onCheckedChange={(checked) => handleLeadCaptureToggle(channel.id, checked)}
                            aria-label={`Definir ${channel.phone_number || channel.instance_name} como número criador de leads`}
                          />
                        </div>
                      <div className="mt-2 space-y-2.5 rounded-md border bg-muted/20 px-2.5 py-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold">Avisos de novos leads</p>
                              <p className="text-[10px] text-muted-foreground">
                                {statusChecking[channel.id]
                                  ? "Verificando conexão..."
                                  : isConnected(channel.status)
                                    ? "Envia os dados do novo lead para um grupo."
                                    : "A sessão foi encerrada. Reconecte o WhatsApp para carregar os grupos."}
                              </p>
                            </div>
                            <Switch
                              checked={channel.lead_alerts_enabled === true}
                              disabled={!canManage || alertSaving === channel.id}
                              onCheckedChange={(checked) => handleLeadAlertToggle(channel, checked)}
                              aria-label="Ativar avisos de novos leads no grupo"
                            />
                          </div>

                          <Select
                            value={alertGroupDrafts[channel.id] || channel.lead_alert_group_id || ""}
                            disabled={!canManage || !isConnected(channel.status) || groupsLoading[channel.id]}
                            onValueChange={(value) => {
                              setAlertGroupDrafts((current) => ({ ...current, [channel.id]: value }));
                              if (channel.lead_alerts_enabled) void handleLeadAlertToggle(channel, true, value);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={groupsLoading[channel.id] ? "Carregando grupos..." : "Selecionar grupo"} />
                            </SelectTrigger>
                            <SelectContent>
                              {(groupsByChannel[channel.id] || []).map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                  {group.subject}{group.size ? ` (${group.size})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          <div className="flex flex-wrap gap-1.5">
                            {ALERT_SOURCES.map((source) => {
                              const selected = (alertSourceDrafts[channel.id] || DEFAULT_ALERT_SOURCES).includes(source.value);
                              return (
                                <Button
                                  key={source.value}
                                  type="button"
                                  size="sm"
                                  variant={selected ? "default" : "outline"}
                                  className="h-7 px-2 text-[10px]"
                                  disabled={!canManage || alertSaving === channel.id}
                                  onClick={() => handleAlertSourceToggle(channel, source.value)}
                                >
                                  {source.label}
                                </Button>
                              );
                            })}
                          </div>
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
                      className="h-7 text-[10px] px-2.5"
                      onClick={() => setAssigningChannel(channel)}
                      title="Atribuir colaboradores que veem leads deste canal"
                    >
                      Atribuir
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
              <WhatsAppConnection newConnectionMode />
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
              {connectedCount === 0 && channels.length > 0
                ? "Reconectar WhatsApp"
                : `+ Conectar novo canal ${remaining > 0 ? `(${remaining} restante${remaining !== 1 ? "s" : ""})` : "(limite atingido)"}`}
            </Button>
          )}
        </div>
      </DialogContent>

      {assigningChannel && (
        <ChannelAssignMembersDialog
          open={!!assigningChannel}
          onOpenChange={(o) => { if (!o) setAssigningChannel(null); }}
          channelId={assigningChannel.id}
          channelName={assigningChannel.channel_name || assigningChannel.instance_name}
          organizationId={organizationId}
        />
      )}
    </Dialog>
  );
}
