import { memo, useState, useRef, useEffect, useLayoutEffect, useMemo, KeyboardEvent, useCallback } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Send, Users, ArrowLeft, AlertCircle, Loader2, ArrowUp,
  Search, X, ChevronUp, ChevronDown,
  FileText, Download, Globe,
  Reply, Paperclip, Mic, Square, Check, CheckCheck, Clock,
  Image as ImageIcon, Film, FileAudio,
} from "lucide-react";
import { ContactGroup } from "@/hooks/useContactGroups";
import { useGroupMessages, GroupMessage } from "@/hooks/useGroupMessages";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { parseMessageContent, extractMentionsFromInput } from "@/lib/messageContent";
import { useOpusRecorder } from "@/hooks/useOpusRecorder";

interface Props {
  group: ContactGroup;
  instanceName: string;
  onBack?: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDayLabel(dayKey: string): string {
  try {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const todayKey = today.toISOString().slice(0, 10);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);
    if (dayKey === todayKey) return "Hoje";
    if (dayKey === yesterdayKey) return "Ontem";
    const [y, m, d] = dayKey.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return dayKey;
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function GroupConversationViewImpl({ group, instanceName, onBack }: Props) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendingFile, setSendingFile] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [replyingTo, setReplyingTo] = useState<GroupMessage | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRootRef = useRef<HTMLDivElement>(null);
  const scrollEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousFirstMsgIdRef = useRef<string | null>(null);
  const previousScrollHeightRef = useRef<number>(0);
  const isFirstRenderRef = useRef(true);

  // ---- Search state ----
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState(0);
  const [serverMatches, setServerMatches] = useState<GroupMessage[] | null>(null);
  const [serverSearching, setServerSearching] = useState(false);

  // ---- Image viewer state ----
  const [viewingImage, setViewingImage] = useState<{ url: string; caption?: string } | null>(null);

