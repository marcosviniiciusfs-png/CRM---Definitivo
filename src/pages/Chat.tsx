import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useTheme } from "@/contexts/ThemeContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Lead, Message, MessageReaction, PinnedMessage } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Search, Tag, Filter, Check, Pin, PinOff, Loader2, ArrowLeft, Radio, ArrowRightLeft } from "lucide-react";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useOpusRecorder } from "@/hooks/useOpusRecorder";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadTagsManager } from "@/components/LeadTagsManager";
import { ManageTagsDialog } from "@/components/ManageTagsDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// New optimized components
import { ChatHeader, ChatInput, ChatLeadItem, MessageBubble, PinnedMessagesBar, PresenceInfo, GroupListPanel, GroupConversationView } from "@/components/chat";
import type { ContactGroup } from "@/hooks/useContactGroups";
import { BroadcastPanel } from "@/components/chat/BroadcastPanel";
import { ChannelSelector } from "@/components/ChannelSelector";
import chatGif from "@/assets/chat.gif";
import { useChatPresence } from "@/hooks/useChatPresence";
import { useAssignedChannels, isLeadVisibleByChannel } from "@/hooks/useAssignedChannels";
import { useLeadMemberships, type LeadMembershipCard } from "@/hooks/useLeadMemberships";
import { TransferLeadDialog, TransferDivider } from "@/components/chat";

