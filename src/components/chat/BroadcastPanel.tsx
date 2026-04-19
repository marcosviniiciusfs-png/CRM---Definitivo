import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Lead, Broadcast, BroadcastContact } from "@/types/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  ArrowLeft,
  Search,
  Radio,
  Send,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  RotateCcw,
} from "lucide-react";

interface BroadcastPanelProps {
  organizationId: string;
  leads: Lead[];
  userId?: string;
}

type View = "list" | "create" | "detail";

const STATUS_BADGE: Record<Broadcast["status"], { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  sending: { label: "Enviando...", cls: "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400 animate-pulse" },
  completed: { label: "Concluída", cls: "bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400" },
  cancelled: { label: "Cancelada", cls: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" },
  failed: { label: "Falhou", cls: "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400" },
};

const CONTACT_ICON: Record<BroadcastContact["status"], { icon: React.ReactNode; cls: string }> = {
  pending: { icon: <Clock className="h-3 w-3 shrink-0" />, cls: "text-gray-400" },
  sent: { icon: <CheckCircle2 className="h-3 w-3 shrink-0" />, cls: "text-green-500" },
  error: { icon: <XCircle className="h-3 w-3 shrink-0" />, cls: "text-red-500" },
  skipped: { icon: <Ban className="h-3 w-3 shrink-0" />, cls: "text-gray-400" },
};

const fieldCls = "w-full box-border rounded-md border border-input bg-background px-2.5 py-1.5 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

export function BroadcastPanel({ organizationId, leads, userId }: BroadcastPanelProps) {
  const { toast } = useToast();
  const permissions = usePermissions();

  const [view, setView] = useState<View>("list");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);

  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const [broadcastsPage, setBroadcastsPage] = useState(0);
  const [hasMoreBroadcasts, setHasMoreBroadcasts] = useState(true);
  const PAGE_SIZE = 20;

  const [name, setName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [contacts, setContacts] = useState<BroadcastContact[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [isSending, setIsSending] = useState(false);
  const cancelRef = useRef(false);

  const availableLeads = leads.filter((lead) => {
    if (!lead.telefone_lead) return false;
    if (permissions.canViewAllLeads) return true;
    return lead.responsavel_user_id === userId;
  });

  const filteredLeads = searchQuery
    ? availableLeads.filter(
        (l) =>
          l.nome_lead?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.telefone_lead?.includes(searchQuery)
      )
    : availableLeads;

  const fetchBroadcasts = useCallback(
    async (page: number, append = false) => {
      if (!organizationId) return;
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        toast({ title: "Erro", description: "Falha ao carregar transmissões", variant: "destructive" });
      } else {
        setBroadcasts((prev) => (append ? [...prev, ...(data as Broadcast[])] : (data as Broadcast[])));
        setHasMoreBroadcasts(data.length === PAGE_SIZE);
      }
      setBroadcastsLoading(false);
    },
    [organizationId, toast]
  );

  useEffect(() => {
    if (view === "list" && organizationId) {
      setBroadcastsLoading(true);
      setBroadcastsPage(0);
      fetchBroadcasts(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, organizationId]);

  const fetchDetail = useCallback(
    async (broadcastId: string) => {
      setDetailLoading(true);
      const { data: bData, error: bError } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("id", broadcastId)
        .maybeSingle();

      if (bError || !bData) {
        toast({ title: "Erro", description: "Transmissão não encontrada", variant: "destructive" });
        setDetailLoading(false);
        setView("list");
        return;
      }

      setBroadcast(bData as Broadcast);

      const { data: cData } = await supabase
        .from("broadcast_contacts")
        .select("*")
        .eq("broadcast_id", broadcastId)
        .order("created_at", { ascending: true });

      setContacts((cData as BroadcastContact[]) || []);
      setDetailLoading(false);
    },
    [toast]
  );

  useEffect(() => {
    if (view !== "detail" || !selectedBroadcastId) return;

    const channel = supabase
      .channel(`broadcast-${selectedBroadcastId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcast_contacts",
          filter: `broadcast_id=eq.${selectedBroadcastId}`,
        },
        (payload) => {
          const updated = payload.new as BroadcastContact;
          setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcasts",
          filter: `id=eq.${selectedBroadcastId}`,
        },
        (payload) => {
          setBroadcast(payload.new as Broadcast);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, selectedBroadcastId]);

  const openDetail = (broadcastId: string) => {
    setSelectedBroadcastId(broadcastId);
    setView("detail");
    fetchDetail(broadcastId);
  };

  const handleDisparar = async () => {
    if (!name.trim()) {
      toast({ title: "Erro", description: "Informe o nome da transmissão", variant: "destructive" });
      return;
    }
    if (!messageText.trim()) {
      toast({ title: "Erro", description: "Informe a mensagem", variant: "destructive" });
      return;
    }
    if (selectedLeadIds.size === 0) {
      toast({ title: "Erro", description: "Selecione ao menos 1 contato", variant: "destructive" });
      return;
    }
    if (selectedLeadIds.size > 500) {
      toast({ title: "Erro", description: "Máximo de 500 contatos", variant: "destructive" });
      return;
    }
    if (messageText.length > 4096) {
      toast({ title: "Erro", description: "Mensagem excede 4096 caracteres", variant: "destructive" });
      return;
    }
    if (!userId) {
      toast({ title: "Erro", description: "Usuário não identificado", variant: "destructive" });
      return;
    }

    const selectedLeads = availableLeads.filter((l) => selectedLeadIds.has(l.id));
    const contactsRows = selectedLeads.map((l) => ({
      lead_id: l.id,
      phone: l.telefone_lead,
      name: l.nome_lead || "Sem nome",
      status: "pending" as const,
    }));

    const { data: broadcastData, error: broadcastError } = await supabase
      .from("broadcasts")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        name: name.trim(),
        message_text: messageText.trim(),
        status: "sending",
        total_contacts: contactsRows.length,
        delay_seconds: delaySeconds,
      })
      .select()
      .single();

    if (broadcastError || !broadcastData) {
      toast({ title: "Erro", description: "Falha ao criar transmissão", variant: "destructive" });
      return;
    }

    const { error: contactsError } = await supabase.from("broadcast_contacts").insert(
      contactsRows.map((c) => ({
        ...c,
        broadcast_id: broadcastData.id,
      }))
    );

    if (contactsError) {
      toast({ title: "Erro", description: "Falha ao adicionar contatos", variant: "destructive" });
      await supabase.from("broadcasts").delete().eq("id", broadcastData.id);
      return;
    }

    toast({ title: "Transmissão criada", description: `${contactsRows.length} contatos na fila` });

    setSelectedBroadcastId(broadcastData.id);
    setView("detail");
    setBroadcast(broadcastData as Broadcast);
    setContacts(
      contactsRows.map((c, i) => ({
        id: `temp-${i}`,
        broadcast_id: broadcastData.id,
        lead_id: c.lead_id,
        phone: c.phone,
        name: c.name,
        status: "pending" as const,
        created_at: new Date().toISOString(),
      }))
    );

    runBatchSend(broadcastData.id);
  };

  const runBatchSend = async (broadcastId: string) => {
    setIsSending(true);
    cancelRef.current = false;
    let batchError = false;

    const { data: cData } = await supabase
      .from("broadcast_contacts")
      .select("*")
      .eq("broadcast_id", broadcastId)
      .order("created_at", { ascending: true });
    if (cData) setContacts(cData as BroadcastContact[]);

    let hasMore = true;
    while (hasMore && !cancelRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("send-broadcast", {
          body: { broadcast_id: broadcastId, batch_size: 50 },
        });

        if (error || !data?.success) {
          toast({
            title: "Erro no envio",
            description: data?.error || "Falha ao processar lote",
            variant: "destructive",
          });
          batchError = true;
          break;
        }

        hasMore = data.has_more;
        if (hasMore) await new Promise((r) => setTimeout(r, 1000));
      } catch {
        toast({ title: "Erro", description: "Falha de conexão com o servidor", variant: "destructive" });
        batchError = true;
        break;
      }
    }

    if (cancelRef.current) {
      await supabase
        .from("broadcast_contacts")
        .update({ status: "skipped" })
        .eq("broadcast_id", broadcastId)
        .eq("status", "pending");
      await supabase
        .from("broadcasts")
        .update({ status: "cancelled" })
        .eq("id", broadcastId);
    } else if (batchError) {
      await supabase
        .from("broadcasts")
        .update({ status: "failed" })
        .eq("id", broadcastId);
    } else {
      await supabase
        .from("broadcasts")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", broadcastId);
    }

    await fetchDetail(broadcastId);
    setIsSending(false);
  };

  const handleCancel = () => {
    cancelRef.current = true;
  };

  const handleResume = () => {
    if (selectedBroadcastId) runBatchSend(selectedBroadcastId);
  };

  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const insertVariable = (variable: string) => {
    setMessageText((prev) => prev + variable);
  };

  const previewMessage = messageText
    .replace(/\{\{nome\}\}/g, "João Silva")
    .replace(/\{\{telefone\}\}/g, "11999999999");

  const progressPercent = broadcast
    ? Math.round(((broadcast.sent_count + broadcast.error_count) / Math.max(broadcast.total_contacts, 1)) * 100)
    : 0;

  const hasPendingContacts = contacts.some((c) => c.status === "pending");
  const showResumeButton = !isSending && broadcast?.status === "sending" && hasPendingContacts;

  // VIEW: List
  if (view === "list") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b shrink-0">
          <h3 className="font-semibold text-xs">Transmissões</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 text-[11px] px-2"
            onClick={() => {
              setName("");
              setMessageText("");
              setDelaySeconds(3);
              setSearchQuery("");
              setSelectedLeadIds(new Set());
              setView("create");
            }}
          >
            <Plus className="h-3 w-3" />
            Nova
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {broadcastsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-3 text-center text-muted-foreground">
              <Radio className="h-6 w-6 mb-1.5" />
              <p className="text-xs">Nenhuma transmissão</p>
              <p className="text-[10px]">Clique em "Nova" para criar</p>
            </div>
          ) : (
            <div className="divide-y">
              {broadcasts.map((b) => (
                <button
                  key={b.id}
                  onClick={() => openDetail(b.id)}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="text-[11px] font-medium truncate">{b.name}</span>
                    <Badge variant="secondary" className={`text-[9px] px-1 py-0 leading-tight shrink-0 ${STATUS_BADGE[b.status].cls}`}>
                      {STATUS_BADGE[b.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{b.sent_count}/{b.total_contacts} enviados</span>
                    <span>{new Date(b.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {hasMoreBroadcasts && broadcasts.length > 0 && (
            <div className="p-2 text-center">
              <Button
                size="sm"
                variant="ghost"
                className="text-[10px] h-6"
                onClick={() => {
                  const nextPage = broadcastsPage + 1;
                  setBroadcastsPage(nextPage);
                  fetchBroadcasts(nextPage, true);
                }}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // VIEW: Create
  if (view === "create") {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => setView("list")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <h3 className="font-semibold text-xs truncate">Nova Transmissão</h3>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 py-2.5 space-y-2.5">
            {/* Nome */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Nome</label>
              <Input
                placeholder="Ex: Promoção Abril"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-xs h-7"
              />
            </div>

            {/* Mensagem */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Mensagem</label>
              <textarea
                className={`${fieldCls} min-h-[72px] resize-none`}
                placeholder="Digite sua mensagem..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={4096}
              />
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex gap-0.5 overflow-hidden">
                  <button
                    type="button"
                    className="h-5 text-[9px] px-1.5 rounded border border-input bg-background hover:bg-muted/50 transition-colors shrink-0"
                    onClick={() => insertVariable("{{nome}}")}
                  >
                    nome
                  </button>
                  <button
                    type="button"
                    className="h-5 text-[9px] px-1.5 rounded border border-input bg-background hover:bg-muted/50 transition-colors shrink-0"
                    onClick={() => insertVariable("{{telefone}}")}
                  >
                    telefone
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground shrink-0">{messageText.length}/4096</span>
              </div>
            </div>

            {/* Preview */}
            {messageText.includes("{{") && (
              <div className="rounded bg-muted/40 p-2">
                <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Preview</p>
                <p className="text-[11px] whitespace-pre-wrap break-words leading-tight">{previewMessage}</p>
              </div>
            )}

            {/* Delay */}
            <div>
              <label className="text-[10px] font-medium text-muted-foreground mb-0.5 block">Intervalo</label>
              <select
                className={`${fieldCls} h-7`}
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
              >
                <option value={2}>2s entre envios</option>
                <option value={3}>3s entre envios</option>
                <option value={5}>5s entre envios</option>
                <option value={10}>10s entre envios</option>
              </select>
            </div>

            {/* Contatos */}
            <div className="border-t pt-2.5">
              <label className="text-[10px] font-medium text-muted-foreground mb-1 block">
                Contatos ({selectedLeadIds.size}/{filteredLeads.length})
              </label>
              <div className="relative mb-1.5">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-7 text-xs h-7"
                />
              </div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Checkbox
                  id="select-all"
                  checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                  onCheckedChange={toggleAll}
                  className="h-3.5 w-3.5"
                />
                <label htmlFor="select-all" className="text-[10px] text-muted-foreground cursor-pointer">
                  Todos
                </label>
              </div>
              <div className="max-h-[180px] overflow-y-auto space-y-px">
                {filteredLeads.map((lead) => (
                  <label
                    key={lead.id}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedLeadIds.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-[11px] truncate">{lead.nome_lead || "Sem nome"}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{lead.telefone_lead}</p>
                    </div>
                  </label>
                ))}
                {filteredLeads.length === 0 && (
                  <p className="text-[10px] text-muted-foreground text-center py-3">Nenhum contato</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t px-3 py-2 flex items-center justify-between shrink-0">
          <span className="text-[10px] text-muted-foreground">{selectedLeadIds.size} selecionados</span>
          <Button
            size="sm"
            className="gap-1 h-7 text-[11px]"
            disabled={isSending}
            onClick={handleDisparar}
          >
            {isSending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Disparar
          </Button>
        </div>
      </div>
    );
  }

  // VIEW: Detail
  if (view === "detail") {
    if (detailLoading || !broadcast) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b shrink-0">
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={() => setView("list")}>
            <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-xs truncate">{broadcast.name}</h3>
          </div>
          <Badge variant="secondary" className={`text-[9px] px-1 py-0 leading-tight shrink-0 ${STATUS_BADGE[broadcast.status].cls}`}>
            {STATUS_BADGE[broadcast.status].label}
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-3 py-2.5 space-y-2.5">
            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {broadcast.sent_count + broadcast.error_count}/{broadcast.total_contacts}
                </span>
                <span className="text-[10px] text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-1.5" />
              <div className="flex gap-2 mt-0.5 text-[9px] text-muted-foreground">
                <span className="text-green-600">{broadcast.sent_count} enviados</span>
                <span className="text-red-600">{broadcast.error_count} erros</span>
              </div>
            </div>

            {/* Mensagem */}
            <div className="rounded bg-muted/40 p-2">
              <p className="text-[9px] font-medium text-muted-foreground mb-0.5">Mensagem</p>
              <p className="text-[11px] whitespace-pre-wrap break-words leading-tight">{broadcast.message_text}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              {isSending && (
                <Button size="sm" variant="destructive" className="text-[10px] gap-1 h-6 px-2" onClick={handleCancel}>
                  <X className="h-2.5 w-2.5" />
                  Cancelar
                </Button>
              )}
              {showResumeButton && (
                <Button size="sm" className="text-[10px] gap-1 h-6 px-2" onClick={handleResume}>
                  <RotateCcw className="h-2.5 w-2.5" />
                  Retomar
                </Button>
              )}
            </div>

            {/* Contatos */}
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Contatos</p>
              <div className="space-y-px">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-muted/50">
                    <span className={CONTACT_ICON[c.status].cls}>{CONTACT_ICON[c.status].icon}</span>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <p className="text-[11px] truncate">{c.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate">{c.phone}</p>
                    </div>
                    {c.status === "sent" && c.sent_at && (
                      <span className="text-[9px] text-muted-foreground shrink-0">
                        {new Date(c.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {c.status === "error" && c.error_message && (
                      <span className="text-[9px] text-red-500 truncate max-w-[80px]">{c.error_message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
}