  // ---- Highlight transitorio (reply -> scroll-to-original) ----
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = messageRefs.current.get(msgId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMsgId(msgId);
    window.setTimeout(() => setHighlightedMsgId((curr) => (curr === msgId ? null : curr)), 1800);
  }, []);

  const {
    messages,
    previousDayAvailable,
    isLoadingInitial,
    isLoadingPrevious,
    isError,
    error,
    loadPreviousDay,
  } = useGroupMessages({ instanceName, groupId: group.id });

  const firstMsgId = messages[0]?.id || null;
  const lastMsgId = messages[messages.length - 1]?.id || null;

  // Reset ao trocar de grupo (refs + search state + reply)
  useEffect(() => {
    isFirstRenderRef.current = true;
    previousFirstMsgIdRef.current = null;
    previousScrollHeightRef.current = 0;
    messageRefs.current.clear();
    setSearchOpen(false);
    setSearchQuery("");
    setSearchIndex(0);
    setServerMatches(null);
    setReplyingTo(null);
    setHighlightedMsgId(null);
  }, [group.id]);

  // Auto-scroll inicial
  useEffect(() => {
    if (isFirstRenderRef.current && messages.length > 0) {
      requestAnimationFrame(() => {
        scrollEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
        isFirstRenderRef.current = false;
      });
    }
  }, [messages.length]);

  // Auto-scroll quando msg nova chega ao final (firstMsgId nao mudou)
  useEffect(() => {
    if (isFirstRenderRef.current) return;
    if (firstMsgId && firstMsgId === previousFirstMsgIdRef.current) {
      scrollEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    previousFirstMsgIdRef.current = firstMsgId;
  }, [lastMsgId, firstMsgId]);

  // Preserva scroll ao prepend (carregar dia anterior)
  useLayoutEffect(() => {
    const el = scrollRootRef.current;
    if (!el) return;
    if (isLoadingPrevious) {
      previousScrollHeightRef.current = el.scrollHeight;
    } else if (previousScrollHeightRef.current > 0) {
      const delta = el.scrollHeight - previousScrollHeightRef.current;
      if (delta > 0) el.scrollTop = delta;
      previousScrollHeightRef.current = 0;
    }
  }, [messages, isLoadingPrevious]);

  // ---- Search híbrida ----
  const trimmedQuery = searchQuery.trim();
  const lcQuery = trimmedQuery.toLowerCase();

  // Memory matches (mensagens já carregadas)
  const memoryMatches = useMemo(() => {
    if (trimmedQuery.length < 2) return [];
    return messages.filter((m) => (m.corpo_mensagem || "").toLowerCase().includes(lcQuery));
  }, [messages, trimmedQuery, lcQuery]);

  // Reset índice quando query muda
  useEffect(() => {
    setSearchIndex(0);
    // server matches só são válidos para a query que os gerou; descartar ao mudar
    setServerMatches(null);
  }, [trimmedQuery]);

  // Combinar memória + servidor (servidor tem prioridade — é mais completo)
  const activeMatches: GroupMessage[] = serverMatches ?? memoryMatches;

  // Scroll para o match atual quando index ou matches mudam
  useEffect(() => {
    if (activeMatches.length === 0) return;
    const target = activeMatches[Math.min(searchIndex, activeMatches.length - 1)];
    if (!target) return;
    const el = messageRefs.current.get(target.id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeMatches, searchIndex]);

  const runServerSearch = async () => {
    if (trimmedQuery.length < 2) return;
    setServerSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("search-group-messages", {
        body: { instance_name: instanceName, group_id: group.id, query: trimmedQuery },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Falha na busca");
      }
      // Server retorna em ordem desc; UI lista em ordem cronologica asc para
      // o "Próximo" andar do mais antigo para o mais novo.
      const matches = ((data.matches || []) as GroupMessage[])
        .slice()
        .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
      setServerMatches(matches);
      setSearchIndex(0);
      if (matches.length === 0) {
        toast({ title: "Nenhum resultado", description: "Nenhuma mensagem encontrada no histórico completo." });
      }
    } catch (e: any) {
      toast({ title: "Erro na busca", description: e?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setServerSearching(false);
    }
  };

  // ---- Send message ----
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const mentions = extractMentionsFromInput(trimmed);
      const { data, error } = await supabase.functions.invoke("send-group-message", {
        body: {
          instance_name: instanceName,
          group_id: group.id,
          message_text: trimmed,
          mentions: mentions.length > 0 ? mentions : undefined,
          quoted_message_id: replyingTo?.id || undefined,
        },
      });
      if (error || !data?.success) {
        throw new Error(data?.error || error?.message || "Falha ao enviar");
      }
      setText("");
      setReplyingTo(null);
      inputRef.current?.focus();
    } catch (err: any) {
      toast({ title: "Erro ao enviar", description: err?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  // ---- Send media (file attachment) ----
  // Estrategia: ler arquivo -> base64 -> POST /send-group-media.
  // Igual ao chat privado: backend faz upload p/ Storage e propaga p/ Evolution.
  const sendMediaBlob = useCallback(async (params: {
    blob: Blob;
    mediaType: "image" | "video" | "audio" | "document";
    fileName: string;
    mimeType: string;
    isPtt?: boolean;
    caption?: string;
  }) => {
    const reader = new FileReader();
    const base64Promise = new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const r = reader.result as string;
        // mantemos o prefixo data:...;base64, para o backend tirar (espelha chat privado).
        resolve(r);
      };
      reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
    });
    reader.readAsDataURL(params.blob);
    const base64 = await base64Promise;

    const { data, error } = await supabase.functions.invoke("send-group-media", {
      body: {
        instance_name: instanceName,
        group_id: group.id,
        media_base64: base64,
        media_type: params.mediaType,
        file_name: params.fileName,
        mime_type: params.mimeType,
        caption: params.caption,
        is_ptt: params.isPtt || false,
        quoted_message_id: replyingTo?.id || undefined,
      },
    });
    if (error || !data?.success) {
      throw new Error(data?.error || error?.message || "Falha ao enviar mídia");
    }
    return data;
  }, [instanceName, group.id, replyingTo]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = ""; // permite re-selecionar mesmo arquivo
    if (!file) return;

    // Limite defensivo (Evolution+Storage): 16MB padrao do WhatsApp para midia.
    const MAX = 16 * 1024 * 1024;
    if (file.size > MAX) {
      toast({ title: "Arquivo muito grande", description: "Limite: 16 MB.", variant: "destructive" });
      return;
    }

    let mediaType: "image" | "video" | "audio" | "document" = "document";
    if (file.type.startsWith("image/")) mediaType = "image";
    else if (file.type.startsWith("video/")) mediaType = "video";
    else if (file.type.startsWith("audio/")) mediaType = "audio";

    setSendingFile(true);
    try {
      await sendMediaBlob({
        blob: file,
        mediaType,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        caption: text.trim() || undefined,
      });
      setText("");
      setReplyingTo(null);
    } catch (err: any) {
      toast({ title: "Erro ao enviar arquivo", description: err?.message || "Tente novamente", variant: "destructive" });
    } finally {
      setSendingFile(false);
    }
  };

  // ---- Audio recording (PTT) ----
  const recorder = useOpusRecorder({
    onDataAvailable: async (blob) => {
      setSendingAudio(true);
      try {
        await sendMediaBlob({
          blob,
          mediaType: "audio",
          fileName: "ptt.ogg",
          mimeType: "audio/ogg; codecs=opus",
          isPtt: true,
        });
        setReplyingTo(null);
      } catch (err: any) {
        toast({ title: "Erro ao enviar áudio", description: err?.message || "Tente novamente", variant: "destructive" });
      } finally {
        setSendingAudio(false);
      }
    },
    onError: (err) => {
      toast({ title: "Erro de gravação", description: err.message, variant: "destructive" });
    },
  });

  // Cleanup do gravador ao trocar de grupo / desmontar
  useEffect(() => {
    return () => recorder.cleanup();
  }, [group.id, recorder]);

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Agrupar por dia
  const groupedByDay = useMemo(() => {
    const map = new Map<string, GroupMessage[]>();
    for (const m of messages) {
      const key = m.data_hora.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [messages]);
  const dayKeys = Array.from(groupedByDay.keys());

  // Set rápido para saber se mensagem é match
  const matchIds = useMemo(() => new Set(activeMatches.map((m) => m.id)), [activeMatches]);
  const currentMatchId = activeMatches[searchIndex]?.id;

  // Map JID -> nome amigavel para resolver menções com nome real (acumulado a partir
  // dos remetentes ja vistos). Sem participants list no ContactGroup, esta e a melhor
  // aproximacao — cobre todos os membros que ja escreveram no historico carregado.
  const mentionNameByJid = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of messages) {
      if (m.sender_jid && m.sender_pushname) {
        if (!map.has(m.sender_jid)) map.set(m.sender_jid, m.sender_pushname);
      }
    }
    return map;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <Avatar className="h-10 w-10 flex-shrink-0">
          {group.pictureUrl ? <AvatarImage src={group.pictureUrl} alt={group.subject} /> : null}
          <AvatarFallback className="bg-muted">
            <Users className="h-5 w-5 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{group.subject}</h3>
            {group.isSuperAdmin && (
              <Badge variant="default" className="text-[10px] h-4 px-1.5 bg-amber-500 hover:bg-amber-500/90">Criador</Badge>
            )}
            {group.isAdmin && !group.isSuperAdmin && (
              <Badge variant="default" className="text-[10px] h-4 px-1.5">Admin</Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {group.size} membro{group.size === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          variant={searchOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (!searchOpen) setTimeout(() => document.getElementById("group-search-input")?.focus(), 50);
          }}
          className="h-8 w-8 p-0 flex-shrink-0"
          aria-label="Buscar mensagens"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="border-b bg-muted/30 px-3 py-2 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="group-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar mensagens..."
                className="h-8 pl-8 pr-2 text-sm"
              />
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {trimmedQuery.length < 2
                ? "—"
                : activeMatches.length === 0
                  ? "0"
                  : `${searchIndex + 1}/${activeMatches.length}`}
            </span>
            <Button
              variant="ghost" size="sm"
              onClick={() => setSearchIndex((i) => Math.max(0, i - 1))}
              disabled={activeMatches.length === 0 || searchIndex === 0}
              className="h-8 w-8 p-0"
              aria-label="Resultado anterior"
            >
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => setSearchIndex((i) => Math.min(activeMatches.length - 1, i + 1))}
              disabled={activeMatches.length === 0 || searchIndex >= activeMatches.length - 1}
              className="h-8 w-8 p-0"
              aria-label="Próximo resultado"
            >
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setSearchOpen(false); setSearchQuery(""); setServerMatches(null); }}
              className="h-8 w-8 p-0"
              aria-label="Fechar busca"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* Botão "Buscar em todo o histórico" — aparece quando há query e nenhum match em memória */}
          {trimmedQuery.length >= 2 && memoryMatches.length === 0 && serverMatches === null && (
            <div className="flex items-center justify-center pt-1">
              <Button
                variant="outline" size="sm"
                onClick={runServerSearch}
                disabled={serverSearching}
                className="h-7 text-xs gap-1.5"
              >
                {serverSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                {serverSearching ? "Buscando..." : "Buscar em todo o histórico"}
              </Button>
            </div>
          )}
          {/* Indicador quando server search está ativa */}
          {serverMatches !== null && (
            <p className="text-[10px] text-center text-muted-foreground">
              Resultados do histórico completo · {serverMatches.length} encontrado{serverMatches.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRootRef} className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-2">
          {isLoadingInitial && messages.length === 0 && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {isError && (
            <div className="m-2 p-3 rounded-md border border-destructive/30 bg-destructive/5 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-medium text-destructive">Erro ao carregar mensagens</p>
                <p className="text-muted-foreground mt-1">{error?.message}</p>
              </div>
            </div>
          )}

          {!isLoadingInitial && previousDayAvailable && (
            <div className="flex justify-center pb-2">
              <Button
                variant="outline" size="sm"
                onClick={loadPreviousDay}
                disabled={isLoadingPrevious}
                className="h-8 gap-1.5 text-xs rounded-full"
              >
                {isLoadingPrevious ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />}
                {isLoadingPrevious ? "Carregando..." : `Carregar mensagens de ${formatDayLabel(previousDayAvailable)}`}
              </Button>
            </div>
          )}

          {!isLoadingInitial && !isError && messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-sm">
              Nenhuma mensagem neste grupo ainda. Envie a primeira!
            </div>
          )}

          {dayKeys.map((dayKey) => {
            const dayMsgs = groupedByDay.get(dayKey) || [];
            return (
              <div key={dayKey} className="space-y-1.5">
                <div className="sticky top-0 z-10 flex justify-center pointer-events-none">
                  <span className="pointer-events-auto text-[10.5px] uppercase tracking-wide bg-muted/95 backdrop-blur text-muted-foreground rounded-full px-3 py-0.5 shadow-sm border">
                    {formatDayLabel(dayKey)}
                  </span>
                </div>
                {dayMsgs.map((msg) => (
                  <MessageRow
                    key={msg.id}
                    msg={msg}
                    isMatch={matchIds.has(msg.id)}
                    isCurrentMatch={msg.id === currentMatchId}
                    isHighlighted={msg.id === highlightedMsgId}
                    mentionNameByJid={mentionNameByJid}
                    onClickImage={(url, caption) => setViewingImage({ url, caption })}
                    onReply={(m) => {
                      setReplyingTo(m);
                      inputRef.current?.focus();
                    }}
                    onJumpToQuoted={scrollToMessage}
                    setRef={(el) => {
                      if (el) messageRefs.current.set(msg.id, el);
                      else messageRefs.current.delete(msg.id);
                    }}
                  />
                ))}
              </div>
            );
          })}

          <div ref={scrollEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t bg-background">
        {/* Reply preview (acima do input) */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-l-2 border-primary">
            <Reply className="h-3.5 w-3.5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-primary">
                Respondendo a {replyingTo.direcao === "SAIDA" ? "Você" : (replyingTo.sender_pushname || "Membro")}
              </p>
              <p className="text-[12px] truncate text-muted-foreground">
                {replyingTo.media_type === "image" ? "[Imagem]" :
                 replyingTo.media_type === "video" ? "[Vídeo]" :
                 replyingTo.media_type === "audio" ? "[Áudio]" :
                 replyingTo.media_type === "document" ? "[Documento]" :
                 replyingTo.media_type === "sticker" ? "[Figurinha]" :
                 (replyingTo.corpo_mensagem || "[Mídia]")}
              </p>
            </div>
            <Button
              type="button" variant="ghost" size="icon"
              className="h-7 w-7 flex-shrink-0"
              onClick={() => setReplyingTo(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="p-3 flex items-end gap-2">
          {/* Paperclip — anexar arquivo */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            className="hidden"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingFile || sendingAudio || recorder.isRecording || sending}
            className="h-11 w-11 flex-shrink-0"
            aria-label="Anexar arquivo"
          >
            {sendingFile ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
          </Button>

          {/* Textarea ou indicador de gravacao */}
          {recorder.isRecording ? (
            <div className="flex-1 flex items-center gap-2 bg-destructive/10 rounded-md px-3 py-2.5 min-h-[44px]">
              <div className="w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />
              <span className="text-sm font-medium">Gravando…</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {Math.floor(recorder.recordingTime / 60).toString().padStart(2, "0")}:
                {(recorder.recordingTime % 60).toString().padStart(2, "0")}
              </span>
            </div>
          ) : (
            <Textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Mensagem para "${group.subject}"`}
              className="min-h-[44px] max-h-[120px] resize-none"
              disabled={sending || sendingFile || sendingAudio}
            />
          )}

          {/* Mic / Stop / Send (mutuamente exclusivos como WhatsApp Web) */}
          {recorder.isRecording ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={recorder.stopRecording}
              className="h-11 w-11 flex-shrink-0"
              aria-label="Parar gravação"
            >
              <Square className="h-5 w-5" />
            </Button>
          ) : !text.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={recorder.startRecording}
              disabled={sendingAudio || sendingFile || sending || recorder.isLoading}
              className="h-11 w-11 flex-shrink-0"
              aria-label="Gravar áudio"
            >
              {sendingAudio || recorder.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="h-11 w-11 flex-shrink-0"
              aria-label="Enviar"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground px-3 pb-1.5 -mt-1">
          Enter envia · Shift+Enter quebra linha · Duplo clique numa mensagem para responder
        </p>
      </div>

      {/* Image viewer (lightbox) */}
      <Dialog open={!!viewingImage} onOpenChange={(open) => { if (!open) setViewingImage(null); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-[85vw] max-h-[90vh] p-2 bg-black/90 border-0 flex items-center justify-center">
          <DialogTitle className="sr-only">Imagem</DialogTitle>
          <DialogDescription className="sr-only">{viewingImage?.caption || "Visualização de imagem"}</DialogDescription>
          {viewingImage && (
            <img
              src={viewingImage.url}
              alt={viewingImage.caption || "Imagem"}
              className="max-w-full max-h-[85vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MessageRow — renderiza texto + media (image / audio / video / document)
// ============================================================
interface MessageRowProps {
  msg: GroupMessage;
  isMatch: boolean;
  isCurrentMatch: boolean;
  isHighlighted: boolean;
  mentionNameByJid: Map<string, string>;
  onClickImage: (url: string, caption?: string) => void;
  onReply: (msg: GroupMessage) => void;
  onJumpToQuoted: (msgId: string) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

function MessageRow({
  msg, isMatch, isCurrentMatch, isHighlighted,
  mentionNameByJid, onClickImage, onReply, onJumpToQuoted, setRef,
}: MessageRowProps) {
  const isOut = msg.direcao === "SAIDA";
  const senderLabel = !isOut
    ? (msg.sender_pushname || (msg.sender_jid ? msg.sender_jid.split("@")[0] : "Membro"))
    : null;

  const mediaType = msg.media_type;
  const mediaUrl = msg.media_url;
  const meta: any = msg.media_metadata || {};
  const mentionedJids: string[] | null = Array.isArray(meta?.mentionedJid) ? meta.mentionedJid : null;

  const caption = msg.corpo_mensagem
    .replace(/^\[Imagem\]\s*/, "")
    .replace(/^\[Vídeo\]\s*/, "")
    .replace(/^\[Documento\]\s*/, "")
    .trim();

  // Classes de menção variam conforme bolha (saida/entrada) para contraste.
  const linkClass = isOut
    ? "underline underline-offset-2 hover:opacity-80 break-words"
    : "underline underline-offset-2 hover:opacity-80 break-words text-primary";
  const mentionClass = isOut
    ? "font-semibold underline underline-offset-2 decoration-primary-foreground/60 hover:decoration-primary-foreground"
    : "font-semibold text-primary hover:underline";

  const renderText = (text: string) =>
    parseMessageContent(text, {
      mentionNameByJid,
      mentionedJids,
      classes: { link: linkClass, mention: mentionClass },
    });

  // Determina se o audio e PTT (voice note Opus em OGG) — formato padrao do WhatsApp.
  const audioMime = (meta?.mimetype && typeof meta.mimetype === "string")
    ? String(meta.mimetype).split(";")[0].trim()
    : "audio/ogg";

  // Status icons (so para SAIDA, mesmo padrao do chat privado).
  const renderStatusIcon = () => {
    if (!isOut) return null;
    const s = msg.status_entrega;
    if (s === "READ") return <CheckCheck className="h-3 w-3 text-sky-300" aria-label="Lida" />;
    if (s === "DELIVERED") return <CheckCheck className="h-3 w-3 opacity-80" aria-label="Entregue" />;
    if (s === "SENT") return <Check className="h-3 w-3 opacity-80" aria-label="Enviada" />;
    return <Clock className="h-3 w-3 opacity-60 animate-pulse" aria-label="Pendente" />;
  };

  // Quoted (resposta a outra msg): renderiza bloco clicavel acima do conteudo.
  const quoted = msg.quoted_message;
  const quotedBody = quoted?.corpo_mensagem || (
    quoted?.media_type === "image" ? "[Imagem]" :
    quoted?.media_type === "video" ? "[Vídeo]" :
    quoted?.media_type === "audio" ? "[Áudio]" :
    quoted?.media_type === "document" ? "[Documento]" :
    quoted?.media_type === "sticker" ? "[Figurinha]" :
    "[Mensagem]"
  );
  const quotedSender = quoted?.direcao === "SAIDA" ? "Você" : (quoted?.sender_pushname || "Membro");

  const handleDoubleClick = () => onReply(msg);
  const handleQuotedClick = () => {
    if (msg.quoted_message_id) onJumpToQuoted(msg.quoted_message_id);
  };

  // Sticker: renderiza como imagem WebP (w-32 h-32). Se tiver mediaUrl, ignora bolha
  // padrao para nao adicionar background. WhatsApp Web mostra sticker "flutuando".
  if (mediaType === "sticker" && mediaUrl) {
    return (
      <div
        ref={setRef}
        onDoubleClick={handleDoubleClick}
        className={cn("flex w-full group cursor-pointer", isOut ? "justify-end" : "justify-start")}
      >
        <div className={cn(
          "max-w-[160px] rounded-lg p-1 transition-all",
          isHighlighted && "ring-2 ring-amber-500",
          isMatch && !isCurrentMatch && "ring-1 ring-amber-400/70",
          isCurrentMatch && "ring-2 ring-amber-500"
        )}>
          {senderLabel && (
            <p className={cn("text-[10.5px] font-semibold opacity-80 mb-0.5 px-1", isOut ? "text-right" : "text-left")}>
              {senderLabel}
            </p>
          )}
          <img
            src={mediaUrl}
            alt="Figurinha"
            className="w-32 h-32 object-contain"
            loading="lazy"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <div className={cn("flex items-center gap-1 mt-0.5 px-1", isOut ? "justify-end" : "justify-start")}>
            <span className="text-[10px] text-muted-foreground">{formatTime(msg.data_hora)}</span>
            {renderStatusIcon()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setRef}
      onDoubleClick={handleDoubleClick}
      className={cn("flex w-full group cursor-pointer", isOut ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[78%] rounded-lg px-2 py-1.5 text-sm shadow-sm transition-all relative",
          isOut ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm",
          isMatch && "ring-1 ring-amber-400/70",
          isCurrentMatch && "ring-2 ring-amber-500 shadow-lg",
          isHighlighted && "ring-2 ring-amber-500 shadow-lg",
        )}
      >
        {/* Botao Responder (aparece no hover) */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReply(msg); }}
          className={cn(
            "absolute top-1 z-10 p-1 rounded-full bg-background/90 backdrop-blur opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border",
            isOut ? "left-1" : "right-1"
          )}
          aria-label="Responder"
        >
          <Reply className="h-3 w-3 text-foreground" />
        </button>

        {senderLabel && (
          <p className="text-[10.5px] font-semibold opacity-80 mb-0.5 px-1">{senderLabel}</p>
        )}

        {/* Quoted (resposta) */}
        {quoted && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleQuotedClick(); }}
            disabled={!msg.quoted_message_id}
            className={cn(
              "block w-full text-left mb-1 px-2 py-1 rounded border-l-2 text-[11.5px] transition-colors",
              isOut
                ? "bg-primary-foreground/10 border-primary-foreground/60 hover:bg-primary-foreground/20"
                : "bg-muted/60 border-primary/60 hover:bg-muted",
              !msg.quoted_message_id && "cursor-default opacity-80"
            )}
          >
            <p className={cn("font-semibold truncate", isOut ? "opacity-90" : "text-primary")}>
              {quotedSender}
            </p>
            <p className="truncate opacity-80">{quotedBody}</p>
          </button>
        )}

        {/* Mídia */}
        {mediaType === "image" && mediaUrl && (
          <button
            type="button"
            onClick={() => onClickImage(mediaUrl, caption)}
            className="block rounded overflow-hidden mb-1 max-w-[280px]"
          >
            <img
              src={mediaUrl}
              alt={caption || "Imagem"}
              className="block w-full h-auto rounded"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </button>
        )}

        {mediaType === "audio" && mediaUrl && (
          <div className="mb-1">
            <audio
              controls
              preload="metadata"
              className="w-full max-w-[260px] block"
            >
              {/* WhatsApp envia OGG/Opus (PTT). Alguns navegadores so reconhecem se o
                  Content-Type vier correto OU via <source type=...>. */}
              <source src={mediaUrl} type={audioMime} />
              <source src={mediaUrl} type="audio/ogg; codecs=opus" />
              <source src={mediaUrl} type="audio/mpeg" />
            </audio>
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex items-center gap-1 text-[10.5px] mt-0.5 px-1 underline underline-offset-2 hover:opacity-80",
                isOut ? "opacity-80" : "text-muted-foreground"
              )}
            >
              <Download className="h-3 w-3" />
              Baixar áudio
            </a>
          </div>
        )}

        {mediaType === "video" && mediaUrl && (
          <video
            controls
            preload="metadata"
            src={mediaUrl}
            className="block rounded w-full max-w-[280px] mb-1 max-h-[280px]"
          />
        )}

        {mediaType === "document" && mediaUrl && (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            download={meta?.fileName || undefined}
            className={cn(
              "flex items-center gap-2 mb-1 px-2 py-1.5 rounded border text-[12px]",
              isOut ? "border-primary-foreground/30 bg-primary-foreground/5 hover:bg-primary-foreground/10"
                    : "border-border bg-muted/40 hover:bg-muted"
            )}
          >
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">{meta?.fileName || "Documento"}</span>
            <Download className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
            {meta?.fileLength && (
              <span className="text-[10px] opacity-60">{formatBytes(Number(meta.fileLength))}</span>
            )}
          </a>
        )}

        {/* Texto / caption — links clicaveis + mencoes destacadas */}
        {caption ? (
          <p className="whitespace-pre-wrap break-words leading-snug px-1">{renderText(caption)}</p>
        ) : !mediaType && msg.corpo_mensagem ? (
          <p className="whitespace-pre-wrap break-words leading-snug px-1">{renderText(msg.corpo_mensagem)}</p>
        ) : null}

        <div className="flex items-center gap-1 justify-end mt-0.5 px-1">
          <span className={cn("text-[10px]", isOut ? "opacity-70" : "text-muted-foreground")}>
            {formatTime(msg.data_hora)}
          </span>
          {renderStatusIcon()}
        </div>
      </div>
    </div>
  );
}

export const GroupConversationView = memo(GroupConversationViewImpl);