const Chat = () => {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, organizationId, isReady } = useOrganizationReady();
  const { theme } = useTheme();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Core state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  // Membership selecionada (par lead × canal). Quando setado em conjunto com
  // selectedLead, define qual canal a UI esta usando para enviar/ler msgs.
  const [selectedMembership, setSelectedMembership] = useState<LeadMembershipCard | null>(null);
  const { cards: membershipCards, loading: membershipsLoading, reload: reloadMemberships } = useLeadMemberships();

  // TransferLeadDialog: estado para abrir o modal de transferencia da
  // membership clicada com botao direito.
  const [transferDialogState, setTransferDialogState] = useState<{
    open: boolean;
    leadId: string | null;
    leadName: string;
    channelId: string | null;
  }>({ open: false, leadId: null, leadName: '', channelId: null });

  // Read-only history (msgs do canal de origem antes do transferred_at)
  // quando a membership selecionada eh 'transferred'.
  const [preTransferMessages, setPreTransferMessages] = useState<Message[]>([]);

  const openTransferDialog = (card: LeadMembershipCard) => {
    setTransferDialogState({
      open: true,
      leadId: card.lead_id,
      leadName: card.nome_lead,
      channelId: card.whatsapp_instance_id,
    });
  };
  const [lockedLeadId, setLockedLeadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchExpanded, setMessageSearchExpanded] = useState(false);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(0);

  // UI state
  const [viewingAvatar, setViewingAvatar] = useState<{ url: string; name: string } | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [leadTagsOpen, setLeadTagsOpen] = useState(false);
  const [filterOption, setFilterOption] = useState<"alphabetical" | "created" | "last_interaction" | "none">("none");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  // Grupo selecionado na aba "Grupos" do painel esquerdo. Quando definido,
  // o painel direito mostra a conversa do grupo em vez do lead selecionado.
  const [selectedGroup, setSelectedGroup] = useState<ContactGroup | null>(null);
  const [removeTagsDialogOpen, setRemoveTagsDialogOpen] = useState(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);

  // Tags state
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [leadTagsMap, setLeadTagsMap] = useState<Map<string, string[]>>(new Map());
  const [leadToRemoveTags, setLeadToRemoveTags] = useState<string | null>(null);
  const [selectedTagsToRemove, setSelectedTagsToRemove] = useState<string[]>([]);

  // Pinned state
  const [pinnedLeads, setPinnedLeads] = useState<string[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Set<string>>(new Set());

  // Channel state
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const channelsRef = useRef<any[]>([]);

  // Reply state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // Delete message state
  const [messageToDelete, setMessageToDelete] = useState<Message | null>(null);

  // Presence & reactions state
  const [presenceStatus, setPresenceStatus] = useState<Map<string, PresenceInfo>>(new Map());
  const [messageReactions, setMessageReactions] = useState<Map<string, MessageReaction[]>>(new Map());
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState<string | null>(null);
  const [dropdownOpenStates, setDropdownOpenStates] = useState<Map<string, boolean>>(new Map());

  // User profile
  const [currentUserName, setCurrentUserName] = useState<string>("Atendente");
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(null);

  // Responsibles map for admin/owner view
  const [responsiblesMap, setResponsiblesMap] = useState<Map<string, { full_name: string; avatar_url: string | null }>>(new Map());

  // File & audio state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingFile, setSendingFile] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);

  // Notification
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  // Messages pagination
  const MESSAGE_PAGE_SIZE = 50;
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const oldestMessageTimeRef = useRef<string | null>(null);
  const isLoadingMoreRef = useRef(false); // Prevent auto-scroll when prepending older msgs

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchResultRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const messageInputRef = useRef<HTMLTextAreaElement>(null);


  // Custom hooks
  const { refreshPresenceForLead, isLoadingPresence } = useChatPresence({
    userId: user?.id,
    selectedLead,
    presenceStatus,
    setPresenceStatus,
  });

  const opusRecorder = useOpusRecorder({
    onDataAvailable: (blob: Blob) => {
      setAudioBlob(blob);
      sendAudio(blob);
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao gravar áudio", description: error.message, variant: "destructive" });
    },
  });

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Ref para rastrear se o componente está montado
  const isMountedRef = useRef(true);

  // Stale-while-revalidate: only the very first load shows the leads spinner.
  // Subsequent refetches (Realtime invalidation, reconnect) keep the rendered
  // list in place to avoid a full-screen flash on tab focus.
  const hasInitialLoadCompletedRef = useRef(false);

  // Mantem orgId acessivel dentro de callbacks Realtime sem invalidar deps.
  const orgIdRef = useRef<string | null>(null);

  // Mantem selectedLead acessivel dentro de callbacks sem reinscrever channel.
  const selectedLeadRef = useRef<Lead | null>(null);

  // Snapshot de leads no callback do Realtime para detectar mudanca real
  // de last_message_at (nao depender de prev no setLeads).
  const leadsBeforeUpdateRef = useRef<Map<string, Lead>>(new Map());

  // Notificacao sonora — ref para acessar de callbacks sem reinscrever.
  const notificationSoundEnabledRef = useRef<boolean>(true);
  // Audio so pode ser tocado apos a primeira interacao do usuario com a pagina
  // (politica de autoplay dos navegadores). Esta ref guarda se ja destravamos.
  const audioUnlockedRef = useRef<boolean>(false);

  // Helper to remove ALL existing channels matching a pattern
  const removeExistingChannel = useCallback(async (channelName: string) => {
    const channels = supabase.getChannels();
    const matchingChannels = channels.filter(ch =>
      ch.topic === `realtime:${channelName}` || ch.topic === channelName
    );
    if (matchingChannels.length > 0) {
      await Promise.all(matchingChannels.map(ch => supabase.removeChannel(ch)));
    }
  }, []);

  // Cleanup orphan channels periodically
  useEffect(() => {
    const cleanupOrphanChannels = () => {
      const channels = supabase.getChannels();
      const chatLeadChannels = channels.filter(ch =>
        ch.topic.includes('chat-lead-') || ch.topic.includes('realtime:chat-lead-')
      );

      // Se tiver mais de 2 canais de lead, limpar os extras (mantém apenas o atual)
      if (chatLeadChannels.length > 2) {
        const channelsToRemove = chatLeadChannels.slice(2);
        channelsToRemove.forEach(ch => supabase.removeChannel(ch));
      }
    };

    const interval = setInterval(cleanupOrphanChannels, 60000);
    return () => clearInterval(interval);
  }, []);

  // Reset mounted ref on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Sync selectedLead ref to keep callbacks current.
  useEffect(() => {
    selectedLeadRef.current = selectedLead;
  }, [selectedLead]);

  // Deduplicacao membership-cards -> leads[] (1 lead por id, agregando
  // last_message_at maximo entre canais). Mantem o estado leads compativel
  // com o restante do componente, que ainda referencia o tipo Lead.
  const leadsFromMemberships = useMemo<any[]>(() => {
    const byId = new Map<string, any>();
    for (const c of membershipCards) {
      const existing = byId.get(c.lead_id);
      if (!existing) {
        byId.set(c.lead_id, {
          id: c.lead_id,
          nome_lead: c.nome_lead,
          telefone_lead: c.telefone_lead,
          email: c.email,
          stage: c.stage,
          avatar_url: c.avatar_url,
          is_online: c.is_online,
          last_seen: c.last_seen,
          last_message_at: c.last_message_at,
          source: c.source_lead,
          responsavel: c.responsavel,
          responsavel_user_id: c.responsavel_user_id,
          created_at: c.lead_created_at,
          updated_at: c.lead_updated_at,
          organization_id: c.organization_id,
          whatsapp_instance_id: c.lead_whatsapp_instance_id,
        });
      } else {
        const a = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
        const b = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        if (b > a) existing.last_message_at = c.last_message_at;
      }
    }
    return Array.from(byId.values());
  }, [membershipCards]);

  // Sincroniza leads state com membership-derived leads.
  useEffect(() => {
    setLeads(leadsFromMemberships as Lead[]);
  }, [leadsFromMemberships]);

  // Presence map derivado dos leads (cada lead unico).
  useEffect(() => {
    const presenceMap = new Map<string, PresenceInfo>();
    leadsFromMemberships.forEach((lead: any) => {
      if (lead.is_online !== null || lead.last_seen) {
        presenceMap.set(lead.id, { isOnline: !!lead.is_online, lastSeen: lead.last_seen || undefined });
      }
    });
    setPresenceStatus(presenceMap);
  }, [leadsFromMemberships]);

  // Carrega tag assignments + responsibles map quando os leads mudam.
  // Substitui o bloco antigo que rodava dentro de loadAllChatData.
  useEffect(() => {
    if (!organizationId) return;
    if (leadsFromMemberships.length === 0) return;

    let cancelled = false;
    const load = async () => {
      const responsibleUserIds = [...new Set(
        leadsFromMemberships
          .map((l: any) => l.responsavel_user_id)
          .filter((id: any): id is string => !!id)
      )];

      const [tagAssignmentsResult, responsiblesResult, rpcChatResult] = await Promise.all([
        supabase
          .from("lead_tag_assignments")
          .select("lead_id, tag_id")
          .in("lead_id", leadsFromMemberships.map((l: any) => l.id)),
        responsibleUserIds.length > 0
          ? supabase
            .from("profiles")
            .select("user_id, full_name, avatar_url")
            .in("user_id", responsibleUserIds)
          : Promise.resolve({ data: [] }),
        supabase.rpc("get_organization_members_masked"),
      ]);

      if (cancelled) return;

      const rpcChatNamesMap: Record<string, string | null> = {};
      (rpcChatResult.data || []).forEach((m: any) => { if (m.user_id) rpcChatNamesMap[m.user_id] = m.full_name; });

      const newTagMap = new Map<string, string[]>();
      tagAssignmentsResult.data?.forEach((assignment: any) => {
        const current = newTagMap.get(assignment.lead_id) || [];
        newTagMap.set(assignment.lead_id, [...current, assignment.tag_id]);
      });
      setLeadTagsMap(newTagMap);

      const newResponsiblesMap = new Map<string, { full_name: string; avatar_url: string | null }>();
      responsiblesResult.data?.forEach((profile: any) => {
        if (profile.user_id) {
          newResponsiblesMap.set(profile.user_id, {
            full_name: profile.full_name || rpcChatNamesMap[profile.user_id] || "Sem nome",
            avatar_url: profile.avatar_url,
          });
        }
      });
      (rpcChatResult.data || []).forEach((m: any) => {
        if (m.user_id && !newResponsiblesMap.has(m.user_id) && responsibleUserIds.includes(m.user_id)) {
          newResponsiblesMap.set(m.user_id, { full_name: m.full_name || "Sem nome", avatar_url: null });
        }
      });
      setResponsiblesMap(newResponsiblesMap);
    };

    load();
    return () => { cancelled = true; };
  }, [leadsFromMemberships, organizationId]);

  // Quando seleciona um lead, limpa selecao de grupo (e vice-versa via onSelectGroup).
  useEffect(() => {
    if (selectedLead) setSelectedGroup(null);
  }, [selectedLead?.id]);

  // Auto-seleciona lead via query param (?lead_id=<uuid>). Usado pelo
  // balao "abrir chat" no Pipeline. Roda uma vez se o param mudar.
  useEffect(() => {
    const leadIdParam = searchParams.get("lead_id");
    if (!leadIdParam) return;

    const found = leads.find((l) => l.id === leadIdParam);
    if (found) {
      setSelectedLead(found);
    } else {
      // Fetch direto — RLS valida acesso e retorna null se nao autorizado.
      (async () => {
        const { data } = await supabase
          .from("leads")
          .select("*")
          .eq("id", leadIdParam)
          .maybeSingle();
        if (data) {
          setSelectedLead(data as any);
        } else {
          toast({
            title: "Sem acesso a esta conversa",
            description: "Voce nao foi atribuido ao canal deste lead.",
            variant: "destructive",
          });
        }
      })();
    }

    // Limpa o param da URL.
    setSearchParams(
      (params) => {
        params.delete("lead_id");
        return params;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("lead_id"), leads]);

  // Mantem leadsBeforeUpdateRef sincronizado para detectar last_message_at avancando.
  useEffect(() => {
    const map = new Map<string, Lead>();
    leads.forEach((l) => map.set(l.id, l));
    leadsBeforeUpdateRef.current = map;
  }, [leads]);

  // Mantem notificationSoundEnabledRef sincronizado.
  useEffect(() => {
    notificationSoundEnabledRef.current = notificationSoundEnabled;
  }, [notificationSoundEnabled]);

  // Destrava o audio na primeira interacao do usuario.
  // Browsers (Chrome, Safari) bloqueiam audio.play() ate que haja um gesto
  // do usuario na pagina. Sem destravar, .play() rejeita silenciosamente
  // (foi para o catch) e a notificacao aparecia muda. Aqui pre-aquecemos
  // o elemento Audio com um play+pause na primeira pointerdown/keydown.
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const audio = notificationAudioRef.current;
      if (!audio) return;
      const originalVolume = audio.volume;
      audio.volume = 0;
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = originalVolume;
        audioUnlockedRef.current = true;
      }).catch(() => {
        // Se ainda nao tem gesto (improvavel aqui), tenta de novo na proxima.
      });
    };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return;
      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .single();

      if (profileData?.full_name) {
        setCurrentUserName(profileData.full_name);
        setUserProfile(profileData);
      }
    };

    loadUserProfile();
    // Profile changes are handled in the global channel below
  }, [user?.id]);

  // React Query para persistência da lista de leads do chat.
  // organizationId entra na chave para que multi-org users (que tem 2+ rows
  // em organization_members) recarreguem ao OrganizationContext resolver a
  // org primaria. Sem isso, queryFn dispara antes de organizationId estar
  // pronto e cai no early-return.
  const chatLeadsQueryKey = ['chat-leads', user?.id, organizationId];

  const { data: chatDataLoaded } = useQuery({
    queryKey: chatLeadsQueryKey,
    queryFn: async () => {
      await loadAllChatData();
      return { loaded: true };
    },
    enabled: !!user?.id && !!organizationId,
    staleTime: 5 * 60 * 1000,
    // gcTime: 0 ensures cache is cleared when component unmounts.
    // Without this, React Query keeps {loaded:true} cached while local state
    // (leads[]) resets on unmount → blank list on re-navigation.
    gcTime: 0,
    refetchOnWindowFocus: false,
    // Some browsers fire reconnect events on tab focus. Without this, the
    // entire chat session reloads (full "Carregando leads..." flash) every
    // time the user alt-tabs away and back. Realtime keeps the list fresh.
    refetchOnReconnect: false,
  });

  // CONSOLIDATED: Global realtime channel for leads, tags, tag assignments, and profile
  useEffect(() => {
    if (!user?.id) return;

    notificationAudioRef.current = new Audio(`/notification.mp3?v=${Date.now()}`);

    const savedPinnedLeads = localStorage.getItem("pinnedLeads");
    if (savedPinnedLeads) {
      try { setPinnedLeads(JSON.parse(savedPinnedLeads)); } catch { }
    }

    if (location.state?.selectedLead) {
      setSelectedLead(location.state.selectedLead);
    }

    let reloadTimeout: NodeJS.Timeout;
    const globalChannelName = `chat-global-${user?.id}`;
    let globalChannel: ReturnType<typeof supabase.channel> | null = null;

    const setupGlobalChannel = async () => {
      // Remove existing channel before creating new one
      await removeExistingChannel(globalChannelName);

      if (!isMountedRef.current) return;

      // Single consolidated channel for all global changes
      globalChannel = supabase
        .channel(globalChannelName)
        // Profile changes
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `user_id=eq.${user?.id}` }, (payload) => {
          if (payload.new?.full_name) setCurrentUserName(payload.new.full_name);
        })
        // Leads changes
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, (payload) => {
          const updatedLead = payload.new as Lead;
          // Filter by org: Realtime stream is global and o backend ainda nao filtra
          // por organization_id em UPDATEs.
          if (orgIdRef.current && updatedLead.organization_id !== orgIdRef.current) return;
          setLeads((prev) => {
            const idx = prev.findIndex((l) => l.id === updatedLead.id);
            // Lead nao estava na lista (limit 300 ou criado depois do load):
            // adicionar no topo para nao "desaparecer" mensagens novas.
            if (idx === -1) return [updatedLead, ...prev];
            // Merge: REPLICA IDENTITY DEFAULT pode mandar colunas como NULL quando
            // nao foram alteradas. Preservamos whatsapp_instance_id antigo nesse caso.
            const merged = {
              ...prev[idx],
              ...updatedLead,
              whatsapp_instance_id: updatedLead.whatsapp_instance_id ?? prev[idx].whatsapp_instance_id,
            };
            return [...prev.slice(0, idx), merged, ...prev.slice(idx + 1)];
          });
          setSelectedLead((prev) => (prev?.id === updatedLead.id ? { ...prev, ...updatedLead, whatsapp_instance_id: updatedLead.whatsapp_instance_id ?? prev.whatsapp_instance_id } : prev));
          if (updatedLead.is_online !== null || updatedLead.last_seen) {
            setPresenceStatus((prev) => new Map(prev).set(updatedLead.id, { isOnline: !!updatedLead.is_online, lastSeen: updatedLead.last_seen || undefined }));
          }
          // Disparar notificacao ao detectar mensagem nova (last_message_at avancou).
          // Funciona como fallback caso o Realtime de mensagens_chat falhe — garante
          // alerta sonoro mesmo quando o lead nao esta selecionado.
          const prevLead = leadsBeforeUpdateRef.current.get(updatedLead.id);
          const newTs = updatedLead.last_message_at;
          const oldTs = prevLead?.last_message_at;
          const advanced = newTs && (!oldTs || new Date(newTs) > new Date(oldTs));
          if (advanced) {
            const isCurrentLead = selectedLeadRef.current?.id === updatedLead.id;
            // Recarrega mensagens se for o lead aberto.
            if (isCurrentLead) {
              loadMessages(updatedLead.id);
            }
            // Toca som de notificacao se permitido.
            if (notificationSoundEnabledRef.current && notificationAudioRef.current) {
              const a = notificationAudioRef.current;
              a.currentTime = 0;
              a.play().catch((err) => console.warn('🔇 notification audio.play() rejeitado:', err));
            }
          }
          // Atualiza snapshot para a proxima comparacao.
          leadsBeforeUpdateRef.current.set(updatedLead.id, updatedLead);
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
          clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(() => queryClient.invalidateQueries({ queryKey: chatLeadsQueryKey }), 500);
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "leads" }, () => {
          clearTimeout(reloadTimeout);
          reloadTimeout = setTimeout(() => queryClient.invalidateQueries({ queryKey: chatLeadsQueryKey }), 500);
        })
        // Tags changes
        .on("postgres_changes", { event: "*", schema: "public", table: "lead_tags" }, () => loadAvailableTags())
        // Tag assignments changes
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_tag_assignments" }, (payload) => {
          const assignment = payload.new as { lead_id: string; tag_id: string };
          setLeadTagsMap((prev) => {
            const newMap = new Map(prev);
            const currentTags = newMap.get(assignment.lead_id) || [];
            if (!currentTags.includes(assignment.tag_id)) {
              newMap.set(assignment.lead_id, [...currentTags, assignment.tag_id]);
            }
            return newMap;
          });
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "lead_tag_assignments" }, (payload) => {
          const assignment = payload.old as { lead_id: string; tag_id: string };
          setLeadTagsMap((prev) => {
            const newMap = new Map(prev);
            const currentTags = newMap.get(assignment.lead_id) || [];
            newMap.set(assignment.lead_id, currentTags.filter((tagId) => tagId !== assignment.tag_id));
            return newMap;
          });
        })
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`⚠️ Realtime channel ${globalChannelName} status: ${status}`, err);
          } else if (status === 'SUBSCRIBED') {
            console.log(`✅ Realtime channel ${globalChannelName} SUBSCRIBED`);
          }
        });
    };

    setupGlobalChannel();

    // Polling defensivo: a cada 5s, invalida a query para refetchar leads.
    // Garante que mensagens chegam ate em casos de Realtime falhar (CHANNEL_ERROR
    // silencioso, RLS bloqueando stream, throttle do navegador em background).
    // Intervalo curto porque Realtime tem se mostrado nao-confiavel — usuario
    // espera ver leads novos quase imediatamente.
    // O loadAllChatData usa stale-while-revalidate, entao o refetch e silencioso
    // (sem flicker de "Carregando leads...").
    const pollingInterval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: chatLeadsQueryKey });
    }, 5000);

    return () => {
      clearTimeout(reloadTimeout);
      clearInterval(pollingInterval);
      if (globalChannel) {
        supabase.removeChannel(globalChannel);
      }
    };
    // CRITICAL: depend ONLY on user?.id. Including volatile values like
    // `permissions.loading`, `permissions.canViewAllLeads`, `userProfile?.full_name`
    // or `location.state` caused the channel to be torn down and recreated
    // every time those references changed (which can happen when the tab
    // regains focus and contexts re-render), making the user perceive a
    // "session reload" on every alt-tab. The Realtime subscription itself
    // does not need to react to those values — it just streams DB changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // CONSOLIDATED: Lead-specific realtime channel for messages, reactions, and pinned messages
  // With debounce to prevent rapid channel creation when switching leads
  useEffect(() => {
    if (!selectedLead) return;

    let leadChannel: ReturnType<typeof supabase.channel> | null = null;
    const leadChannelName = `chat-lead-${selectedLead.id}`;

    // Debounce: wait 200ms before creating channels to prevent rapid creation on lead switch
    const debounceTimeout = setTimeout(async () => {
      // Remove ALL existing lead channels first
      const allChannels = supabase.getChannels();
      const leadChannelsToRemove = allChannels.filter(ch =>
        ch.topic.includes('chat-lead-') || ch.topic.includes('realtime:chat-lead-')
      );
      await Promise.all(leadChannelsToRemove.map(ch => supabase.removeChannel(ch)));

      if (!isMountedRef.current) return;

      loadMessages(selectedLead.id);

      // Single consolidated channel for all lead-specific changes
      leadChannel = supabase
        .channel(leadChannelName)
        // Messages INSERT
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens_chat", filter: `id_lead=eq.${selectedLead.id}` }, (payload) => {
          const newMessage = payload.new as Message & { whatsapp_instance_id?: string | null };
          // Dropa msgs de outro canal — selectedMembership define o filtro.
          // NULL passa (msgs legadas / fallback).
          const currentChannel = selectedMembership?.whatsapp_instance_id;
          if (currentChannel && newMessage.whatsapp_instance_id && newMessage.whatsapp_instance_id !== currentChannel) {
            return;
          }
          if (newMessage.direcao === "ENTRADA" && notificationSoundEnabled) {
            notificationAudioRef.current?.play().catch(() => { });
          }
          setMessages((prev) => {
            if (newMessage.evolution_message_id) {
              const optimisticIndex = prev.findIndex((msg) => msg.evolution_message_id === newMessage.evolution_message_id && msg.isOptimistic);
              if (optimisticIndex !== -1) {
                const updated = [...prev];
                updated[optimisticIndex] = { ...prev[optimisticIndex], ...newMessage, media_url: newMessage.media_url || prev[optimisticIndex].media_url, isOptimistic: false, sendError: false };
                return updated;
              }
              if (prev.some((msg) => msg.evolution_message_id === newMessage.evolution_message_id && !msg.isOptimistic)) return prev;
            }
            if (prev.some((msg) => msg.id === newMessage.id)) return prev;
            return [...prev, newMessage];
          });
        })
        // Messages UPDATE
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mensagens_chat", filter: `id_lead=eq.${selectedLead.id}` }, (payload) => {
          const updatedMessage = payload.new as Message & { whatsapp_instance_id?: string | null };
          const currentChannel = selectedMembership?.whatsapp_instance_id;
          if (currentChannel && updatedMessage.whatsapp_instance_id && updatedMessage.whatsapp_instance_id !== currentChannel) {
            return;
          }
          setMessages((prev) => prev.map((msg) => (msg.id === updatedMessage.id ? { ...msg, ...updatedMessage, media_url: updatedMessage.media_url || msg.media_url } : msg)));
        })
        // Reactions INSERT
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reactions" }, (payload) => {
          const newReaction = payload.new as MessageReaction;
          setMessageReactions((prev) => {
            const existing = prev.get(newReaction.message_id) || [];
            if (existing.some((r) => r.id === newReaction.id)) return prev;
            return new Map(prev).set(newReaction.message_id, [...existing, newReaction]);
          });
        })
        // Reactions DELETE
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "message_reactions" }, (payload) => {
          const deletedReaction = payload.old as MessageReaction;
          setMessageReactions((prev) => {
            const existing = prev.get(deletedReaction.message_id) || [];
            const filtered = existing.filter((r) => r.id !== deletedReaction.id);
            const updated = new Map(prev);
            if (filtered.length === 0) updated.delete(deletedReaction.message_id);
            else updated.set(deletedReaction.message_id, filtered);
            return updated;
          });
        })
        // Pinned messages INSERT
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "pinned_messages", filter: `lead_id=eq.${selectedLead.id}` }, (payload) => {
          setPinnedMessages((prev) => new Set([...prev, (payload.new as PinnedMessage).message_id]));
        })
        // Pinned messages DELETE
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "pinned_messages", filter: `lead_id=eq.${selectedLead.id}` }, (payload) => {
          setPinnedMessages((prev) => {
            const newSet = new Set(prev);
            newSet.delete((payload.old as PinnedMessage).message_id);
            return newSet;
          });
        })
        .subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn(`⚠️ Lead channel ${leadChannelName} status: ${status}`, err);
          } else if (status === 'SUBSCRIBED') {
            console.log(`✅ Realtime channel ${leadChannelName} SUBSCRIBED`);
          }
        });
    }, 200);

    // Polling incremental de mensagens — fallback para quando o Realtime
    // postgres_changes em mensagens_chat nao entrega (RLS bloqueando stream,
    // throttle do navegador, etc). A cada 4s, busca mensagens com
    // data_hora > ultima conhecida e adiciona ao state com deduplicacao.
    // Nao usa setLoading, entao roda em background sem flicker.
    const messagePollingInterval = setInterval(async () => {
      const leadId = selectedLeadRef.current?.id;
      if (!leadId || !isMountedRef.current) return;

      // Determina timestamp da ultima mensagem ja conhecida.
      let lastTs: string | null = null;
      setMessages((prev) => {
        if (prev.length > 0) {
          const ordered = [...prev].sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());
          lastTs = ordered[0]?.data_hora || null;
        }
        return prev; // nao muda state aqui
      });

      try {
        // Fetch 1: mensagens novas (data_hora > ultima conhecida).
        let q = supabase
          .from("mensagens_chat")
          .select("*, quoted:quoted_message_id(id, corpo_mensagem, direcao, media_type)")
          .eq("id_lead", leadId)
          .order("data_hora", { ascending: true })
          .limit(50);
        if (lastTs) q = q.gt("data_hora", lastTs);

        const { data, error } = await q;
        const newMessages = !error && data ? parseMessages(data) : [];

        // Fetch 2: ultimas 20 mensagens do lead (qualquer data) para sincronizar
        // mudancas em campos como status_entrega (SENT -> DELIVERED -> READ) e
        // media_url, que NAO mudam data_hora e nao chegam pelo Realtime quando
        // este esta nao-confiavel. Sem isso, o status do envio (incluindo midias)
        // ficava congelado em SENT ate o usuario recarregar a pagina.
        const { data: recentData } = await supabase
          .from("mensagens_chat")
          .select("*")
          .eq("id_lead", leadId)
          .order("data_hora", { ascending: false })
          .limit(20);
        const recentMessages = recentData || [];

        let hadNewIncoming = false;
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const existingEvIds = new Set(prev.filter((m) => m.evolution_message_id).map((m) => m.evolution_message_id));

          // 1) Aplica updates em mensagens ja presentes (status_entrega, media_url, etc).
          const recentById = new Map<string, any>();
          for (const r of recentMessages) recentById.set(r.id, r);
          let mutated = false;
          const merged = prev.map((m) => {
            const fresh = recentById.get(m.id);
            if (!fresh) return m;
            const statusChanged = fresh.status_entrega !== m.status_entrega;
            const mediaUrlChanged = fresh.media_url && fresh.media_url !== m.media_url;
            if (!statusChanged && !mediaUrlChanged && fresh.updated_at === (m as any).updated_at) {
              return m;
            }
            mutated = true;
            return {
              ...m,
              status_entrega: fresh.status_entrega ?? m.status_entrega,
              media_url: fresh.media_url || m.media_url,
              media_metadata: fresh.media_metadata ?? m.media_metadata,
            };
          });

          // 2) Adiciona mensagens novas que nao estavam em prev.
          const fresh = newMessages.filter((m) => {
            if (existingIds.has(m.id)) return false;
            if (m.evolution_message_id && existingEvIds.has(m.evolution_message_id)) return false;
            return true;
          });
          if (fresh.length === 0) return mutated ? merged : prev;
          if (fresh.some((m) => m.direcao === "ENTRADA")) hadNewIncoming = true;
          return [...merged, ...fresh];
        });

        if (hadNewIncoming && notificationSoundEnabledRef.current && notificationAudioRef.current) {
          const a = notificationAudioRef.current;
          a.currentTime = 0;
          a.play().catch(() => {});
        }
      } catch {
        // silencioso — proxima iteracao tenta de novo
      }
    }, 2000);

    return () => {
      clearTimeout(debounceTimeout);
      clearInterval(messagePollingInterval);
      // Remove o canal específico do lead
      if (leadChannel) {
        supabase.removeChannel(leadChannel);
      }
    };
  }, [selectedLead?.id, selectedMembership?.whatsapp_instance_id, notificationSoundEnabled]);

  // Auto-scroll — skip when prepending older messages (loadMore) to preserve position
  useEffect(() => {
    if (!isLoadingMoreRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Carrega historico read-only do canal de origem quando a membership
  // selecionada eh 'transferred'. Bounded por limit(200).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!selectedMembership
        || selectedMembership.source !== 'transferred'
        || !selectedMembership.transferred_from_instance_id
        || !selectedMembership.transferred_at) {
        setPreTransferMessages([]);
        return;
      }
      const { data, error } = await supabase
        .from('mensagens_chat')
        .select('*, quoted:quoted_message_id(id, corpo_mensagem, direcao, media_type)')
        .eq('id_lead', selectedMembership.lead_id)
        .eq('whatsapp_instance_id', selectedMembership.transferred_from_instance_id)
        .lt('data_hora', selectedMembership.transferred_at)
        .order('data_hora', { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (error) {
        console.error('loadPreTransferHistory error:', error);
        setPreTransferMessages([]);
        return;
      }
      setPreTransferMessages(parseMessages(data || []));
    };
    load();
    return () => { cancelled = true; };
  }, [selectedMembership?.lead_id, selectedMembership?.whatsapp_instance_id, selectedMembership?.source, selectedMembership?.transferred_from_instance_id, selectedMembership?.transferred_at]);

  // Search navigation
  useEffect(() => {
    if (messageSearchQuery) {
      setCurrentSearchResultIndex(0);
      searchResultRefs.current.get(0)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setCurrentSearchResultIndex(0);
      searchResultRefs.current.clear();
    }
  }, [messageSearchQuery]);

  useEffect(() => {
    searchResultRefs.current.get(currentSearchResultIndex)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSearchResultIndex]);

  // Data loading functions - OPTIMIZED with parallel queries
  const loadAllChatData = async () => {
    if (!user?.id || !organizationId) return;
    const isFirstLoad = !hasInitialLoadCompletedRef.current;
    if (isFirstLoad) setLoading(true);

    try {
      // Usa organizationId resolvido pelo OrganizationContext (mesma org
      // primaria que Pipeline/edge functions usam). Antes consultavamos
      // organization_members.maybeSingle() aqui — isso falhava com PGRST116
      // para users com 2+ memberships, deixando o Chat eternamente vazio.
      setOrgId(organizationId);
      orgIdRef.current = organizationId;

      // Leads agora vem do useLeadMemberships (1 card por par lead × canal).
      // Triggera o fetch do hook; os states leads/presence/leadTagsMap/
      // responsiblesMap sao populados por useEffects separados que observam
      // membershipCards / leadsFromMemberships.
      await reloadMemberships();

      // Tags da org + preferencia de som (independentes dos leads)
      const [tagsResult, profileResult] = await Promise.all([
        supabase
          .from("lead_tags")
          .select("*")
          .eq("organization_id", organizationId)
          .order("name"),
        supabase
          .from("profiles")
          .select("notification_sound_enabled")
          .eq("user_id", user.id)
          .single()
      ]);

      // Load connected channels for channel selector and colored bars
      const { data: channelsData } = await supabase
        .from("whatsapp_instances")
        .select("id, instance_name, channel_name, channel_color, status")
        .eq("organization_id", organizationId)
        .eq("status", "CONNECTED")
        .order("created_at", { ascending: true });
      channelsRef.current = (channelsData || []) as any[];

      // Set tags
      setAvailableTags(tagsResult.data || []);

      // Set notification preference
      if (profileResult.data) {
        setNotificationSoundEnabled(profileResult.data.notification_sound_enabled ?? true);
      }

      // Tag assignments + responsibles ficam num useEffect separado
      // (loadLeadDerivedData) dependente de leadsFromMemberships.
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível carregar os contatos", variant: "destructive" });
    } finally {
      if (isFirstLoad) {
        setLoading(false);
        hasInitialLoadCompletedRef.current = true;
      }
    }
  };

  // Keep individual functions for realtime updates
  const loadLeads = loadAllChatData;

  const loadAvailableTags = async () => {
    if (!user?.id || !organizationId) return;
    const { data } = await supabase
      .from("lead_tags")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name");
    setAvailableTags(data || []);
  };

  const loadNotificationPreference = async () => {
    if (!user) return;
    const { data } = await supabase.from("profiles").select("notification_sound_enabled").eq("user_id", user.id).single();
    if (data) setNotificationSoundEnabled(data.notification_sound_enabled ?? true);
  };

  const loadLeadTagsAssignments = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;
    const { data } = await supabase.from("lead_tag_assignments").select("lead_id, tag_id").in("lead_id", leadIds);
    const newMap = new Map<string, string[]>();
    data?.forEach((assignment) => {
      const current = newMap.get(assignment.lead_id) || [];
      newMap.set(assignment.lead_id, [...current, assignment.tag_id]);
    });
    setLeadTagsMap(newMap);
  };

  const parseMessages = (data: any[]): Message[] =>
    data.map((msg: any) => ({
      ...msg,
      quoted_message: msg.quoted ? {
        corpo_mensagem: msg.quoted.corpo_mensagem,
        direcao: msg.quoted.direcao,
        media_type: msg.quoted.media_type,
      } : null,
      quoted_message_id: msg.quoted_message_id,
    })) as Message[];

  const loadMessages = async (leadId: string) => {
    setLoading(true);
    setHasMoreMessages(false);
    oldestMessageTimeRef.current = null;
    try {
      // Filtro por canal: msgs com whatsapp_instance_id = canal atual.
      // Fallback OR whatsapp_instance_id IS NULL para mensagens antigas
      // (pre-backfill / pre-feature) que aparecem em qualquer canal.
      const currentChannel = selectedMembership?.whatsapp_instance_id;

      let query = supabase
        .from("mensagens_chat")
        .select("*, quoted:quoted_message_id(id, corpo_mensagem, direcao, media_type)")
        .eq("id_lead", leadId)
        .order("data_hora", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (currentChannel) {
        query = query.or(`whatsapp_instance_id.eq.${currentChannel},whatsapp_instance_id.is.null`);
      }

      const { data, error } = await query;
      if (error) throw error;

      const reversed = (data || []).slice().reverse();
      const messagesWithQuotes = parseMessages(reversed);
      setMessages(messagesWithQuotes);

      if ((data || []).length === MESSAGE_PAGE_SIZE) {
        setHasMoreMessages(true);
        oldestMessageTimeRef.current = reversed[0]?.data_hora ?? null;
      }

      const messageIds = reversed.map((m: any) => m.id);
      if (messageIds.length > 0) {
        const [reactionsRes, pinnedRes] = await Promise.all([
          supabase.from("message_reactions").select("*").in("message_id", messageIds),
          supabase.from("pinned_messages").select("message_id").eq("lead_id", leadId),
        ]);

        const reactionsMap = new Map<string, MessageReaction[]>();
        reactionsRes.data?.forEach((r) => {
          const existing = reactionsMap.get(r.message_id) || [];
          reactionsMap.set(r.message_id, [...existing, r]);
        });
        setMessageReactions(reactionsMap);
        setPinnedMessages(new Set(pinnedRes.data?.map((p) => p.message_id) || []));
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível carregar as mensagens", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadMoreMessages = useCallback(async () => {
    if (!selectedLead || !oldestMessageTimeRef.current || loadingMoreMessages) return;
    isLoadingMoreRef.current = true;
    setLoadingMoreMessages(true);
    try {
      const currentChannel = selectedMembership?.whatsapp_instance_id;

      let mmQuery = supabase
        .from("mensagens_chat")
        .select("*, quoted:quoted_message_id(id, corpo_mensagem, direcao, media_type)")
        .eq("id_lead", selectedLead.id)
        .lt("data_hora", oldestMessageTimeRef.current)
        .order("data_hora", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (currentChannel) {
        mmQuery = mmQuery.or(`whatsapp_instance_id.eq.${currentChannel},whatsapp_instance_id.is.null`);
      }

      const { data, error } = await mmQuery;
      if (error) throw error;

      const reversed = (data || []).slice().reverse();
      const older = parseMessages(reversed);

      // Load reactions for these older messages
      const messageIds = reversed.map((m: any) => m.id);
      if (messageIds.length > 0) {
        const { data: reactionsData } = await supabase
          .from("message_reactions")
          .select("*")
          .in("message_id", messageIds);
        if (reactionsData) {
          setMessageReactions((prev) => {
            const updated = new Map(prev);
            reactionsData.forEach((r) => {
              const existing = updated.get(r.message_id) || [];
              if (!existing.some((e) => e.id === r.id)) {
                updated.set(r.message_id, [...existing, r]);
              }
            });
            return updated;
          });
        }
      }

      setMessages((prev) => [...older, ...prev]);

      if ((data || []).length === MESSAGE_PAGE_SIZE) {
        setHasMoreMessages(true);
        oldestMessageTimeRef.current = reversed[0]?.data_hora ?? null;
      } else {
        setHasMoreMessages(false);
        oldestMessageTimeRef.current = null;
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar mensagens anteriores", variant: "destructive" });
    } finally {
      setLoadingMoreMessages(false);
      // Re-enable auto-scroll on next realtime message after a brief delay
      setTimeout(() => { isLoadingMoreRef.current = false; }, 100);
    }
  }, [selectedLead, loadingMoreMessages, toast]);

  // Message actions
  const sendMessage = useCallback(async (messageText: string) => {
    if (!selectedLead || !messageText.trim()) return;

    const optimisticId = `optimistic-${Date.now()}`;
    const signatureText = `*${currentUserName}:*\n`;
    const fullMessage = signatureText + messageText.trim();

    const optimisticMessage: Message = {
      id: optimisticId,
      id_lead: selectedLead.id,
      direcao: "SAIDA",
      corpo_mensagem: fullMessage.replace(/\*/g, ""),
      data_hora: new Date().toISOString(),
      evolution_message_id: null,
      status_entrega: null,
      created_at: new Date().toISOString(),
      isOptimistic: true,
      sendError: false,
      quoted_message_id: replyingTo?.id || null,
      quoted_message: replyingTo ? {
        corpo_mensagem: replyingTo.corpo_mensagem,
        direcao: replyingTo.direcao,
        media_type: replyingTo.media_type,
      } : null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");
    setReplyingTo(null);
    messageInputRef.current?.focus();

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Usuário não autenticado");

      // Usa organizationId do contexto (mesma org primaria que o restante
      // do app). Antes consultavamos organization_members aqui — quebrava
      // para users multi-org (.single() falhava com PGRST116).
      if (!organizationId) throw new Error("Organização não encontrada");

      // Canal de envio: prioridade para selectedMembership (canal da
      // conversa aberta); fallback para lead.whatsapp_instance_id.
      const sendInstanceId = selectedMembership?.whatsapp_instance_id || selectedLead.whatsapp_instance_id;

      let instanceQuery = supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("organization_id", organizationId)
        .eq("status", "CONNECTED");

      if (sendInstanceId) {
        instanceQuery = instanceQuery.eq("id", sendInstanceId);
      }

      const { data: instanceData } = await instanceQuery.maybeSingle();
      if (!instanceData) throw new Error("Nenhuma instância WhatsApp conectada");

      const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
        body: {
          instance_name: instanceData.instance_name,
          remoteJid: selectedLead.telefone_lead,
          message_text: fullMessage,
          leadId: selectedLead.id,
          quotedMessageId: replyingTo?.evolution_message_id || undefined,
        },
      });

      if (error || !data?.success) throw new Error(data?.error || "Erro ao enviar mensagem");

      setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? { ...msg, evolution_message_id: data.messageId, status_entrega: "SENT" as const, isOptimistic: false } : msg)));
    } catch (error) {
      setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? { ...msg, sendError: true, errorMessage: error instanceof Error ? error.message : "Erro desconhecido" } : msg)));
      toast({ title: "Erro ao enviar", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    }
  }, [selectedLead, selectedMembership, organizationId, currentUserName, toast, replyingTo]);

  const sendAudio = useCallback(async (audioBlob: Blob) => {
    if (!selectedLead || sendingAudio) return;
    setSendingAudio(true);

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Usuário não autenticado");

      // Usa organizationId do contexto (mesma org primaria que o restante
      // do app). Antes consultavamos organization_members aqui — quebrava
      // para users multi-org (.single() falhava com PGRST116).
      if (!organizationId) throw new Error("Organização não encontrada");

      const sendInstanceIdAudio = selectedMembership?.whatsapp_instance_id || selectedLead.whatsapp_instance_id;

      let instanceQuery = supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("organization_id", organizationId)
        .eq("status", "CONNECTED");

      if (sendInstanceIdAudio) {
        instanceQuery = instanceQuery.eq("id", sendInstanceIdAudio);
      }

      const { data: instanceData } = await instanceQuery.maybeSingle();
      if (!instanceData) throw new Error("Nenhuma instância WhatsApp conectada");

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const base64Data = base64.split(",")[1];

        const optimisticId = `optimistic-audio-${Date.now()}`;
        const optimisticMessage: Message = {
          id: optimisticId,
          id_lead: selectedLead.id,
          direcao: "SAIDA",
          corpo_mensagem: "",
          data_hora: new Date().toISOString(),
          evolution_message_id: null,
          status_entrega: null,
          created_at: new Date().toISOString(),
          media_type: "audio",
          media_url: URL.createObjectURL(audioBlob),
          media_metadata: { seconds: opusRecorder.recordingTime },
          isOptimistic: true,
          sendError: false,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        try {
          const { data, error } = await supabase.functions.invoke("send-whatsapp-media", {
            body: { instance_name: instanceData.instance_name, remoteJid: selectedLead.telefone_lead, media_base64: base64Data, media_type: "audio", file_name: `audio-${Date.now()}.ogg`, mime_type: "audio/ogg; codecs=opus", caption: "", leadId: selectedLead.id, is_ptt: true },
          });

          if (error || !data?.success) throw new Error(data?.error || "Erro ao enviar áudio");

          setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? { ...msg, evolution_message_id: data.messageId, status_entrega: "SENT" as const, media_url: data.mediaUrl || msg.media_url, isOptimistic: false } : msg)));
          toast({ title: "Áudio enviado", description: "O áudio foi enviado via WhatsApp" });
        } catch (error) {
          setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? { ...msg, sendError: true } : msg)));
          toast({ title: "Erro ao enviar áudio", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
        } finally {
          setSendingAudio(false);
          setAudioBlob(null);
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      toast({ title: "Erro", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      setSendingAudio(false);
      setAudioBlob(null);
    }
  }, [selectedLead, selectedMembership, organizationId, sendingAudio, opusRecorder.recordingTime, toast]);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedLead) return;

    if (file.size > 16 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "O arquivo deve ter no máximo 16MB", variant: "destructive" });
      return;
    }

    setSendingFile(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      const base64Data = base64.split(",")[1];

      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser) throw new Error("Usuário não autenticado");

        // Usa organizationId do contexto (mesma org primaria que o restante
        // do app). Antes consultavamos organization_members aqui — quebrava
        // para users multi-org (.single() falhava com PGRST116).
        if (!organizationId) throw new Error("Organização não encontrada");

        const sendInstanceIdFile = selectedMembership?.whatsapp_instance_id || selectedLead.whatsapp_instance_id;

        let instanceQuery = supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("organization_id", organizationId)
        .eq("status", "CONNECTED");

      if (sendInstanceIdFile) {
        instanceQuery = instanceQuery.eq("id", sendInstanceIdFile);
      }

      const { data: instanceData } = await instanceQuery.maybeSingle();
        if (!instanceData) throw new Error("Nenhuma instância WhatsApp conectada");

        let mediaType = "document";
        if (file.type.startsWith("image/")) mediaType = "image";
        else if (file.type.startsWith("video/")) mediaType = "video";
        else if (file.type.startsWith("audio/")) mediaType = "audio";

        const optimisticId = `optimistic-file-${Date.now()}`;
        const optimisticMessage: Message = {
          id: optimisticId,
          id_lead: selectedLead.id,
          direcao: "SAIDA",
          corpo_mensagem: mediaType === "image" ? "" : `[${file.name}]`,
          data_hora: new Date().toISOString(),
          evolution_message_id: null,
          status_entrega: null,
          created_at: new Date().toISOString(),
          media_type: mediaType,
          media_url: URL.createObjectURL(file),
          isOptimistic: true,
          sendError: false,
        };

        setMessages((prev) => [...prev, optimisticMessage]);

        const { data, error } = await supabase.functions.invoke("send-whatsapp-media", {
          body: { instance_name: instanceData.instance_name, remoteJid: selectedLead.telefone_lead, media_base64: base64Data, media_type: mediaType, file_name: file.name, mime_type: file.type, caption: "", leadId: selectedLead.id },
        });

        if (error || !data?.success) throw new Error(data?.error || "Erro ao enviar arquivo");

        setMessages((prev) => prev.map((msg) => (msg.id === optimisticId ? { ...msg, evolution_message_id: data.messageId, status_entrega: "SENT" as const, media_url: data.mediaUrl || msg.media_url } : msg)));
        toast({ title: "Arquivo enviado", description: "O arquivo foi enviado via WhatsApp" });
      } catch (error) {
        toast({ title: "Erro ao enviar arquivo", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
      } finally {
        setSendingFile(false);
        setSelectedFile(null);
      }
    };
    reader.onerror = () => {
      toast({ title: "Erro ao ler arquivo", description: "Não foi possível processar o arquivo selecionado", variant: "destructive" });
      setSendingFile(false);
    };
    reader.readAsDataURL(file);
  }, [selectedLead, selectedMembership, organizationId, toast]);

  const toggleReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return;
    const reactions = messageReactions.get(messageId) || [];
    const existingReaction = reactions.find((r) => r.user_id === user.id && r.emoji === emoji);

    try {
      if (existingReaction) {
        await supabase.from("message_reactions").delete().eq("id", existingReaction.id);
        setMessageReactions((prev) => {
          const updated = new Map(prev);
          const filtered = (updated.get(messageId) || []).filter((r) => r.id !== existingReaction.id);
          if (filtered.length === 0) updated.delete(messageId);
          else updated.set(messageId, filtered);
          return updated;
        });
      } else {
        const { data, error } = await supabase.from("message_reactions").insert({ message_id: messageId, user_id: user.id, emoji }).select().single();
        if (error) throw error;
        setMessageReactions((prev) => {
          const updated = new Map(prev);
          const existing = updated.get(messageId) || [];
          updated.set(messageId, [...existing, data]);
          return updated;
        });

        // Send to WhatsApp
        const message = messages.find((m) => m.id === messageId);
        if (message?.evolution_message_id && selectedLead) {
          await supabase.functions.invoke("send-whatsapp-reaction", {
            body: { message_id: messageId, emoji, lead_id: selectedLead.id },
          });
        }
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível reagir à mensagem", variant: "destructive" });
    }

    setReactionPopoverOpen(null);
    setDropdownOpenStates(new Map());
  }, [user, messageReactions, messages, selectedLead, toast]);

  const togglePinMessage = useCallback(async (message: Message) => {
    if (!selectedLead || !user) return;
    const isPinned = pinnedMessages.has(message.id);

    try {
      if (isPinned) {
        await supabase.from("pinned_messages").delete().eq("message_id", message.id).eq("lead_id", selectedLead.id);
        setPinnedMessages((prev) => { const newSet = new Set(prev); newSet.delete(message.id); return newSet; });
        toast({ title: "Mensagem desafixada" });
      } else {
        if (pinnedMessages.size >= 3) {
          toast({ title: "Limite atingido", description: "Você pode fixar no máximo 3 mensagens por conversa", variant: "destructive" });
          return;
        }
        await supabase.from("pinned_messages").insert({ message_id: message.id, lead_id: selectedLead.id, pinned_by: user.id });
        setPinnedMessages((prev) => new Set([...prev, message.id]));
        toast({ title: "Mensagem fixada" });
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível atualizar a mensagem", variant: "destructive" });
    }
  }, [selectedLead, user, pinnedMessages, toast]);

  const deleteMessage = useCallback(async (message: Message) => {
    if (!selectedLead) return;

    try {
      // Remove related data first
      await Promise.all([
        supabase.from("pinned_messages").delete().eq("message_id", message.id),
        supabase.from("message_reactions").delete().eq("message_id", message.id)
      ]);

      // Delete the message
      const { error } = await supabase
        .from("mensagens_chat")
        .delete()
        .eq("id", message.id);

      if (error) throw error;

      // Update local state
      setMessages((prev) => prev.filter((m) => m.id !== message.id));
      setPinnedMessages((prev) => {
        const newSet = new Set(prev);
        newSet.delete(message.id);
        return newSet;
      });
      setMessageReactions((prev) => {
        const newMap = new Map(prev);
        newMap.delete(message.id);
        return newMap;
      });

      toast({ title: "Mensagem apagada" });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível apagar a mensagem",
        variant: "destructive"
      });
    }
  }, [selectedLead, toast]);

  const togglePinLead = useCallback((leadId: string) => {
    setPinnedLeads((prev) => {
      const newPinned = prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [leadId, ...prev];
      localStorage.setItem("pinnedLeads", JSON.stringify(newPinned));
      toast({ title: prev.includes(leadId) ? "Contato desafixado" : "Contato fixado" });
      return newPinned;
    });
  }, [toast]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setPinnedLeads((items) => {
        const newOrder = arrayMove(items, items.indexOf(active.id as string), items.indexOf(over.id as string));
        localStorage.setItem("pinnedLeads", JSON.stringify(newOrder));
        return newOrder;
      });
    }
  }, []);

  const handleRemoveAllTags = useCallback((leadId: string) => {
    const leadTagIds = leadTagsMap.get(leadId) || [];
    if (leadTagIds.length === 0) {
      toast({ title: "Nenhuma etiqueta", description: "Este lead não possui etiquetas para remover" });
      return;
    }
    setLeadToRemoveTags(leadId);
    setSelectedTagsToRemove(leadTagIds);
    setRemoveTagsDialogOpen(true);
  }, [leadTagsMap, toast]);

  const confirmRemoveAllTags = useCallback(async () => {
    if (!leadToRemoveTags || selectedTagsToRemove.length === 0) return;
    try {
      await supabase.from("lead_tag_assignments").delete().eq("lead_id", leadToRemoveTags).in("tag_id", selectedTagsToRemove);
      setLeadTagsMap((prev) => {
        const newMap = new Map(prev);
        const current = newMap.get(leadToRemoveTags) || [];
        newMap.set(leadToRemoveTags, current.filter((id) => !selectedTagsToRemove.includes(id)));
        return newMap;
      });
      toast({ title: "Etiquetas removidas", description: `${selectedTagsToRemove.length} etiqueta(s) removida(s)` });
    } catch {
      toast({ title: "Erro", description: "Não foi possível remover as etiquetas", variant: "destructive" });
    } finally {
      setRemoveTagsDialogOpen(false);
      setLeadToRemoveTags(null);
      setSelectedTagsToRemove([]);
    }
  }, [leadToRemoveTags, selectedTagsToRemove, toast]);

  // Computed values
  const searchResults = useMemo(() => messages.filter((m) => messageSearchQuery.trim() && m.corpo_mensagem.toLowerCase().includes(messageSearchQuery.toLowerCase())), [messages, messageSearchQuery]);

  const getChannelColor = useCallback((lead: Lead): string | null => {
    if (!lead.whatsapp_instance_id) return null;
    const channel = channelsRef.current.find(c => c.id === lead.whatsapp_instance_id);
    return channel?.channel_color || null;
  }, []);

  // Hook que retorna canais aos quais o member esta atribuido. Owner/admin
  // recebe `null` (visibilidade total). Member sem atribuicoes recebe Set vazio
  // — nesse caso so verao leads sem canal (nao-WhatsApp).
  const { assignedChannelIds, loading: assignmentsLoading, hasFullAccess } = useAssignedChannels();

  // Filtros operando sobre membership cards (1 card por par lead × canal).
  // Substitui o baseFilteredLeads no rendering — owner/admin com lead em 2
  // canais ve 2 cards distintos. Owner/admin com WCM = todos memberships;
  // member ja recebe filtrado pelo hook.
  const baseFilteredMemberships = useMemo(() => membershipCards.filter((card) => {
    const matchesSearch = card.nome_lead.toLowerCase().includes(searchQuery.toLowerCase())
      || card.telefone_lead.includes(searchQuery);
    const matchesChannel = !selectedChannelId || card.whatsapp_instance_id === selectedChannelId;
    if (selectedTagIds.length > 0) {
      const leadTags = leadTagsMap.get(card.lead_id) || [];
      return matchesSearch && matchesChannel && selectedTagIds.some((tagId) => leadTags.includes(tagId));
    }
    return matchesSearch && matchesChannel;
  }), [membershipCards, searchQuery, selectedTagIds, leadTagsMap, selectedChannelId]);

  const pinnedFilteredMemberships = useMemo(
    () => baseFilteredMemberships.filter((c) => pinnedLeads.includes(c.lead_id))
      .sort((a, b) => pinnedLeads.indexOf(a.lead_id) - pinnedLeads.indexOf(b.lead_id)),
    [baseFilteredMemberships, pinnedLeads]
  );

  const unpinnedFilteredMemberships = useMemo(() => {
    return baseFilteredMemberships.filter((c) => !pinnedLeads.includes(c.lead_id)).sort((a, b) => {
      if (a.lead_id === lockedLeadId) return -1;
      if (b.lead_id === lockedLeadId) return 1;
      switch (filterOption) {
        case "alphabetical": return a.nome_lead.localeCompare(b.nome_lead);
        case "created":
          return new Date(b.lead_created_at).getTime() - new Date(a.lead_created_at).getTime();
        case "last_interaction":
          return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
        default:
          return new Date(b.last_message_at || b.lead_updated_at || 0).getTime()
            - new Date(a.last_message_at || a.lead_updated_at || 0).getTime();
      }
    });
  }, [baseFilteredMemberships, pinnedLeads, lockedLeadId, filterOption]);

  const baseFilteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesSearch = lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) || lead.telefone_lead.includes(searchQuery);
    const matchesChannel = !selectedChannelId || lead.whatsapp_instance_id === selectedChannelId;
    // Filtro de atribuicao: members so veem leads dos canais atribuidos
    // ou leads sem canal (nao-WhatsApp). Enquanto carrega as atribuicoes,
    // members nao veem leads WhatsApp para evitar flash de dados sensiveis.
    let matchesAssignment = true;
    if (!hasFullAccess) {
      if (assignmentsLoading) {
        matchesAssignment = !lead.whatsapp_instance_id;
      } else {
        matchesAssignment = isLeadVisibleByChannel(lead.whatsapp_instance_id, assignedChannelIds);
      }
    }
    if (selectedTagIds.length > 0) {
      const leadTags = leadTagsMap.get(lead.id) || [];
      return matchesSearch && matchesChannel && matchesAssignment && selectedTagIds.some((tagId) => leadTags.includes(tagId));
    }
    return matchesSearch && matchesChannel && matchesAssignment;
  }), [leads, searchQuery, selectedTagIds, leadTagsMap, selectedChannelId, hasFullAccess, assignmentsLoading, assignedChannelIds]);

  const pinnedFilteredLeads = useMemo(() => baseFilteredLeads.filter((lead) => pinnedLeads.includes(lead.id)).sort((a, b) => pinnedLeads.indexOf(a.id) - pinnedLeads.indexOf(b.id)), [baseFilteredLeads, pinnedLeads]);

  const unpinnedFilteredLeads = useMemo(() => baseFilteredLeads.filter((lead) => !pinnedLeads.includes(lead.id)).sort((a, b) => {
    // Lead travado sempre fica na posição atual (topo dos não-fixados)
    if (a.id === lockedLeadId) return -1;
    if (b.id === lockedLeadId) return 1;

    switch (filterOption) {
      case "alphabetical": return a.nome_lead.localeCompare(b.nome_lead);
      case "created": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "last_interaction":
        const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return bTime - aTime;
      default: return 0;
    }
  }), [baseFilteredLeads, pinnedLeads, filterOption, lockedLeadId]);

  const activeFiltersCount = (filterOption !== "none" ? 1 : 0) + selectedTagIds.length;

  // Sortable Lead Item component
  const SortableLeadItem = ({ lead }: { lead: Lead }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lead.id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

    return (
      <div ref={setNodeRef} style={style}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div {...attributes} {...listeners} className="relative cursor-grab active:cursor-grabbing">
              <ChatLeadItem
                lead={lead}
                isSelected={selectedLead?.id === lead.id}
                isPinned={true}
                isLocked={lead.id === lockedLeadId}
                presenceStatus={presenceStatus.get(lead.id)}
                tagVersion={(leadTagsMap.get(lead.id) || []).join(",")}
                responsibleInfo={permissions.canViewAllLeads && lead.responsavel_user_id ? responsiblesMap.get(lead.responsavel_user_id) : undefined}
                onClick={() => { setSelectedLead(lead); setLockedLeadId(lead.id); refreshPresenceForLead(lead); }}
                onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
              />
              {getChannelColor(lead) && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-r pointer-events-none"
                  style={{ backgroundColor: getChannelColor(lead) || undefined }}
                  title={channelsRef.current.find(c => c.id === lead.whatsapp_instance_id)?.channel_name || ''}
                />
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => togglePinLead(lead.id)}>
              <PinOff className="mr-2 h-4 w-4" />
              Desafixar conversa
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => { setSelectedLead(lead); setLeadTagsOpen(true); }}>
              <Tag className="mr-2 h-4 w-4" />
              Adicionar etiquetas
            </ContextMenuItem>
            {(leadTagsMap.get(lead.id)?.length || 0) > 0 && (
              <ContextMenuItem onClick={() => handleRemoveAllTags(lead.id)}>
                <Tag className="mr-2 h-4 w-4" />
                Remover etiquetas
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  };

  // On mobile, show only the leads list or the conversation (not both)
  const showLeadsList = !isMobile || (!selectedLead && !selectedGroup);
  const showChatArea = !isMobile || !!selectedLead || !!selectedGroup;

  return (
    <div className="flex h-[calc(100vh-5.5rem)] md:h-[calc(100vh-8rem)] gap-0 md:gap-4 min-w-0 overflow-hidden">
      {/* Leads List */}
      <Card className={`${isMobile ? 'w-full' : 'w-80'} flex-shrink-0 flex flex-col overflow-hidden h-full ${!showLeadsList ? 'hidden md:flex' : ''}`}>
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversas</h2>
            <div className="flex gap-1">
              <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className={`relative ${activeFiltersCount > 0 ? "text-primary" : ""}`}>
                    <Filter className="h-4 w-4" />
                    {activeFiltersCount > 0 && (
                      <Badge variant="default" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full">
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 z-[100]" align="end">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm mb-3">Ordenar por</h4>
                    {(["alphabetical", "created", "last_interaction"] as const).map((option) => (
                      <button key={option} onClick={() => { setFilterOption(option); setFilterPopoverOpen(false); }} className={`w-full text-left p-2 rounded hover:bg-muted transition-colors ${filterOption === option ? "bg-muted font-medium" : ""}`}>
                        {option === "alphabetical" ? "Ordem alfabética (A-Z)" : option === "created" ? "Mais recentes primeiro" : "Última interação"}
                      </button>
                    ))}
                    {availableTags.length > 0 && (
                      <>
                        <div className="border-t my-2" />
                        <h4 className="font-semibold text-sm mb-2">Filtrar por etiquetas</h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {availableTags.map((tag) => (
                            <button key={tag.id} onClick={() => setSelectedTagIds((prev) => prev.includes(tag.id) ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])} className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm">
                              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${selectedTagIds.includes(tag.id) ? "bg-primary border-primary" : "border-input"}`}>
                                {selectedTagIds.includes(tag.id) && <Check className="w-3 h-3 text-primary-foreground" />}
                              </div>
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                              <span className="flex-1 text-left truncate">{tag.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {(filterOption !== "none" || selectedTagIds.length > 0) && (
                      <>
                        <div className="border-t my-2" />
                        <button onClick={() => { setFilterOption("none"); setSelectedTagIds([]); setFilterPopoverOpen(false); }} className="w-full text-left p-2 rounded hover:bg-muted transition-colors text-muted-foreground">
                          Limpar todos os filtros
                        </button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" onClick={() => setManageTagsOpen(true)} className="gap-2">
                <Tag className="h-4 w-4" />
                Etiquetas
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar contato..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
          </div>
          <ChannelSelector
            organizationId={orgId || ''}
            selectedChannelId={selectedChannelId}
            onChannelChange={setSelectedChannelId}
          />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Abas distribuidas igualmente (flex-1) e na ordem solicitada:
              Tudo | Grupos | Fixados | Transmissão. Texto reduzido (text-xs +
              padding x-1) para caber sem quebrar em sidebar de 320px. */}
          <TabsList className="mx-4 mt-2 w-[calc(100%-2rem)] grid grid-cols-4 border-b rounded-none h-auto p-0 bg-transparent gap-0">
            <TabsTrigger value="all" className="text-xs rounded-none px-1 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              Tudo
            </TabsTrigger>
            <TabsTrigger value="groups" className="text-xs rounded-none px-1 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              Grupos
            </TabsTrigger>
            <TabsTrigger value="pinned" className="text-xs gap-1 rounded-none px-1 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              Fixados
              {pinnedFilteredLeads.length > 0 && <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[9px]">{pinnedFilteredLeads.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="broadcast" className="text-xs gap-1 rounded-none px-1 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <Radio className="h-3 w-3" />
              <span className="truncate">Transmissão</span>
            </TabsTrigger>
          </TabsList>

          {loading && !selectedLead ? (
            <LoadingAnimation text="Carregando leads..." />
          ) : (
            <>
              <TabsContent value="all" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  {unpinnedFilteredMemberships.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">Nenhum contato encontrado</div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {unpinnedFilteredMemberships.map((card) => {
                        const leadObj = leadsFromMemberships.find((l: any) => l.id === card.lead_id) || {
                          id: card.lead_id,
                          nome_lead: card.nome_lead,
                          telefone_lead: card.telefone_lead,
                          email: card.email,
                          avatar_url: card.avatar_url,
                          is_online: card.is_online,
                          last_seen: card.last_seen,
                          last_message_at: card.last_message_at,
                          responsavel_user_id: card.responsavel_user_id,
                          whatsapp_instance_id: card.lead_whatsapp_instance_id,
                          organization_id: card.organization_id,
                        } as Lead;
                        const channelColor = channelsRef.current.find((c: any) => c.id === card.whatsapp_instance_id)?.channel_color || null;
                        const channelName = channelsRef.current.find((c: any) => c.id === card.whatsapp_instance_id)?.channel_name || '';
                        const isSelected = selectedMembership?.lead_id === card.lead_id
                          && selectedMembership?.whatsapp_instance_id === card.whatsapp_instance_id;
                        return (
                          <ContextMenu key={`${card.lead_id}-${card.whatsapp_instance_id}`}>
                            <ContextMenuTrigger asChild>
                              <div className="relative">
                                <ChatLeadItem
                                  lead={leadObj as Lead}
                                  isSelected={isSelected}
                                  isPinned={false}
                                  isLocked={card.lead_id === lockedLeadId}
                                  presenceStatus={presenceStatus.get(card.lead_id)}
                                  tagVersion={(leadTagsMap.get(card.lead_id) || []).join(",")}
                                  responsibleInfo={permissions.canViewAllLeads && card.responsavel_user_id ? responsiblesMap.get(card.responsavel_user_id) : undefined}
                                  onClick={() => {
                                    setSelectedLead(leadObj as Lead);
                                    setSelectedMembership(card);
                                    setLockedLeadId(card.lead_id);
                                    refreshPresenceForLead(leadObj as Lead);
                                  }}
                                  onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                                />
                                {channelColor && (
                                  <div
                                    className="absolute right-0 top-1/2 -translate-y-1/2 w-[4px] h-6 rounded-l"
                                    style={{ backgroundColor: channelColor }}
                                    title={channelName}
                                  />
                                )}
                              </div>
                            </ContextMenuTrigger>
                            <ContextMenuContent className="w-56">
                              <ContextMenuItem onClick={() => togglePinLead(card.lead_id)}>
                                <Pin className="mr-2 h-4 w-4" />
                                Fixar conversa
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => openTransferDialog(card)}>
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                                Transferir para outro canal...
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => { setSelectedLead(leadObj as Lead); setSelectedMembership(card); setLeadTagsOpen(true); }}>
                                <Tag className="mr-2 h-4 w-4" />
                                Adicionar etiquetas
                              </ContextMenuItem>
                              {(leadTagsMap.get(card.lead_id)?.length || 0) > 0 && (
                                <ContextMenuItem onClick={() => handleRemoveAllTags(card.lead_id)}>
                                  <Tag className="mr-2 h-4 w-4" />
                                  Remover etiquetas
                                </ContextMenuItem>
                              )}
                            </ContextMenuContent>
                          </ContextMenu>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="pinned" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  {pinnedFilteredLeads.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">Nenhum contato fixado</div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      <SortableContext items={pinnedFilteredLeads.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1 p-2">
                          {pinnedFilteredLeads.map((lead) => <SortableLeadItem key={lead.id} lead={lead} />)}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </ScrollArea>
              </TabsContent>

              <TabsContent value="broadcast" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <BroadcastPanel
                  organizationId={organizationId!}
                  leads={leads}
                  userId={user?.id}
                />
              </TabsContent>

              <TabsContent value="groups" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <GroupListPanel
                  instanceName={
                    // Se ha selectedChannelId, usa esse canal; senao usa o primeiro CONNECTED.
                    (channelsRef.current.find((c) => c.id === selectedChannelId)?.instance_name)
                    || channelsRef.current[0]?.instance_name
                    || null
                  }
                  selectedGroupId={selectedGroup?.id || null}
                  onSelectGroup={(g) => {
                    setSelectedGroup(g);
                    setSelectedLead(null); // limpa lead para mostrar painel direito de grupo
                  }}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </Card>

      {/* Chat Area */}
      <Card className={`flex-1 flex flex-col overflow-hidden h-full min-w-0 max-w-full ${!showChatArea ? 'hidden md:flex' : ''}`}>
        {selectedGroup ? (
          <GroupConversationView
            group={selectedGroup}
            instanceName={
              (channelsRef.current.find((c) => c.id === selectedChannelId)?.instance_name)
              || channelsRef.current[0]?.instance_name
              || ""
            }
            onBack={isMobile ? () => setSelectedGroup(null) : undefined}
          />
        ) : selectedLead ? (
          <>
            {/* Mobile back button */}
            {isMobile && (
              <div className="flex items-center gap-2 p-2 border-b">
                <Button variant="ghost" size="sm" onClick={() => setSelectedLead(null)}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Voltar
                </Button>
              </div>
            )}
            <ChatHeader
              lead={selectedLead}
              presenceStatus={presenceStatus.get(selectedLead.id)}
              onRefreshPresence={() => refreshPresenceForLead(selectedLead)}
              isLoadingPresence={isLoadingPresence}
              messageSearchQuery={messageSearchQuery}
              setMessageSearchQuery={setMessageSearchQuery}
              messageSearchExpanded={messageSearchExpanded}
              setMessageSearchExpanded={setMessageSearchExpanded}
              totalSearchResults={searchResults.length}
              currentSearchResultIndex={currentSearchResultIndex}
              onNextResult={() => setCurrentSearchResultIndex((prev) => Math.min(prev + 1, searchResults.length - 1))}
              onPreviousResult={() => setCurrentSearchResultIndex((prev) => Math.max(prev - 1, 0))}
              onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
              <PinnedMessagesBar
                messages={messages}
                pinnedMessageIds={pinnedMessages}
                selectedLead={selectedLead}
                showExpanded={showPinnedMessages}
                onToggleExpanded={() => setShowPinnedMessages(!showPinnedMessages)}
                onUnpinMessage={togglePinMessage}
                onScrollToMessage={(id) => document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              />

              <div className="flex-1 relative overflow-hidden">
                <div
                  className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                  style={{ backgroundColor: theme === "dark" ? "#0C1317" : "#ECE5DD", backgroundImage: theme === "dark" ? "url(/chat-pattern-dark.png)" : "url(/chat-pattern.png)", backgroundRepeat: "repeat", backgroundSize: "200px", opacity: 0.3 }}
                />
                <ScrollArea className="h-full p-4 relative z-10">
                  {loading ? (
                    <LoadingAnimation text="Carregando mensagens..." />
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">Nenhuma mensagem ainda. Inicie a conversa!</div>
                  ) : (
                    <div className="space-y-4 max-w-full overflow-x-hidden">
                      {/* Botão carregar mensagens anteriores */}
                      {hasMoreMessages && (
                        <div className="flex justify-center py-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={loadMoreMessages}
                            disabled={loadingMoreMessages}
                            className="text-xs text-muted-foreground gap-1.5"
                          >
                            {loadingMoreMessages
                              ? <><Loader2 className="h-3 w-3 animate-spin" /> Carregando...</>
                              : "⬆ Carregar mensagens anteriores"}
                          </Button>
                        </div>
                      )}

                      {/* Read-only history: msgs do canal de origem antes do transferred_at */}
                      {preTransferMessages.length > 0 && (
                        <div className="bg-muted/30 -mx-2 px-2 py-2 rounded">
                          <div className="px-2 py-1 text-xs text-muted-foreground italic">
                            📋 Histórico do canal anterior (somente leitura)
                          </div>
                          {preTransferMessages.map((m) => (
                            <div key={`pre-${m.id}`} className="opacity-70 pointer-events-none select-none">
                              <MessageBubble
                                message={m}
                                lead={selectedLead!}
                                isPinned={false}
                                reactions={[]}
                                currentUserId={user?.id}
                                isSearchMatch={false}
                                isCurrentSearchResult={false}
                                dropdownOpen={false}
                                reactionPopoverOpen={false}
                                onToggleDropdown={() => {}}
                                onToggleReactionPopover={() => {}}
                                onToggleReaction={() => {}}
                                onTogglePin={() => {}}
                                onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                                onReply={() => {}}
                                onDelete={() => {}}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Divider de transferencia */}
                      {selectedMembership?.source === 'transferred' && selectedMembership.transferred_at && (
                        <TransferDivider
                          transferredAt={selectedMembership.transferred_at}
                          transferredByName={
                            (selectedMembership.transferred_by_user_id
                              ? responsiblesMap.get(selectedMembership.transferred_by_user_id)?.full_name
                              : null) || null
                          }
                          fromChannelName={
                            channelsRef.current.find((c: any) => c.id === selectedMembership.transferred_from_instance_id)?.channel_name
                            || channelsRef.current.find((c: any) => c.id === selectedMembership.transferred_from_instance_id)?.instance_name
                            || 'canal anterior'
                          }
                        />
                      )}

                      {messages.map((message, index) => {
                        const isSearchMatch = messageSearchQuery.trim() && message.corpo_mensagem.toLowerCase().includes(messageSearchQuery.toLowerCase());
                        let searchResultIndex = -1;
                        if (isSearchMatch) {
                          searchResultIndex = messages.slice(0, index + 1).filter((m) => m.corpo_mensagem.toLowerCase().includes(messageSearchQuery.toLowerCase())).length - 1;
                        }

                        return (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            lead={selectedLead}
                            isPinned={pinnedMessages.has(message.id)}
                            reactions={messageReactions.get(message.id) || []}
                            currentUserId={user?.id}
                            isSearchMatch={!!isSearchMatch}
                            isCurrentSearchResult={searchResultIndex === currentSearchResultIndex}
                            dropdownOpen={dropdownOpenStates.get(message.id) || false}
                            reactionPopoverOpen={reactionPopoverOpen === message.id}
                            onToggleDropdown={(open) => {
                              if (!open && reactionPopoverOpen === message.id) return;
                              const newStates = new Map(dropdownOpenStates);
                              if (open) newStates.set(message.id, true);
                              else newStates.delete(message.id);
                              setDropdownOpenStates(newStates);
                            }}
                            onToggleReactionPopover={() => setReactionPopoverOpen(reactionPopoverOpen === message.id ? null : message.id)}
                            onToggleReaction={(emoji) => toggleReaction(message.id, emoji)}
                            onTogglePin={() => togglePinMessage(message)}
                            onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                            onReply={(msg) => {
                              setReplyingTo(msg);
                              messageInputRef.current?.focus();
                            }}
                            onScrollToMessage={(messageId) => {
                              const el = document.getElementById(`message-${messageId}`);
                              el?.scrollIntoView({ behavior: "smooth", block: "center" });
                              el?.classList.add("ring-2", "ring-primary");
                              setTimeout(() => el?.classList.remove("ring-2", "ring-primary"), 2000);
                            }}
                            onDelete={() => setMessageToDelete(message)}
                            messageRef={(el) => {
                              if (isSearchMatch && searchResultIndex >= 0) {
                                searchResultRefs.current.set(searchResultIndex, el);
                              }
                            }}
                          />
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            <ChatInput
              newMessage={newMessage}
              setNewMessage={setNewMessage}
              onSendMessage={(e) => { e.preventDefault(); sendMessage(newMessage); }}
              sending={sending}
              sendingFile={sendingFile}
              sendingAudio={sendingAudio}
              isRecording={opusRecorder.isRecording}
              recordingTime={opusRecorder.recordingTime}
              onStartRecording={opusRecorder.startRecording}
              onStopRecording={opusRecorder.stopRecording}
              onFileSelect={handleFileSelect}
              inputRef={messageInputRef}
              replyingTo={replyingTo}
              onCancelReply={() => setReplyingTo(null)}
              leadName={selectedLead?.nome_lead}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <p className="text-lg">Selecione uma conversa</p>
              <p className="text-sm">Escolha um contato na lista para iniciar</p>
            </div>
          </div>
        )}
      </Card>

      {/* Modals */}
      <ManageTagsDialog open={manageTagsOpen} onOpenChange={setManageTagsOpen} />

      {/* Modal de transferencia entre canais */}
      {transferDialogState.leadId && transferDialogState.channelId && organizationId && (
        <TransferLeadDialog
          open={transferDialogState.open}
          onOpenChange={(open) => setTransferDialogState((s) => ({ ...s, open }))}
          leadId={transferDialogState.leadId}
          leadName={transferDialogState.leadName}
          organizationId={organizationId}
          currentChannelId={transferDialogState.channelId}
        />
      )}

      <Dialog open={leadTagsOpen && !!selectedLead} onOpenChange={setLeadTagsOpen}>
        <DialogContent className="max-w-sm">
          {selectedLead && (
            <LeadTagsManager leadId={selectedLead.id} onTagsChanged={() => loadLeadTagsAssignments([selectedLead.id])} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingAvatar} onOpenChange={() => setViewingAvatar(null)}>
        <DialogContent className="max-w-md">
          {viewingAvatar && <img src={viewingAvatar.url} alt={viewingAvatar.name} className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={removeTagsDialogOpen} onOpenChange={setRemoveTagsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etiquetas</AlertDialogTitle>
            <AlertDialogDescription>Selecione as etiquetas que deseja remover deste lead:</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-4">
            {leadToRemoveTags && (leadTagsMap.get(leadToRemoveTags) || []).map((tagId) => {
              const tag = availableTags.find((t) => t.id === tagId);
              if (!tag) return null;
              return (
                <label key={tagId} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox checked={selectedTagsToRemove.includes(tagId)} onCheckedChange={() => setSelectedTagsToRemove((prev) => prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId])} />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
                  <span>{tag.name}</span>
                </label>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoveAllTags} disabled={selectedTagsToRemove.length === 0}>Remover selecionadas</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!messageToDelete} onOpenChange={(open) => !open && setMessageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja apagar esta mensagem? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (messageToDelete) {
                  deleteMessage(messageToDelete);
                  setMessageToDelete(null);
                }
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Chat;
