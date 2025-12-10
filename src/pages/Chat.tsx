import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Lead, Message, MessageReaction, PinnedMessage } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Search, Tag, Filter, Check, Pin, PinOff } from "lucide-react";
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
import { ChatHeader, ChatInput, ChatLeadItem, MessageBubble, PinnedMessagesBar, PresenceInfo } from "@/components/chat";
import chatGif from "@/assets/chat.gif";
import { useChatPresence } from "@/hooks/useChatPresence";

const Chat = () => {
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme } = useTheme();
  const permissions = usePermissions();
  
  // Core state
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
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
  
  // Reply state
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  
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
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchResultRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    
    const interval = setInterval(cleanupOrphanChannels, 5000);
    return () => clearInterval(interval);
  }, []);

  // Reset mounted ref on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
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

  // CONSOLIDATED: Global realtime channel for leads, tags, tag assignments, and profile
  useEffect(() => {
    if (permissions.loading) return;
    if (!permissions.canViewAllLeads && !userProfile?.full_name) return;

    loadAllChatData();

    notificationAudioRef.current = new Audio(`/notification.mp3?v=${Date.now()}`);

    const savedPinnedLeads = localStorage.getItem("pinnedLeads");
    if (savedPinnedLeads) {
      try { setPinnedLeads(JSON.parse(savedPinnedLeads)); } catch {}
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
        setLeads((prev) => prev.map((lead) => (lead.id === updatedLead.id ? updatedLead : lead)));
        setSelectedLead((prev) => (prev?.id === updatedLead.id ? updatedLead : prev));
        if (updatedLead.is_online !== null || updatedLead.last_seen) {
          setPresenceStatus((prev) => new Map(prev).set(updatedLead.id, { isOnline: !!updatedLead.is_online, lastSeen: updatedLead.last_seen || undefined }));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "leads" }, () => {
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => loadAllChatData(), 500);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "leads" }, () => {
        clearTimeout(reloadTimeout);
        reloadTimeout = setTimeout(() => loadAllChatData(), 500);
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
        .subscribe();
    };

    setupGlobalChannel();

    return () => {
      clearTimeout(reloadTimeout);
      if (globalChannel) {
        supabase.removeChannel(globalChannel);
      }
    };
  }, [location.state, permissions.loading, permissions.canViewAllLeads, userProfile?.full_name, user?.id, removeExistingChannel]);

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
          const newMessage = payload.new as Message;
          if (newMessage.direcao === "ENTRADA" && notificationSoundEnabled) {
            notificationAudioRef.current?.play().catch(() => {});
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
          const updatedMessage = payload.new as Message;
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
        .subscribe();
    }, 200);

    return () => {
      clearTimeout(debounceTimeout);
      // Remove o canal específico do lead
      if (leadChannel) {
        supabase.removeChannel(leadChannel);
      }
    };
  }, [selectedLead?.id, notificationSoundEnabled]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
    if (!user?.id) return;
    setLoading(true);
    
    try {
      // Get organization ID first
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (!orgMember?.organization_id) {
        setLoading(false);
        return;
      }

      // Build leads query
      let leadsQuery = supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, email, stage, avatar_url, is_online, last_seen, last_message_at, source, responsavel, responsavel_user_id, created_at, updated_at, organization_id")
        .eq("organization_id", orgMember.organization_id)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(300);

      if (!permissions.canViewAllLeads) {
        leadsQuery = leadsQuery.eq("responsavel_user_id", user.id);
      }

      // Execute all queries in parallel
      const [leadsResult, tagsResult, profileResult] = await Promise.all([
        leadsQuery,
        supabase
          .from("lead_tags")
          .select("*")
          .eq("organization_id", orgMember.organization_id)
          .order("name"),
        supabase
          .from("profiles")
          .select("notification_sound_enabled")
          .eq("user_id", user.id)
          .single()
      ]);

      // Process leads
      const leadsData = leadsResult.data || [];
      setLeads(leadsData);

      // Set presence status
      const initialPresence = new Map<string, PresenceInfo>();
      leadsData.forEach((lead) => {
        if (lead.is_online !== null || lead.last_seen) {
          initialPresence.set(lead.id, { isOnline: !!lead.is_online, lastSeen: lead.last_seen || undefined });
        }
      });
      setPresenceStatus(initialPresence);

      // Set tags
      setAvailableTags(tagsResult.data || []);

      // Set notification preference
      if (profileResult.data) {
        setNotificationSoundEnabled(profileResult.data.notification_sound_enabled ?? true);
      }

      // Load tag assignments and responsibles in parallel (after we have lead IDs)
      if (leadsData.length > 0) {
        // Get unique responsible user IDs
        const responsibleUserIds = [...new Set(
          leadsData
            .map(l => l.responsavel_user_id)
            .filter((id): id is string => !!id)
        )];

        const [tagAssignmentsResult, responsiblesResult] = await Promise.all([
          supabase
            .from("lead_tag_assignments")
            .select("lead_id, tag_id")
            .in("lead_id", leadsData.map(l => l.id)),
          responsibleUserIds.length > 0
            ? supabase
                .from("profiles")
                .select("user_id, full_name, avatar_url")
                .in("user_id", responsibleUserIds)
            : Promise.resolve({ data: [] })
        ]);
        
        // Set tag assignments
        const newTagMap = new Map<string, string[]>();
        tagAssignmentsResult.data?.forEach((assignment) => {
          const current = newTagMap.get(assignment.lead_id) || [];
          newTagMap.set(assignment.lead_id, [...current, assignment.tag_id]);
        });
        setLeadTagsMap(newTagMap);

        // Set responsibles map
        const newResponsiblesMap = new Map<string, { full_name: string; avatar_url: string | null }>();
        responsiblesResult.data?.forEach((profile) => {
          if (profile.user_id) {
            newResponsiblesMap.set(profile.user_id, {
              full_name: profile.full_name || "Sem nome",
              avatar_url: profile.avatar_url
            });
          }
        });
        setResponsiblesMap(newResponsiblesMap);
      }
    } catch (error) {
      toast({ title: "Erro", description: "Não foi possível carregar os contatos", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Keep individual functions for realtime updates
  const loadLeads = loadAllChatData;

  const loadAvailableTags = async () => {
    const { data: orgData } = await supabase.rpc("get_user_organization_id", { _user_id: user?.id });
    if (!orgData) return;
    const { data } = await supabase.from("lead_tags").select("*").eq("organization_id", orgData).order("name");
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

  const loadMessages = async (leadId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("mensagens_chat").select("*, quoted:quoted_message_id(id, corpo_mensagem, direcao, media_type)").eq("id_lead", leadId).order("data_hora", { ascending: true });
      if (error) throw error;
      
      // Map quoted messages to the correct format
      const messagesWithQuotes = (data || []).map((msg: any) => ({
        ...msg,
        quoted_message: msg.quoted ? {
          corpo_mensagem: msg.quoted.corpo_mensagem,
          direcao: msg.quoted.direcao,
          media_type: msg.quoted.media_type,
        } : null,
        quoted_message_id: msg.quoted_message_id,
      })) as Message[];
      
      setMessages(messagesWithQuotes);

      const messageIds = data?.map((m) => m.id) || [];
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

  // Message actions
  const sendMessage = useCallback(async (messageText: string) => {
    if (!selectedLead || !messageText.trim() || sending) return;
    setSending(true);

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

      const { data: memberData } = await supabase.from("organization_members").select("organization_id").eq("user_id", currentUser.id).single();
      if (!memberData) throw new Error("Organização não encontrada");

      const { data: instanceData } = await supabase.from("whatsapp_instances").select("instance_name").eq("organization_id", memberData.organization_id).eq("status", "CONNECTED").limit(1).maybeSingle();
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
    } finally {
      setSending(false);
      messageInputRef.current?.focus();
    }
  }, [selectedLead, sending, currentUserName, toast, replyingTo]);

  const sendAudio = useCallback(async (audioBlob: Blob) => {
    if (!selectedLead || sendingAudio) return;
    setSendingAudio(true);

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error("Usuário não autenticado");

      const { data: memberData } = await supabase.from("organization_members").select("organization_id").eq("user_id", currentUser.id).single();
      if (!memberData) throw new Error("Organização não encontrada");

      const { data: instanceData } = await supabase.from("whatsapp_instances").select("instance_name").eq("organization_id", memberData.organization_id).eq("status", "CONNECTED").limit(1).maybeSingle();
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
  }, [selectedLead, sendingAudio, opusRecorder.recordingTime, toast]);

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

        const { data: memberData } = await supabase.from("organization_members").select("organization_id").eq("user_id", currentUser.id).single();
        if (!memberData) throw new Error("Organização não encontrada");

        const { data: instanceData } = await supabase.from("whatsapp_instances").select("instance_name").eq("organization_id", memberData.organization_id).eq("status", "CONNECTED").limit(1).maybeSingle();
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
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsDataURL(file);
  }, [selectedLead, toast]);

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

  const baseFilteredLeads = useMemo(() => leads.filter((lead) => {
    const matchesSearch = lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) || lead.telefone_lead.includes(searchQuery);
    if (selectedTagIds.length > 0) {
      const leadTags = leadTagsMap.get(lead.id) || [];
      return matchesSearch && selectedTagIds.some((tagId) => leadTags.includes(tagId));
    }
    return matchesSearch;
  }), [leads, searchQuery, selectedTagIds, leadTagsMap]);

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
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
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

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 min-w-0 overflow-hidden">
      {/* Leads List */}
      <Card className="w-80 flex-shrink-0 flex flex-col overflow-hidden h-full">
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
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="mx-4 mt-2 w-[calc(100%-2rem)] justify-start border-b rounded-none h-auto p-0 bg-transparent">
            <TabsTrigger value="all" className="text-sm rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">Tudo</TabsTrigger>
            <TabsTrigger value="pinned" className="text-sm gap-1 rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              Fixados
              {pinnedFilteredLeads.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{pinnedFilteredLeads.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          {loading && !selectedLead ? (
            <LoadingAnimation text="Carregando leads..." />
          ) : (
            <>
              <TabsContent value="all" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  {unpinnedFilteredLeads.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">Nenhum contato encontrado</div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {unpinnedFilteredLeads.map((lead) => (
                        <ContextMenu key={lead.id}>
                          <ContextMenuTrigger asChild>
                            <div>
                              <ChatLeadItem
                                lead={lead}
                                isSelected={selectedLead?.id === lead.id}
                                isPinned={false}
                                isLocked={lead.id === lockedLeadId}
                                presenceStatus={presenceStatus.get(lead.id)}
                                tagVersion={(leadTagsMap.get(lead.id) || []).join(",")}
                                responsibleInfo={permissions.canViewAllLeads && lead.responsavel_user_id ? responsiblesMap.get(lead.responsavel_user_id) : undefined}
                                onClick={() => { setSelectedLead(lead); setLockedLeadId(lead.id); refreshPresenceForLead(lead); }}
                                onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                              />
                            </div>
                          </ContextMenuTrigger>
                          <ContextMenuContent className="w-56">
                            <ContextMenuItem onClick={() => togglePinLead(lead.id)}>
                              <Pin className="mr-2 h-4 w-4" />
                              Fixar conversa
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
                      ))}
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
            </>
          )}
        </Tabs>
      </Card>

      {/* Chat Area */}
      <Card className="flex-1 flex flex-col overflow-hidden h-full min-w-0 max-w-full">
        {selectedLead ? (
          <>
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
    </div>
  );
};

export default Chat;
