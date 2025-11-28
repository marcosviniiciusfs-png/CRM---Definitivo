import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { Lead, Message, MessageReaction, PinnedMessage } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Phone, Search, Check, CheckCheck, Clock, Loader2, RefreshCw, Tag, Filter, Pin, PinOff, GripVertical, AlertCircle, RotateCcw, Image as ImageIcon, FileText, Download, Smile, Copy, Star, Trash2, Mic, Paperclip, Square } from "lucide-react";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { formatPhoneNumber } from "@/lib/utils";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useOpusRecorder } from "@/hooks/useOpusRecorder";
import { Checkbox } from "@/components/ui/checkbox";
import { LeadTagsManager } from "@/components/LeadTagsManager";
import { LeadTagsBadge } from "@/components/LeadTagsBadge";
import { ManageTagsDialog } from "@/components/ManageTagsDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp } from "lucide-react";
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

const Chat = () => {
  const location = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchExpanded, setMessageSearchExpanded] = useState(false);
  const [currentSearchResultIndex, setCurrentSearchResultIndex] = useState(0);
  const [viewingAvatar, setViewingAvatar] = useState<{ url: string; name: string } | null>(null);
  const [manageTagsOpen, setManageTagsOpen] = useState(false);
  const [leadTagsOpen, setLeadTagsOpen] = useState(false);
  const [filterOption, setFilterOption] = useState<"alphabetical" | "created" | "last_interaction" | "none">("none");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [leadTagsMap, setLeadTagsMap] = useState<Map<string, string[]>>(new Map());
  const [pinnedLeads, setPinnedLeads] = useState<string[]>([]);
  const [contextMenuLeadId, setContextMenuLeadId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [presenceStatus, setPresenceStatus] = useState<
    Map<string, { isOnline: boolean; lastSeen?: string; status?: string; rateLimited?: boolean }>
  >(new Map());
  const [loadingPresence, setLoadingPresence] = useState(false);
  const [removeTagsDialogOpen, setRemoveTagsDialogOpen] = useState(false);
  const [leadToRemoveTags, setLeadToRemoveTags] = useState<string | null>(null);
  const [selectedTagsToRemove, setSelectedTagsToRemove] = useState<string[]>([]);
  const [currentUserName, setCurrentUserName] = useState<string>("Atendente");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const firstSearchResultRef = useRef<HTMLDivElement>(null);
  const searchResultRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const presenceQueue = useRef<Array<{ lead: Lead; instanceName: string }>>([]);
  const isProcessingQueue = useRef(false);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(true);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);
  const [messageReactions, setMessageReactions] = useState<Map<string, MessageReaction[]>>(new Map());
  const [reactionPopoverOpen, setReactionPopoverOpen] = useState<string | null>(null);
  const [dropdownOpenStates, setDropdownOpenStates] = useState<Map<string, boolean>>(new Map());
  const [pinnedMessages, setPinnedMessages] = useState<Set<string>>(new Set());
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sendingFile, setSendingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [sendingAudio, setSendingAudio] = useState(false);

  // Hook para gravação em OGG/OPUS
  const opusRecorder = useOpusRecorder({
    onDataAvailable: (blob: Blob) => {
      console.log('🎤 Áudio OGG/OPUS recebido do recorder:', blob.size, 'bytes');
      setAudioBlob(blob);
      sendAudio(blob);
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao gravar áudio",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  // Emojis do WhatsApp para reações
  const WHATSAPP_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

  // Configuração dos sensores de drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Carregar nome do usuário atual do perfil
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return;

      try {
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Erro ao carregar perfil do usuário:', error);
          return;
        }

        if (profileData?.full_name) {
          setCurrentUserName(profileData.full_name);
        }
      } catch (error) {
        console.error('Erro ao buscar perfil:', error);
      }
    };

    loadUserProfile();

    // Configurar realtime para atualizar quando o perfil mudar
    const profileChannel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          console.log('Perfil atualizado:', payload);
          if (payload.new?.full_name) {
            setCurrentUserName(payload.new.full_name);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(profileChannel);
    };
  }, [user?.id]);

  // Carregar leads e configurar realtime
  useEffect(() => {
    loadLeads();
    loadAvailableTags();

    // Carregar preferência de som de notificação
    const loadNotificationPreference = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('notification_sound_enabled')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        setNotificationSoundEnabled(data.notification_sound_enabled ?? true);
      }
    };
    
    loadNotificationPreference();
    
    // Pré-carregar o áudio de notificação com cache-busting
    notificationAudioRef.current = new Audio(`/notification.mp3?v=${Date.now()}`);

    // Carregar leads fixados do localStorage
    const savedPinnedLeads = localStorage.getItem('pinnedLeads');
    if (savedPinnedLeads) {
      try {
        setPinnedLeads(JSON.parse(savedPinnedLeads));
      } catch (error) {
        console.error('Erro ao carregar leads fixados:', error);
      }
    }

    // Se veio um lead selecionado da página Leads
    if (location.state?.selectedLead) {
      setSelectedLead(location.state.selectedLead);
    }

    // Configurar realtime para atualizações automáticas
    const leadsChannel = supabase
      .channel('leads-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leads'
        },
        (payload) => {
          console.log('📝 Lead atualizado via realtime:', payload);
          const updatedLead = payload.new as Lead;
          
          // Atualizar apenas o lead específico no estado, sem recarregar tudo
          setLeads(prev => prev.map(lead => 
            lead.id === updatedLead.id ? updatedLead : lead
          ));
          
          // Se o lead atualizado é o selecionado, atualizar também
          setSelectedLead(prev => 
            prev?.id === updatedLead.id ? updatedLead : prev
          );

          // CRÍTICO: Atualizar presenceStatus quando is_online ou last_seen mudarem
          if (updatedLead.is_online !== null || updatedLead.last_seen) {
            setPresenceStatus(prev => {
              const newMap = new Map(prev);
              newMap.set(updatedLead.id, {
                isOnline: !!updatedLead.is_online,
                lastSeen: updatedLead.last_seen || undefined,
              });
              return newMap;
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads'
        },
        () => {
          console.log('➕ Novo lead criado, recarregando lista');
          loadLeads();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'leads'
        },
        () => {
          console.log('🗑️ Lead deletado, recarregando lista');
          loadLeads();
        }
      )
      .subscribe();

    // Configurar realtime para mudanças nas etiquetas
    const tagsChannel = supabase
      .channel('tags-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_tags'
        },
        () => {
          loadAvailableTags();
        }
      )
      .subscribe();

    // Configurar realtime para mudanças nas atribuições de etiquetas
    const tagAssignmentsChannel = supabase
      .channel('tag-assignments-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_tag_assignments'
        },
        (payload) => {
          console.log('➕ Etiqueta adicionada via realtime:', payload);
          const assignment = payload.new as { lead_id: string; tag_id: string };
          
          // Atualizar leadTagsMap adicionando a nova tag
          setLeadTagsMap(prev => {
            const newMap = new Map(prev);
            const currentTags = newMap.get(assignment.lead_id) || [];
            if (!currentTags.includes(assignment.tag_id)) {
              newMap.set(assignment.lead_id, [...currentTags, assignment.tag_id]);
            }
            return newMap;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'lead_tag_assignments'
        },
        (payload) => {
          console.log('🗑️ Etiqueta removida via realtime:', payload);
          const assignment = payload.old as { lead_id: string; tag_id: string };
          
          // Atualizar leadTagsMap removendo a tag
          setLeadTagsMap(prev => {
            const newMap = new Map(prev);
            const currentTags = newMap.get(assignment.lead_id) || [];
            newMap.set(
              assignment.lead_id,
              currentTags.filter(tagId => tagId !== assignment.tag_id)
            );
            return newMap;
          });
        }
      )
      .subscribe();

    // REMOVIDO: Canal geral de mensagens que causava duplicação
    // O canal específico do lead já lida com as mensagens recebidas
    // e atualiza automaticamente o last_message_at através do banco

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(tagsChannel);
      supabase.removeChannel(tagAssignmentsChannel);
    };
  }, [location.state]);

  // Carregar mensagens quando um lead é selecionado e configurar realtime
  useEffect(() => {
    if (!selectedLead) return;
    
    console.log('🔧 Configurando canal de mensagens para lead:', selectedLead.id);
    loadMessages(selectedLead.id);

    // Configurar realtime para mensagens do lead selecionado
    const channelName = `messages-${selectedLead.id}-${Date.now()}`;
    const messagesChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensagens_chat',
          filter: `id_lead=eq.${selectedLead.id}`
        },
          (payload) => {
            console.log('📨 INSERT event recebido:', payload);
            const newMessage = payload.new as Message;
            
            // Tocar som de notificação se for mensagem recebida (ENTRADA = recebida do lead)
            if (newMessage.direcao === 'ENTRADA' && notificationSoundEnabled) {
              notificationAudioRef.current?.play().catch(err => {
                console.log('Erro ao tocar som de notificação:', err);
              });
            }
            
            setMessages(prev => {
              // VERIFICAÇÃO 1: Se tem evolution_message_id, procurar mensagem otimista para SUBSTITUIR
              if (newMessage.evolution_message_id) {
                const optimisticIndex = prev.findIndex(msg => 
                  msg.evolution_message_id === newMessage.evolution_message_id && msg.isOptimistic
                );
                
                if (optimisticIndex !== -1) {
                  console.log('🔄 SUBSTITUINDO mensagem otimista pela real:', newMessage.evolution_message_id);
                  const updated = [...prev];
                  const optimisticMessage = prev[optimisticIndex];
                  updated[optimisticIndex] = {
                    ...optimisticMessage,
                    ...newMessage,
                    // Se a mensagem real não tiver media_url (caso comum logo após o envio),
                    // preserva a URL local da mensagem otimista para manter a pré-visualização
                    media_url: newMessage.media_url || optimisticMessage.media_url,
                    isOptimistic: false,
                    sendError: false,
                  };
                  return updated;
                }
                
                // Se encontrou uma mensagem NÃO otimista com mesmo evolution_message_id, bloqueia duplicação
                const existsNonOptimistic = prev.some(msg => 
                  msg.evolution_message_id === newMessage.evolution_message_id && !msg.isOptimistic
                );
                if (existsNonOptimistic) {
                  console.log('❌ DUPLICATA BLOQUEADA (evolution_message_id já existe):', newMessage.evolution_message_id);
                  return prev;
                }
              }
              
              // VERIFICAÇÃO 2: Verificar por ID exato do banco
              if (prev.some(msg => msg.id === newMessage.id)) {
                console.log('❌ DUPLICATA BLOQUEADA (ID do banco já existe):', newMessage.id);
                return prev;
              }
              
              // VERIFICAÇÃO 3: Verificar por conteúdo + timestamp exato
              const exactMatch = prev.find(msg => 
                msg.corpo_mensagem === newMessage.corpo_mensagem &&
                msg.id_lead === newMessage.id_lead &&
                msg.direcao === newMessage.direcao &&
                msg.data_hora === newMessage.data_hora &&
                !msg.isOptimistic
              );
              
              if (exactMatch) {
                console.log('❌ DUPLICATA BLOQUEADA (conteúdo + timestamp)');
                return prev;
              }
              
              console.log('✅ ADICIONANDO mensagem nova do banco:', newMessage.id);
              return [...prev, newMessage];
            });
          }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'mensagens_chat',
          filter: `id_lead=eq.${selectedLead.id}`
        },
        (payload) => {
          console.log('📝 UPDATE event recebido:', payload);
          const updatedMessage = payload.new as Message;
          
          setMessages(prev => prev.map(msg =>
            msg.id === updatedMessage.id
              ? {
                  ...msg,
                  ...updatedMessage,
                  // Preserva informações de mídia se o UPDATE vier sem elas
                  media_url: updatedMessage.media_url || msg.media_url,
                  media_type: updatedMessage.media_type || msg.media_type,
                  media_metadata: updatedMessage.media_metadata || msg.media_metadata,
                }
              : msg
          ));
        }
      )
      .subscribe();

    // Configurar realtime para reações das mensagens
    const reactionsChannelName = `reactions-${selectedLead.id}-${Date.now()}`;
    const reactionsChannel = supabase
      .channel(reactionsChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions'
        },
        (payload) => {
          console.log('➕ Reação adicionada via realtime:', payload);
          const newReaction = payload.new as MessageReaction;
          
          setMessageReactions(prev => {
            const existing = prev.get(newReaction.message_id) || [];
            
            // Verificar se a reação já existe (evitar duplicação)
            const alreadyExists = existing.some(r => r.id === newReaction.id);
            if (alreadyExists) {
              console.log('ℹ️ Reação já existe no estado, pulando duplicação');
              return prev;
            }
            
            const updated = new Map(prev);
            updated.set(newReaction.message_id, [...existing, newReaction]);
            return updated;
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions'
        },
        (payload) => {
          console.log('➖ Reação removida via realtime:', payload);
          const deletedReaction = payload.old as MessageReaction;
          
          setMessageReactions(prev => {
            const existing = prev.get(deletedReaction.message_id) || [];
            const filtered = existing.filter(r => r.id !== deletedReaction.id);
            const updated = new Map(prev);
            
            if (filtered.length === 0) {
              updated.delete(deletedReaction.message_id);
            } else {
              updated.set(deletedReaction.message_id, filtered);
            }
            return updated;
          });
        }
      )
      .subscribe();

    // Configurar realtime para mensagens fixadas
    const pinnedChannelName = `pinned-${selectedLead.id}-${Date.now()}`;
    const pinnedChannel = supabase
      .channel(pinnedChannelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pinned_messages',
          filter: `lead_id=eq.${selectedLead.id}`
        },
        (payload) => {
          console.log('📌 Mensagem fixada:', payload);
          const newPinned = payload.new as PinnedMessage;
          setPinnedMessages(prev => new Set([...prev, newPinned.message_id]));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'pinned_messages',
          filter: `lead_id=eq.${selectedLead.id}`
        },
        (payload) => {
          console.log('📌 Mensagem desafixada:', payload);
          const deletedPinned = payload.old as PinnedMessage;
          setPinnedMessages(prev => {
            const newSet = new Set(prev);
            newSet.delete(deletedPinned.message_id);
            return newSet;
          });
        }
      )
      .subscribe();

    return () => {
      console.log('🧹 Removendo canal:', channelName);
      supabase.removeChannel(messagesChannel);
      console.log('🧹 Removendo canal de reações:', reactionsChannelName);
      supabase.removeChannel(reactionsChannel);
      console.log('🧹 Removendo canal de mensagens fixadas:', pinnedChannelName);
      supabase.removeChannel(pinnedChannel);
    };
  }, [selectedLead?.id]);

  // Atualiza presença em tempo quase em tempo real para o lead selecionado
  useEffect(() => {
    if (!selectedLead) return;

    // Dispara uma atualização imediata
    refreshPresenceForLead(selectedLead);

    // Atualiza a cada 30 segundos enquanto o chat estiver aberto
    const intervalId = setInterval(() => {
      refreshPresenceForLead(selectedLead);
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedLead]);

  // Auto-scroll para última mensagem
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // useEffect removido - o hook useOpusRecorder gerencia a limpeza internamente

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Auto-scroll para primeiro resultado da busca
  useEffect(() => {
    if (messageSearchQuery && firstSearchResultRef.current) {
      setCurrentSearchResultIndex(0);
      firstSearchResultRef.current.scrollIntoView({ 
        behavior: "smooth", 
        block: "center" 
      });
    } else if (!messageSearchQuery) {
      setCurrentSearchResultIndex(0);
      searchResultRefs.current.clear();
    }
  }, [messageSearchQuery]);

  // Scroll para resultado específico quando o índice muda
  useEffect(() => {
    const resultElement = searchResultRefs.current.get(currentSearchResultIndex);
    if (resultElement) {
      resultElement.scrollIntoView({ 
        behavior: "smooth", 
        block: "center" 
      });
    }
  }, [currentSearchResultIndex]);

  // Calcular total de resultados
  const searchResults = messages.filter(message => 
    messageSearchQuery.trim() && 
    message.corpo_mensagem
      .toLowerCase()
      .includes(messageSearchQuery.toLowerCase())
  );
  const totalSearchResults = searchResults.length;

  // Navegar entre resultados
  const goToNextResult = () => {
    if (currentSearchResultIndex < totalSearchResults - 1) {
      setCurrentSearchResultIndex(prev => prev + 1);
    }
  };

  const goToPreviousResult = () => {
    if (currentSearchResultIndex > 0) {
      setCurrentSearchResultIndex(prev => prev - 1);
    }
  };

  // Processa a fila de requisições de presença com delay para evitar rate limiting
  const processPresenceQueue = async () => {
    if (isProcessingQueue.current || presenceQueue.current.length === 0) return;
    
    console.log('📋 Processando fila de presença:', presenceQueue.current.length, 'itens');
    isProcessingQueue.current = true;
    let successCount = 0;

    while (presenceQueue.current.length > 0) {
      const item = presenceQueue.current.shift();
      if (!item) break;

      console.log('🔄 Processando item da fila:', { 
        leadName: item.lead.nome_lead, 
        instanceName: item.instanceName 
      });

      try {
        const { data: presenceData, error: presenceError } = await supabase.functions.invoke(
          'fetch-presence-status',
          {
            body: {
              instance_name: item.instanceName,
              phone_number: item.lead.telefone_lead,
              lead_id: item.lead.id,
            },
          }
        );

        console.log('📊 Resposta da edge function:', presenceData);

        if (!presenceError && presenceData?.success) {
          const isRateLimited = Boolean(presenceData.rate_limited);

          if (isRateLimited) {
            console.warn('⚠️ Evolution API retornou rate_limited para este número. Mantendo status anterior ou marcando como desconhecido.');

            setPresenceStatus(prev => {
              const next = new Map(prev);
              const current = next.get(item.lead.id);

              // Se já existe um status, apenas anotamos que foi rate limited
              if (current) {
                next.set(item.lead.id, {
                  ...current,
                  rateLimited: true,
                });
              } else {
                // Caso não exista status anterior, marcamos como desconhecido
                next.set(item.lead.id, {
                  isOnline: false,
                  status: 'unknown',
                  rateLimited: true,
                });
              }

              return next;
            });
          } else {
            console.log('✅ Status atualizado:', {
              isOnline: presenceData.is_online,
              lastSeen: presenceData.last_seen,
              status: presenceData.status,
            });

            setPresenceStatus(prev => new Map(prev).set(item.lead.id, {
              isOnline: presenceData.is_online,
              lastSeen: presenceData.last_seen,
              status: presenceData.status,
              rateLimited: false,
            }));

            successCount++;
          }
        } else {
          console.warn('⚠️ Falha ao atualizar status:', { presenceError, presenceData });
        }
      } catch (error) {
        console.error('❌ Erro ao processar item da fila:', error);
      }

      // Delay de 2 segundos entre requisições para evitar rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    isProcessingQueue.current = false;
    
    console.log('✅ Fila processada. Sucessos:', successCount);
    
    // Feedback visual ao usuário se houve sucesso
    if (successCount > 0 && loadingPresence) {
      setLoadingPresence(false);
    }
  };

  // Adiciona leads à fila de verificação de presença
  const fetchPresenceStatus = (lead: Lead, instanceName: string) => {
    presenceQueue.current.push({ lead, instanceName });
    processPresenceQueue();
  };

  // Função genérica para buscar presença de um lead específico
  const refreshPresenceForLead = async (lead: Lead) => {
    if (!lead || loadingPresence) return;

    console.log('🔄 Iniciando busca de presença para:', { 
      leadName: lead.nome_lead, 
      phone: lead.telefone_lead,
      leadId: lead.id 
    });

    setLoadingPresence(true);
    
    try {
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("*")
        .eq("status", "CONNECTED")
        .limit(1)
        .single();

      if (!instances?.instance_name) {
        console.warn('⚠️ Nenhuma instância WhatsApp conectada encontrada');
        toast({
          title: "Erro",
          description: "Nenhuma instância WhatsApp conectada",
          variant: "destructive",
        });
        setLoadingPresence(false);
        return;
      }

      console.log('✅ Instância encontrada:', instances.instance_name);
      fetchPresenceStatus(lead, instances.instance_name);
    } catch (error) {
      console.error('❌ Erro ao buscar status de presença:', error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o status",
        variant: "destructive",
      });
      setLoadingPresence(false);
    }
  };

  // Função para buscar presença do lead atual manualmente (botão no cabeçalho)
  const handleRefreshPresence = async () => {
    if (!selectedLead) return;
    await refreshPresenceForLead(selectedLead);
  };

  const loadLeads = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      const leadsData = data || [];
      setLeads(leadsData);

      // Hidratar status de presença a partir dos campos is_online/last_seen do banco
      const initialPresence = new Map<string, { isOnline: boolean; lastSeen?: string }>();
      leadsData.forEach((lead) => {
        if (lead.is_online !== null || lead.last_seen) {
          initialPresence.set(lead.id, {
            isOnline: !!lead.is_online,
            lastSeen: lead.last_seen || undefined,
          });
        }
      });
      setPresenceStatus(initialPresence);
      
      // Carregar etiquetas dos leads
      await loadLeadTagsAssignments(leadsData.map(l => l.id));
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os contatos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableTags = async () => {
    try {
      const { data: orgData } = await supabase.rpc("get_user_organization_id", {
        _user_id: user?.id,
      });

      if (!orgData) return;

      const { data, error } = await supabase
        .from("lead_tags")
        .select("*")
        .eq("organization_id", orgData)
        .order("name");

      if (error) throw error;
      setAvailableTags(data || []);
    } catch (error) {
      console.error("Erro ao carregar etiquetas:", error);
    }
  };

  const loadLeadTagsAssignments = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    try {
      const { data, error } = await supabase
        .from("lead_tag_assignments")
        .select("lead_id, tag_id")
        .in("lead_id", leadIds);

      if (error) throw error;

      const tagsMap = new Map<string, string[]>();
      data?.forEach((assignment) => {
        const existing = tagsMap.get(assignment.lead_id) || [];
        tagsMap.set(assignment.lead_id, [...existing, assignment.tag_id]);
      });

      setLeadTagsMap(tagsMap);
    } catch (error) {
      console.error("Erro ao carregar atribuições de etiquetas:", error);
    }
  };

  const loadMessages = async (leadId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("mensagens_chat")
        .select("*")
        .eq("id_lead", leadId)
        .order("data_hora", { ascending: true});

      if (error) throw error;

      // Bucket chat-media é público, então podemos usar as URLs diretamente
      setMessages(data as Message[]);
      
      // Carregar reações para todas as mensagens
      if (data && data.length > 0) {
        await loadReactions(data.map(m => m.id));
      }
      
      // Carregar mensagens fixadas
      await loadPinnedMessages(leadId);
    } catch (error) {
      console.error("Erro ao carregar mensagens:", error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar as mensagens",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Função para carregar reações das mensagens
  const loadReactions = async (messageIds: string[]) => {
    try {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("*")
        .in("message_id", messageIds);

      if (error) throw error;

      const reactionsMap = new Map<string, MessageReaction[]>();
      data.forEach((reaction) => {
        const existing = reactionsMap.get(reaction.message_id) || [];
        reactionsMap.set(reaction.message_id, [...existing, reaction as MessageReaction]);
      });

      setMessageReactions(reactionsMap);
    } catch (error) {
      console.error("Erro ao carregar reações:", error);
    }
  };

  // Função para adicionar ou remover reação
  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!user || !selectedLead) return;

    try {
      const currentReactions = messageReactions.get(messageId) || [];
      const userReaction = currentReactions.find(
        (r) => r.user_id === user.id && r.emoji === emoji,
      );

      if (userReaction) {
        // Remover reação
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("id", userReaction.id);

        if (error) throw error;

        // Atualizar estado local
        const updated = currentReactions.filter((r) => r.id !== userReaction.id);
        const newMap = new Map(messageReactions);
        if (updated.length === 0) {
          newMap.delete(messageId);
        } else {
          newMap.set(messageId, updated);
        }
        setMessageReactions(newMap);
      } else {
        // Adicionar reação
        const { data, error } = await supabase
          .from("message_reactions")
          .insert({
            message_id: messageId,
            user_id: user.id,
            emoji: emoji,
          })
          .select()
          .single();

        if (error) throw error;

        // Atualizar estado local (o realtime também vai atualizar, mas isso deixa mais rápido)
        const newMap = new Map(messageReactions);
        newMap.set(messageId, [...currentReactions, data as MessageReaction]);
        setMessageReactions(newMap);

        // Enviar reação para o WhatsApp via Edge Function
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            console.error("❌ Sem token de sessão");
            return;
          }

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp-reaction`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                message_id: messageId,
                emoji,
                lead_id: selectedLead.id,
              }),
            },
          );

          if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ Erro ao enviar reação para WhatsApp:", errorData);
          } else {
            const responseData = await response.json();
            console.log("✅ Reação enviada para WhatsApp com sucesso:", responseData);
          }
        } catch (whatsappError) {
          console.error("❌ Erro ao enviar reação para WhatsApp:", whatsappError);
        }
      }

      // Fechar popover e dropdown
      setReactionPopoverOpen(null);
      const newStates = new Map(dropdownOpenStates);
      newStates.delete(messageId);
      setDropdownOpenStates(newStates);
    } catch (error) {
      console.error("Erro ao adicionar/remover reação:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a reação",
        variant: "destructive",
      });
    }
  };

  // Função para carregar mensagens fixadas
  const loadPinnedMessages = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from("pinned_messages")
        .select("message_id")
        .eq("lead_id", leadId);

      if (error) throw error;

      const pinnedSet = new Set(data.map(pm => pm.message_id));
      setPinnedMessages(pinnedSet);
    } catch (error) {
      console.error("Erro ao carregar mensagens fixadas:", error);
    }
  };

  // Função para fixar/desfixar mensagem
  const togglePinMessage = async (message: Message) => {
    if (!user || !selectedLead) return;

    try {
      const isPinned = pinnedMessages.has(message.id);

      if (isPinned) {
        // Desfixar mensagem
        const { error } = await supabase
          .from("pinned_messages")
          .delete()
          .eq("message_id", message.id)
          .eq("lead_id", selectedLead.id);

        if (error) throw error;

        setPinnedMessages(prev => {
          const newSet = new Set(prev);
          newSet.delete(message.id);
          return newSet;
        });

        toast({
          title: "Mensagem desafixada",
          description: "A mensagem foi removida das fixadas",
        });
      } else {
        // Fixar mensagem (máximo 3 mensagens fixadas)
        if (pinnedMessages.size >= 3) {
          toast({
            title: "Limite atingido",
            description: "Você pode fixar no máximo 3 mensagens por conversa",
            variant: "destructive",
          });
          return;
        }

        const { error } = await supabase
          .from("pinned_messages")
          .insert({
            message_id: message.id,
            lead_id: selectedLead.id,
            pinned_by: user.id,
          });

        if (error) throw error;

        setPinnedMessages(prev => new Set([...prev, message.id]));

        toast({
          title: "Mensagem fixada",
          description: "A mensagem foi fixada no topo do chat",
        });
      }
    } catch (error) {
      console.error("Erro ao fixar/desfixar mensagem:", error);
      toast({
        title: "Erro",
        description: "Não foi possível atualizar a mensagem",
        variant: "destructive",
      });
    }
  };

  // Função para fixar/desfixar lead
  const togglePinLead = (leadId: string) => {
    setPinnedLeads((prev) => {
      const newPinned = prev.includes(leadId)
        ? prev.filter((id) => id !== leadId)
        : [leadId, ...prev];
      
      // Salvar no localStorage
      localStorage.setItem('pinnedLeads', JSON.stringify(newPinned));
      
      toast({
        title: prev.includes(leadId) ? "Contato desafixado" : "Contato fixado",
        description: prev.includes(leadId) 
          ? "O contato foi removido dos fixados" 
          : "O contato foi fixado no topo da lista",
      });
      
      return newPinned;
    });
  };

  // Função para abrir gerenciador de etiquetas para um lead específico
  const openTagsManagerForLead = (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (lead) {
      setSelectedLead(lead);
      setLeadTagsOpen(true);
    }
  };

  // Função para abrir dialog de confirmação de remoção de etiquetas
  const handleRemoveAllTags = (leadId: string) => {
    const leadTagIds = leadTagsMap.get(leadId) || [];
    
    if (leadTagIds.length === 0) {
      toast({
        title: "Nenhuma etiqueta",
        description: "Este lead não possui etiquetas para remover",
      });
      return;
    }

    setLeadToRemoveTags(leadId);
    setSelectedTagsToRemove(leadTagIds); // Inicialmente, todas as tags estão selecionadas
    setRemoveTagsDialogOpen(true);
  };

  // Função para alternar seleção de tag para remoção
  const toggleTagSelection = (tagId: string) => {
    setSelectedTagsToRemove(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Função para confirmar remoção das etiquetas selecionadas
  const confirmRemoveAllTags = async () => {
    if (!leadToRemoveTags || selectedTagsToRemove.length === 0) return;

    try {
      const { error } = await supabase
        .from('lead_tag_assignments')
        .delete()
        .eq('lead_id', leadToRemoveTags)
        .in('tag_id', selectedTagsToRemove);

      if (error) throw error;

      // Atualizar estado local imediatamente para refletir remoção
      setLeadTagsMap(prev => {
        const newMap = new Map(prev);
        const current = newMap.get(leadToRemoveTags) || [];
        newMap.set(
          leadToRemoveTags,
          current.filter(id => !selectedTagsToRemove.includes(id))
        );
        return newMap;
      });

      toast({
        title: "Etiquetas removidas",
        description: `${selectedTagsToRemove.length} etiqueta(s) removida(s) com sucesso`,
      });

      // O realtime vai atualizar automaticamente o leadTagsMap
    } catch (error) {
      console.error('Error removing tags:', error);
      toast({
        title: "Erro",
        description: "Não foi possível remover as etiquetas",
        variant: "destructive",
      });
    } finally {
      setRemoveTagsDialogOpen(false);
      setLeadToRemoveTags(null);
      setSelectedTagsToRemove([]);
    }
  };

  // Função para lidar com o fim do drag and drop
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPinnedLeads((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        
        const newOrder = arrayMove(items, oldIndex, newIndex);
        
        // Salvar nova ordem no localStorage
        localStorage.setItem('pinnedLeads', JSON.stringify(newOrder));
        
        return newOrder;
      });
    }
  };

  // Funções para iniciar/parar gravação com OPUS
  const startRecording = async () => {
    try {
      await opusRecorder.startRecording();
      toast({
        title: 'Gravando áudio OPUS',
        description: 'Clique novamente para parar e enviar',
      });
    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      toast({
        title: 'Erro ao gravar',
        description: 'Não foi possível acessar o microfone',
        variant: 'destructive',
      });
    }
  };

  const stopRecording = () => {
    opusRecorder.stopRecording();
  };

  // Função para enviar áudio OGG/OPUS
  const sendAudio = async (audioBlob: Blob) => {
    if (!selectedLead || sendingAudio) return;

    console.log('📤 Preparando envio de áudio OGG/OPUS:', {
      size: audioBlob.size,
      type: audioBlob.type,
      duration: opusRecorder.recordingTime
    });

    setSendingAudio(true);

    try {
      // Buscar a organização do usuário
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Usuário não autenticado');

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .single();

      if (memberError || !memberData) {
        throw new Error('Erro ao buscar organização do usuário.');
      }

      // Buscar a instância conectada
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, id, status')
        .eq('organization_id', memberData.organization_id)
        .eq('status', 'CONNECTED')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instanceError || !instanceData) {
        throw new Error('Nenhuma instância WhatsApp conectada.');
      }

      // Converter áudio para base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const base64Data = base64.split(',')[1];

        console.log('📤 Enviando áudio OGG/OPUS para Evolution:', {
          duration: opusRecorder.recordingTime,
          instance: instanceData.instance_name,
          to: selectedLead.telefone_lead,
          mimeType: 'audio/ogg; codecs=opus',
          isPTT: true
        });

        // Criar mensagem otimista
        const optimisticMessageId = `optimistic-audio-${Date.now()}`;
        const optimisticMessage: Message = {
          id: optimisticMessageId,
          id_lead: selectedLead.id,
          direcao: 'SAIDA',
          corpo_mensagem: '',
          data_hora: new Date().toISOString(),
          evolution_message_id: null,
          status_entrega: null,
          created_at: new Date().toISOString(),
          media_type: 'audio',
          media_url: URL.createObjectURL(audioBlob),
          media_metadata: { seconds: opusRecorder.recordingTime },
          isOptimistic: true,
          sendError: false,
        };

        setMessages(prev => [...prev, optimisticMessage]);

        try {
          // Enviar áudio via edge function
          const { data, error } = await supabase.functions.invoke('send-whatsapp-media', {
            body: {
              instance_name: instanceData.instance_name,
              remoteJid: selectedLead.telefone_lead,
              media_base64: base64Data,
              media_type: 'audio',
              file_name: `audio-${Date.now()}.ogg`,
              mime_type: 'audio/ogg; codecs=opus',
              caption: '',
              leadId: selectedLead.id,
              is_ptt: true, // Marcar como áudio PTT (gravado)
            },
          });

          if (error || !data?.success) {
            throw new Error(data?.error || 'Erro ao enviar áudio');
          }

          console.log('✅ Áudio enviado com sucesso:', data);

          // Atualizar mensagem otimista
          setMessages(prev => prev.map(msg => 
            msg.id === optimisticMessageId 
              ? { 
                  ...msg, 
                  evolution_message_id: data.messageId,
                  status_entrega: 'SENT' as const,
                  media_url: data.mediaUrl || msg.media_url
                }
              : msg
          ));

          toast({
            title: "Áudio enviado",
            description: "O áudio foi enviado via WhatsApp",
          });
        } catch (error) {
          console.error('❌ Erro ao enviar áudio:', error);
          
          // Marcar mensagem com erro
          setMessages(prev => prev.map(msg =>
            msg.id === optimisticMessageId
              ? { ...msg, sendError: true }
              : msg
          ));

          toast({
            title: "Erro ao enviar áudio",
            description: error instanceof Error ? error.message : "Não foi possível enviar o áudio",
            variant: "destructive",
          });
        } finally {
          setSendingAudio(false);
          setAudioBlob(null);
        }
      };

      reader.onerror = () => {
        toast({
          title: "Erro ao processar áudio",
          description: "Não foi possível processar o áudio gravado",
          variant: "destructive",
        });
        setSendingAudio(false);
        setAudioBlob(null);
      };

      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('❌ Erro ao preparar envio de áudio:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível enviar o áudio",
        variant: "destructive",
      });
      setSendingAudio(false);
      setAudioBlob(null);
    }
  };

  // Função para lidar com seleção de arquivo
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Verificar tamanho do arquivo (limite de 16MB como no WhatsApp)
      const maxSize = 16 * 1024 * 1024; // 16MB
      if (file.size > maxSize) {
        toast({
          title: "Arquivo muito grande",
          description: "O arquivo deve ter no máximo 16MB",
          variant: "destructive",
        });
        return;
      }
      
      setSelectedFile(file);
      sendFile(file);
    }
  };

  // Função para enviar arquivo
  const sendFile = async (file: File) => {
    if (!selectedLead) return;

    setSendingFile(true);

    try {
      // Buscar a organização do usuário
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Usuário não autenticado');

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .single();

      if (memberError || !memberData) {
        throw new Error('Erro ao buscar organização do usuário.');
      }

      // Buscar a instância conectada
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, id, status')
        .eq('organization_id', memberData.organization_id)
        .eq('status', 'CONNECTED')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instanceError || !instanceData) {
        throw new Error('Nenhuma instância WhatsApp conectada.');
      }

      // Converter arquivo para base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        const base64Data = base64.split(',')[1]; // Remover o prefixo data:...

        console.log('📤 Enviando arquivo:', {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          instance: instanceData.instance_name,
          to: selectedLead.telefone_lead
        });

        // Criar mensagem otimista (sem texto no corpo, só a mídia)
        const optimisticMessageId = `optimistic-file-${Date.now()}`;
        const optimisticMessage: Message = {
          id: optimisticMessageId,
          id_lead: selectedLead.id,
          direcao: 'SAIDA',
          corpo_mensagem: file.type.startsWith('image/') ? '' : `[${file.name}]`,
          data_hora: new Date().toISOString(),
          evolution_message_id: null,
          status_entrega: null,
          created_at: new Date().toISOString(),
          media_type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'document',
          media_url: URL.createObjectURL(file),
          isOptimistic: true,
          sendError: false,
        };

        setMessages(prev => [...prev, optimisticMessage]);

        try {
          // Determinar o tipo de mídia
          let mediaType = 'document';
          if (file.type.startsWith('image/')) {
            mediaType = 'image';
          } else if (file.type.startsWith('video/')) {
            mediaType = 'video';
          } else if (file.type.startsWith('audio/')) {
            mediaType = 'audio';
          }

          // Enviar arquivo via edge function (sem caption extra para imagens)
          const { data, error } = await supabase.functions.invoke('send-whatsapp-media', {
            body: {
              instance_name: instanceData.instance_name,
              remoteJid: selectedLead.telefone_lead,
              media_base64: base64Data,
              media_type: mediaType,
              file_name: file.name,
              mime_type: file.type,
              caption: '', // Sem caption extra, deixar a imagem falar por si
              leadId: selectedLead.id,
            },
          });

          if (error || !data?.success) {
            throw new Error(data?.error || 'Erro ao enviar arquivo');
          }

          console.log('✅ Arquivo enviado com sucesso:', data);

          // Atualizar mensagem otimista
          setMessages(prev => prev.map(msg => 
            msg.id === optimisticMessageId 
              ? { 
                  ...msg, 
                  evolution_message_id: data.messageId,
                  status_entrega: 'SENT' as const,
                  media_url: data.mediaUrl || msg.media_url
                }
              : msg
          ));

          toast({
            title: "Arquivo enviado",
            description: "O arquivo foi enviado via WhatsApp",
          });
        } catch (error) {
          console.error('❌ Erro ao enviar arquivo:', error);
          
          // Marcar mensagem com erro
          setMessages(prev => prev.map(msg =>
            msg.id === optimisticMessageId
              ? { ...msg, sendError: true }
              : msg
          ));

          toast({
            title: "Erro ao enviar arquivo",
            description: error instanceof Error ? error.message : "Não foi possível enviar o arquivo",
            variant: "destructive",
          });
        } finally {
          setSendingFile(false);
          setSelectedFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };

      reader.onerror = () => {
        toast({
          title: "Erro ao ler arquivo",
          description: "Não foi possível ler o arquivo selecionado",
          variant: "destructive",
        });
        setSendingFile(false);
        setSelectedFile(null);
      };

      reader.readAsDataURL(file);
    } catch (error) {
      console.error('❌ Erro ao preparar envio de arquivo:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Não foi possível enviar o arquivo",
        variant: "destructive",
      });
      setSendingFile(false);
      setSelectedFile(null);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || !selectedLead) return;

    // Criar mensagem otimista IMEDIATAMENTE
    const optimisticMessageId = `optimistic-${Date.now()}`;
    const messageForCRM = `${currentUserName}:\n${text.trim()}`;
    const messageForEvolution = `*${currentUserName}:*\n${text.trim()}`;
    
    const optimisticMessage: Message = {
      id: optimisticMessageId,
      id_lead: selectedLead.id,
      direcao: 'SAIDA',
      corpo_mensagem: messageForCRM,
      data_hora: new Date().toISOString(),
      evolution_message_id: null,
      status_entrega: null,
      created_at: new Date().toISOString(),
      isOptimistic: true,
      sendError: false,
    };

    // Adicionar mensagem otimista IMEDIATAMENTE ao estado
    setMessages(prev => [...prev, optimisticMessage]);
    setNewMessage(""); // Limpar input imediatamente
    
    // Retornar foco ao input para permitir digitação contínua
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 0);
    
    setSending(true);
    
    // Criar um timeout para a operação
    const timeoutDuration = 30000; // 30 segundos
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Timeout: A operação demorou muito. Verifique sua conexão.')), timeoutDuration);
    });

    try {
      // Buscar a organização do usuário
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Usuário não autenticado');

      const { data: memberData, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', currentUser.id)
        .single();

      if (memberError || !memberData) {
        console.error('❌ Erro ao buscar organização:', memberError);
        throw new Error('Erro ao buscar organização do usuário.');
      }

      // Buscar a instância conectada da organização
      const { data: instanceData, error: instanceError } = await supabase
        .from('whatsapp_instances')
        .select('instance_name, id, status')
        .eq('organization_id', memberData.organization_id)
        .eq('status', 'CONNECTED')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (instanceError) {
        console.error('❌ Erro ao buscar instância:', instanceError);
        throw new Error('Erro ao buscar instância WhatsApp. Tente novamente.');
      }

      if (!instanceData) {
        console.warn('⚠️ Nenhuma instância conectada encontrada para a organização');
        throw new Error('Nenhuma instância WhatsApp conectada. Por favor, peça ao administrador para conectar o WhatsApp nas Configurações.');
      }

      console.log('📱 Instância encontrada:', {
        name: instanceData.instance_name,
        id: instanceData.id,
        status: instanceData.status
      });

      console.log('📤 Enviando mensagem:', {
        instance: instanceData.instance_name,
        to: selectedLead.telefone_lead,
        message: messageForEvolution
      });

      // Call edge function com timeout usando Promise.race
      const invokePromise = supabase.functions.invoke('send-whatsapp-message', {
        body: {
          instance_name: instanceData.instance_name,
          remoteJid: selectedLead.telefone_lead,
          message_text: messageForEvolution,
          leadId: selectedLead.id,
        },
      });

      const response = await Promise.race([invokePromise, timeoutPromise]) as { data: any; error: any };
      const { data, error } = response;

      if (error) {
        console.error('❌ Erro na invocação da função:', error);
        // Tratamento especial para erros de conexão
        if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
        }
        throw error;
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 'Erro desconhecido ao enviar mensagem';
        console.error('❌ Resposta de erro da função:', data);
        throw new Error(errorMessage);
      }

      console.log('✅ Mensagem enviada com sucesso:', {
        messageId: data.messageId,
        evolutionData: data.evolutionData
      });

      // Atualizar mensagem otimista com o evolution_message_id para permitir deduplicação
      setMessages(prev => prev.map(msg => 
        msg.id === optimisticMessageId 
          ? { 
              ...msg, 
              evolution_message_id: data.messageId,
              status_entrega: 'SENT' as const
            }
          : msg
      ));

      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada via WhatsApp",
      });
      
      // Garantir foco no input após envio bem-sucedido
      messageInputRef.current?.focus();
    } catch (error: any) {
      console.error("❌ Erro ao enviar mensagem:", error);
      
      // Extrair mensagem de erro mais específica
      let errorMessage = "Não foi possível enviar a mensagem";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.name === 'AbortError' || error.message?.includes('Timeout')) {
        errorMessage = "A operação demorou muito. Verifique sua conexão e tente novamente.";
      }

      // Marcar mensagem otimista com erro
      setMessages(prev => prev.map(msg => 
        msg.id === optimisticMessageId 
          ? { ...msg, sendError: true, errorMessage }
          : msg
      ));
      
      toast({
        title: "Erro ao enviar",
        description: errorMessage,
        variant: "destructive",
      });
      
      // Retornar foco ao input mesmo em caso de erro
      messageInputRef.current?.focus();
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  };

  // Ao clicar em um lead na lista, seleciona e já dispara verificação de presença
  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    refreshPresenceForLead(lead);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarUrl = (lead: Lead) => {
    if (lead.avatar_url) return lead.avatar_url;
    // Gera avatar com UI Avatars quando não há foto
    const initials = getInitials(lead.nome_lead);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&color=fff&size=128`;
  };

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case "SENT":
        return <Check className="h-3 w-3" />;
      case "DELIVERED":
        return <CheckCheck className="h-3 w-3" />;
      case "READ":
        return <CheckCheck className="h-3 w-3 text-primary" />;
      default:
        return <Clock className="h-3 w-3" />;
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Filtrar e ordenar leads
  const baseFilteredLeads = leads.filter((lead) => {
    // Filtro de busca por nome ou telefone
    const matchesSearch =
      lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.telefone_lead.includes(searchQuery);

    // Filtro por etiquetas selecionadas
    if (selectedTagIds.length > 0) {
      const leadTags = leadTagsMap.get(lead.id) || [];
      const hasSelectedTag = selectedTagIds.some((tagId) =>
        leadTags.includes(tagId)
      );
      return matchesSearch && hasSelectedTag;
    }

    return matchesSearch;
  });

  // Separar leads fixados dos não fixados
  const pinnedFilteredLeads = baseFilteredLeads
    .filter((lead) => pinnedLeads.includes(lead.id))
    .sort((a, b) => {
      // Manter ordem de pinnedLeads para arrastar e soltar
      return pinnedLeads.indexOf(a.id) - pinnedLeads.indexOf(b.id);
    });

  const unpinnedFilteredLeads = baseFilteredLeads
    .filter((lead) => !pinnedLeads.includes(lead.id))
    .sort((a, b) => {
      switch (filterOption) {
        case "alphabetical":
          return a.nome_lead.localeCompare(b.nome_lead);
        case "created":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "last_interaction":
          const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
          const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
          return bTime - aTime;
        default:
          return 0;
      }
    });

  // Componente de lead com suporte a arrastar e soltar
  interface SortableLeadItemProps {
    lead: Lead;
    isSelected: boolean;
    onLeadClick: (lead: Lead) => void;
    onAvatarClick: (url: string, name: string) => void;
    onTogglePin: (leadId: string) => void;
    onOpenTags: (leadId: string) => void;
    onRemoveTags: (leadId: string) => void;
  }

  const SortableLeadItem = ({
    lead,
    isSelected,
    onLeadClick,
    onAvatarClick,
    onTogglePin,
    onOpenTags,
    onRemoveTags,
  }: SortableLeadItemProps) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: lead.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              {...attributes}
              {...listeners}
              onClick={() => onLeadClick(lead)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background/60 transition-colors cursor-grab active:cursor-grabbing ${
                isSelected ? "bg-background shadow-sm" : ""
              }`}
            >
              <div className="relative">
                <Avatar
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (lead.avatar_url) {
                      onAvatarClick(lead.avatar_url, lead.nome_lead);
                    }
                  }}
                >
                  <AvatarImage src={getAvatarUrl(lead)} alt={lead.nome_lead} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {getInitials(lead.nome_lead)}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                    presenceStatus.get(lead.id)?.isOnline
                      ? "bg-green-500 animate-pulse shadow-lg shadow-green-500/50"
                      : presenceStatus.get(lead.id)?.lastSeen
                      ? "bg-orange-400"
                      : presenceStatus.get(lead.id)
                      ? "bg-gray-400"
                      : "bg-gray-500 opacity-30"
                  }`}
                  title={
                    presenceStatus.get(lead.id)?.isOnline
                      ? "🟢 Online agora"
                      : presenceStatus.get(lead.id)?.lastSeen
                      ? `🟠 Visto: ${new Date(
                          presenceStatus.get(lead.id)!.lastSeen!
                        ).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}`
                      : presenceStatus.get(lead.id)
                      ? "⚪ Offline"
                      : "⚫ Status desconhecido"
                  }
                />
              </div>
              <div className="flex-1 text-left overflow-hidden min-w-0">
                <div className="flex items-center gap-1.5 min-w-0 w-full">
                  <Pin className="h-3 w-3 text-primary fill-primary flex-shrink-0" />
                  <p className="font-medium truncate min-w-0 max-w-[45%]">{lead.nome_lead}</p>
                  {presenceStatus.get(lead.id)?.isOnline && (
                    <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 whitespace-nowrap">Online</span>
                  )}
                  <div className="flex-shrink-0 flex gap-1">
                    <LeadTagsBadge leadId={lead.id} version={(leadTagsMap.get(lead.id) || []).join(',')} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                  <Phone className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{formatPhoneNumber(lead.telefone_lead)}</span>
                </p>
              </div>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={() => onTogglePin(lead.id)}>
              <PinOff className="mr-2 h-4 w-4" />
              <span>Desafixar conversa</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onOpenTags(lead.id)}>
              <Tag className="mr-2 h-4 w-4" />
              <span>Adicionar etiquetas</span>
            </ContextMenuItem>
            {(leadTagsMap.get(lead.id)?.length || 0) > 0 && (
              <ContextMenuItem onClick={() => onRemoveTags(lead.id)}>
                <Tag className="mr-2 h-4 w-4" />
                <span>Remover etiquetas</span>
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
      </div>
    );
  };

  // Calcular quantos filtros estão ativos
  const activeFiltersCount = (filterOption !== "none" ? 1 : 0) + selectedTagIds.length;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Lista de Leads - Coluna Esquerda */}
      <Card className="w-80 flex flex-col overflow-hidden h-full">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Conversas</h2>
            <div className="flex gap-1">
              <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`relative ${activeFiltersCount > 0 ? "text-primary" : ""}`}
                  >
                    <Filter className="h-4 w-4" />
                    {activeFiltersCount > 0 && (
                      <Badge 
                        variant="default" 
                        className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] rounded-full"
                      >
                        {activeFiltersCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 z-[100]" align="end">
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm mb-3">Ordenar por</h4>
                    <button
                      onClick={() => {
                        setFilterOption("alphabetical");
                        setFilterPopoverOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded hover:bg-muted transition-colors ${
                        filterOption === "alphabetical" ? "bg-muted font-medium" : ""
                      }`}
                    >
                      Ordem alfabética (A-Z)
                    </button>
                    <button
                      onClick={() => {
                        setFilterOption("created");
                        setFilterPopoverOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded hover:bg-muted transition-colors ${
                        filterOption === "created" ? "bg-muted font-medium" : ""
                      }`}
                    >
                      Mais recentes primeiro
                    </button>
                    <button
                      onClick={() => {
                        setFilterOption("last_interaction");
                        setFilterPopoverOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded hover:bg-muted transition-colors ${
                        filterOption === "last_interaction" ? "bg-muted font-medium" : ""
                      }`}
                    >
                      Última interação
                    </button>
                    
                    {availableTags.length > 0 && (
                      <>
                        <div className="border-t my-2" />
                        <h4 className="font-semibold text-sm mb-2">Filtrar por etiquetas</h4>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {availableTags.map((tag) => (
                            <button
                              key={tag.id}
                              onClick={() => {
                                setSelectedTagIds((prev) =>
                                  prev.includes(tag.id)
                                    ? prev.filter((id) => id !== tag.id)
                                    : [...prev, tag.id]
                                );
                              }}
                              className="w-full flex items-center gap-2 p-2 rounded hover:bg-muted transition-colors text-sm"
                            >
                              <div
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                  selectedTagIds.includes(tag.id)
                                    ? "bg-primary border-primary"
                                    : "border-input"
                                }`}
                              >
                                {selectedTagIds.includes(tag.id) && (
                                  <Check className="w-3 h-3 text-primary-foreground" />
                                )}
                              </div>
                              <div
                                className="w-3 h-3 rounded-full shrink-0"
                                style={{ backgroundColor: tag.color }}
                              />
                              <span className="flex-1 text-left truncate">{tag.name}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}

                    {(filterOption !== "none" || selectedTagIds.length > 0) && (
                      <>
                        <div className="border-t my-2" />
                        <button
                          onClick={() => {
                            setFilterOption("none");
                            setSelectedTagIds([]);
                            setFilterPopoverOpen(false);
                          }}
                          className="w-full text-left p-2 rounded hover:bg-muted transition-colors text-muted-foreground"
                        >
                          Limpar todos os filtros
                        </button>
                      </>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManageTagsOpen(true)}
                className="gap-2"
              >
                <Tag className="h-4 w-4" />
                Etiquetas
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar contato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="mx-4 mt-2 grid w-[calc(100%-2rem)] grid-cols-2">
            <TabsTrigger value="all" className="text-sm">
              Tudo
            </TabsTrigger>
            <TabsTrigger value="pinned" className="text-sm gap-1">
              Fixados
              {pinnedFilteredLeads.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                  {pinnedFilteredLeads.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {loading && !selectedLead ? (
            <LoadingAnimation text="Carregando leads..." />
          ) : (
            <>
              {/* Aba: Tudo */}
              <TabsContent value="all" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  {pinnedFilteredLeads.length === 0 && unpinnedFilteredLeads.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <p>Nenhum contato encontrado</p>
                    </div>
                  ) : (
                    <div className="space-y-1 p-2">
                      {/* Todas as Conversas (sem fixadas) */}
                      {unpinnedFilteredLeads.map((lead) => (
                            <ContextMenu key={lead.id}>
                              <ContextMenuTrigger asChild>
                                <button
                                  onClick={() => handleLeadClick(lead)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors ${
                                    selectedLead?.id === lead.id ? "bg-muted" : ""
                                  }`}
                                >
                                  <div className="relative">
                                    <Avatar
                                      className="cursor-pointer hover:opacity-80 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (lead.avatar_url) {
                                          setViewingAvatar({ url: lead.avatar_url, name: lead.nome_lead });
                                        }
                                      }}
                                    >
                                      <AvatarImage src={getAvatarUrl(lead)} alt={lead.nome_lead} />
                                      <AvatarFallback className="bg-primary/10 text-primary">
                                        {getInitials(lead.nome_lead)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div
                                      className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                                        presenceStatus.get(lead.id)?.isOnline
                                          ? "bg-green-500 animate-pulse shadow-lg shadow-green-500/50"
                                          : presenceStatus.get(lead.id)?.lastSeen
                                          ? "bg-orange-400"
                                          : presenceStatus.get(lead.id)
                                          ? "bg-gray-400"
                                          : "bg-gray-500 opacity-30"
                                      }`}
                                      title={
                                        presenceStatus.get(lead.id)?.isOnline
                                          ? "🟢 Online agora"
                                          : presenceStatus.get(lead.id)?.lastSeen
                                          ? `🟠 Visto: ${new Date(
                                              presenceStatus.get(lead.id)!.lastSeen!
                                            ).toLocaleString("pt-BR", {
                                              day: "2-digit",
                                              month: "2-digit",
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            })}`
                                          : presenceStatus.get(lead.id)
                                          ? "⚪ Offline"
                                          : "⚫ Status desconhecido"
                                      }
                                    />
                                  </div>
                                  <div className="flex-1 text-left overflow-hidden min-w-0">
                                    <div className="flex items-center gap-1.5 min-w-0 w-full">
                                      <p className="font-medium truncate min-w-0 max-w-[45%]">{lead.nome_lead}</p>
                                      {presenceStatus.get(lead.id)?.isOnline && (
                                        <span className="text-xs text-green-600 dark:text-green-400 font-medium flex-shrink-0 whitespace-nowrap">Online</span>
                                      )}
                                      <div className="flex-shrink-0 flex gap-1">
                                        <LeadTagsBadge leadId={lead.id} version={(leadTagsMap.get(lead.id) || []).join(',')} />
                                      </div>
                                    </div>
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                                      <Phone className="h-3 w-3 flex-shrink-0" />
                                      <span className="truncate">{formatPhoneNumber(lead.telefone_lead)}</span>
                                    </p>
                                  </div>
                                </button>
                              </ContextMenuTrigger>
                              <ContextMenuContent className="w-56">
                                <ContextMenuItem onClick={() => togglePinLead(lead.id)}>
                                  <Pin className="mr-2 h-4 w-4" />
                                  <span>Fixar conversa</span>
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => openTagsManagerForLead(lead.id)}>
                                  <Tag className="mr-2 h-4 w-4" />
                                  <span>Adicionar etiquetas</span>
                                </ContextMenuItem>
                                {(leadTagsMap.get(lead.id)?.length || 0) > 0 && (
                                  <ContextMenuItem onClick={() => handleRemoveAllTags(lead.id)}>
                                    <Tag className="mr-2 h-4 w-4" />
                                    <span>Remover etiquetas</span>
                                  </ContextMenuItem>
                                )}
                                </ContextMenuContent>
                            </ContextMenu>
                          ))}
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Aba: Fixados */}
              <TabsContent value="pinned" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
                <ScrollArea className="flex-1">
                  {pinnedFilteredLeads.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <Pin className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">Nenhuma conversa fixada</p>
                      <p className="text-sm mt-1">
                        Clique com o botão direito em uma conversa e selecione "Fixar conversa"
                      </p>
                    </div>
                  ) : (
                    <div className="p-2">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={pinnedFilteredLeads.map((lead) => lead.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1">
                            {pinnedFilteredLeads.map((lead) => (
                              <SortableLeadItem
                                key={lead.id}
                                lead={lead}
                                isSelected={selectedLead?.id === lead.id}
                                onLeadClick={handleLeadClick}
                                onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                                onTogglePin={togglePinLead}
                                onOpenTags={openTagsManagerForLead}
                                onRemoveTags={handleRemoveAllTags}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>
            </>
          )}
        </Tabs>
      </Card>

      {/* Área de Chat - Coluna Direita */}
      <Card className="flex-1 flex flex-col">
        {selectedLead ? (
          <>
            {/* Cabeçalho do Chat */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-3 mb-3">
                <div className="relative">
                  <Avatar 
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {
                      if (selectedLead.avatar_url) {
                        setViewingAvatar({ url: selectedLead.avatar_url, name: selectedLead.nome_lead });
                      }
                    }}
                  >
                    <AvatarImage src={getAvatarUrl(selectedLead)} alt={selectedLead.nome_lead} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {getInitials(selectedLead.nome_lead)}
                  </AvatarFallback>
                </Avatar>
                {presenceStatus.get(selectedLead.id)?.isOnline && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold">{selectedLead.nome_lead}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  {presenceStatus.get(selectedLead.id)?.isOnline ? (
                    <span className="text-green-600 dark:text-green-400 font-medium">● Online</span>
                  ) : presenceStatus.get(selectedLead.id)?.lastSeen ? (
                    <>
                      <Clock className="h-3 w-3" />
                      Visto {new Date(presenceStatus.get(selectedLead.id)!.lastSeen!).toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </>
                  ) : (
                    <>
                      <Phone className="h-3 w-3" />
                      {formatPhoneNumber(selectedLead.telefone_lead)}
                    </>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefreshPresence}
                disabled={loadingPresence}
                title="Atualizar status de presença"
                className="shrink-0"
              >
                {loadingPresence ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLeadTagsOpen(true)}
                title="Gerenciar etiquetas"
                className="shrink-0"
              >
                <Tag className="h-4 w-4" />
              </Button>
              
              {/* Campo de Busca de Mensagens - Discreto */}
              {messageSearchExpanded ? (
                <div className="flex items-center gap-2">
                  <div className="relative w-48 transition-all duration-200">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-sm"
                      autoFocus
                      onBlur={(e) => {
                        // Não fechar se clicar nos botões de navegação
                        const relatedTarget = e.relatedTarget as HTMLElement;
                        if (!messageSearchQuery && !relatedTarget?.closest('[data-search-controls]')) {
                          setMessageSearchExpanded(false);
                        }
                      }}
                    />
                  </div>
                  
                  {/* Controles de navegação */}
                  {totalSearchResults > 0 && (
                    <div className="flex items-center gap-1" data-search-controls>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {currentSearchResultIndex + 1} de {totalSearchResults}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={goToPreviousResult}
                        disabled={currentSearchResultIndex === 0}
                        title="Resultado anterior"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={goToNextResult}
                        disabled={currentSearchResultIndex >= totalSearchResults - 1}
                        title="Próximo resultado"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setMessageSearchQuery("");
                      setMessageSearchExpanded(false);
                      setCurrentSearchResultIndex(0);
                    }}
                  >
                    Fechar
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMessageSearchExpanded(true)}
                  title="Buscar mensagens"
                  className="shrink-0"
                >
                  <Search className="h-4 w-4" />
                </Button>
              )}
              </div>
            </div>

            {/* Área de Mensagens */}
            <div className="flex-1 relative overflow-hidden flex flex-col">
              {/* Mensagens Fixadas - Minimalista como WhatsApp */}
              {pinnedMessages.size > 0 && (
                <div className="sticky top-0 z-20 backdrop-blur-sm border-b border-border/50" style={{ backgroundColor: '#1f5f61' }}>
                  {messages
                    .filter(msg => pinnedMessages.has(msg.id))
                    .slice(0, 1)
                    .map(message => (
                      <div
                        key={message.id}
                        className="flex items-center gap-2 px-4 py-2 cursor-pointer transition-colors group hover:bg-black/10"
                        onClick={() => {
                          const messageEl = document.getElementById(`message-${message.id}`);
                          messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }}
                      >
                        <Pin className="h-3.5 w-3.5 text-white flex-shrink-0" />
                        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                          <span className="text-xs font-medium text-white/90 flex-shrink-0">
                            {message.direcao === "ENTRADA" ? selectedLead?.nome_lead : "Você"}:
                          </span>
                          <p className="text-xs text-white/70 truncate">
                            {message.media_type === 'image' ? '🖼️ Imagem' :
                             message.media_type === 'audio' ? '🎵 Áudio' :
                             message.media_type === 'document' ? '📄 Documento' :
                             message.corpo_mensagem}
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPinnedMessages(!showPinnedMessages);
                          }}
                          className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                          title={showPinnedMessages ? 'Ocultar' : 'Ver todas'}
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showPinnedMessages ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinMessage(message);
                          }}
                          className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 rounded text-white"
                          title="Desfixar"
                        >
                          <PinOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  
                  {/* Mensagens fixadas adicionais (quando expandido) */}
                  {showPinnedMessages && pinnedMessages.size > 1 && (
                    <div className="border-t border-border/50" style={{ backgroundColor: '#1f5f61' }}>
                      {messages
                        .filter(msg => pinnedMessages.has(msg.id))
                        .slice(1, 3)
                        .map(message => (
                          <div
                            key={message.id}
                            className="flex items-center gap-2 px-4 py-1.5 cursor-pointer transition-colors group hover:bg-black/10"
                            onClick={() => {
                              const messageEl = document.getElementById(`message-${message.id}`);
                              messageEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                          >
                            <div className="w-3.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                              <span className="text-xs font-medium text-white/80 flex-shrink-0">
                                {message.direcao === "ENTRADA" ? selectedLead?.nome_lead : "Você"}:
                              </span>
                              <p className="text-xs text-white/60 truncate">
                                {message.media_type === 'image' ? '🖼️ Imagem' :
                                 message.media_type === 'audio' ? '🎵 Áudio' :
                                 message.media_type === 'document' ? '📄 Documento' :
                                 message.corpo_mensagem}
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                togglePinMessage(message);
                              }}
                              className="flex-shrink-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 rounded text-white"
                              title="Desfixar"
                            >
                              <PinOff className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Background pattern e ScrollArea */}
              <div className="flex-1 relative overflow-hidden">
                <div 
                  className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                  style={{
                    backgroundColor: theme === 'dark' ? '#0C1317' : '#ECE5DD',
                    backgroundImage: theme === 'dark' 
                      ? 'url(/chat-pattern-dark.png)' 
                      : 'url(/chat-pattern.png)',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '200px',
                    opacity: 0.3,
                    willChange: 'opacity'
                  }}
                />
                <ScrollArea className="h-full p-4 relative z-10">
              
              {loading ? (
                <LoadingAnimation text="Carregando mensagens..." />
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem ainda. Inicie a conversa!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages
                    .map((message, index) => {
                      const isSearchMatch = messageSearchQuery.trim() && 
                        message.corpo_mensagem
                          .toLowerCase()
                          .includes(messageSearchQuery.toLowerCase());
                      
                      // Calcular índice do resultado na lista de resultados
                      let searchResultIndex = -1;
                      if (isSearchMatch) {
                        const matchingMessages = messages.slice(0, index + 1).filter(m =>
                          m.corpo_mensagem
                            .toLowerCase()
                            .includes(messageSearchQuery.toLowerCase())
                        );
                        searchResultIndex = matchingMessages.length - 1;
                      }
                      
                      return (
                    <div
                      id={`message-${message.id}`}
                      key={message.id}
                      ref={(el) => {
                        if (isSearchMatch && searchResultIndex >= 0) {
                          searchResultRefs.current.set(searchResultIndex, el);
                          if (searchResultIndex === 0) {
                            firstSearchResultRef.current = el;
                          }
                        }
                      }}
                      className={`flex gap-2 ${
                        message.direcao === "SAIDA"
                          ? "justify-end"
                          : "justify-start"
                      } ${pinnedMessages.has(message.id) ? 'relative' : ''}`}
                    >
                      {/* Indicador de mensagem fixada */}
                      {pinnedMessages.has(message.id) && (
                        <div className="absolute -left-2 top-0 bottom-0 flex items-center">
                          <div className="w-1 h-full bg-primary rounded-full"></div>
                        </div>
                      )}
                      
                      {/* Avatar do lead nas mensagens recebidas */}
                      {message.direcao === "ENTRADA" && selectedLead && (
                        <Avatar 
                          className="h-8 w-8 flex-shrink-0 mt-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            if (selectedLead.avatar_url) {
                              setViewingAvatar({ url: selectedLead.avatar_url, name: selectedLead.nome_lead });
                            }
                          }}
                        >
                          <AvatarImage src={getAvatarUrl(selectedLead)} alt={selectedLead.nome_lead} />
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {getInitials(selectedLead.nome_lead)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      
                      <div
                        className={`max-w-[70%] rounded-lg p-3 relative group ${
                          message.direcao === "SAIDA"
                            ? "bg-chat-bubble text-chat-bubble-foreground"
                            : "bg-muted"
                        }`}
                      >
                        {/* Menu dropdown para todas as mensagens */}
                        <DropdownMenu 
                          open={dropdownOpenStates.get(message.id) || false}
                          onOpenChange={(open) => {
                            // Não fechar o dropdown se o popover de reações estiver aberto
                            if (!open && reactionPopoverOpen === message.id) {
                              return;
                            }
                            const newStates = new Map(dropdownOpenStates);
                            if (open) {
                              newStates.set(message.id, true);
                            } else {
                              newStates.delete(message.id);
                            }
                            setDropdownOpenStates(newStates);
                          }}
                        >
                          <DropdownMenuTrigger asChild>
                            <button className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm p-1.5 rounded-full hover:bg-background transition-colors opacity-0 group-hover:opacity-100">
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 bg-background border z-[100]">
                            <DropdownMenuItem
                              onSelect={(e) => {
                                e.preventDefault();
                                setReactionPopoverOpen(
                                  reactionPopoverOpen === message.id ? null : message.id
                                );
                              }}
                            >
                              <Smile className="h-4 w-4 mr-2" />
                              Reagir
                            </DropdownMenuItem>

                            {reactionPopoverOpen === message.id && (
                              <div className="px-2 pb-2 pt-1 border-t flex gap-1 flex-wrap">
                                {WHATSAPP_REACTION_EMOJIS.map((emoji) => {
                                  const reactions = messageReactions.get(message.id) || [];
                                  const userReacted = reactions.some(
                                    (r) => r.user_id === user?.id && r.emoji === emoji
                                  );
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => {
                                        toggleReaction(message.id, emoji);
                                        // Fechar seleção de reação e dropdown após escolher
                                        setReactionPopoverOpen(null);
                                        const newStates = new Map(dropdownOpenStates);
                                        newStates.delete(message.id);
                                        setDropdownOpenStates(newStates);
                                      }}
                                      className={`text-2xl p-1.5 rounded-lg transition-colors hover:bg-accent/60 ${
                                        userReacted ? "bg-accent" : ""
                                      }`}
                                      title={userReacted ? "Remover reação" : "Reagir"}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            <DropdownMenuItem
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  message.corpo_mensagem || message.media_url || ""
                                );
                                toast({ title: "Copiado!" });
                              }}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copiar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                togglePinMessage(message);
                              }}
                            >
                              <Pin className="h-4 w-4 mr-2" />
                              {pinnedMessages.has(message.id) ? "Desfixar" : "Fixar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                toast({
                                  title: "Mensagem favoritada",
                                  description: "Esta funcionalidade estará disponível em breve",
                                });
                              }}
                            >
                              <Star className="h-4 w-4 mr-2" />
                              Favoritar
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                toast({
                                  title: "Apagar mensagem",
                                  description: "Esta funcionalidade estará disponível em breve",
                                });
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Apagar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        
                        {/* Renderizar player de áudio se for mensagem de áudio */}
                        {message.media_type === 'audio' ? (
                          message.media_url ? (
                            <AudioPlayer 
                              audioUrl={message.media_url} 
                              mimetype={message.media_metadata?.mimetype}
                              duration={message.media_metadata?.seconds}
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="opacity-70">🎵 Áudio</span>
                              {message.media_metadata?.seconds && (
                                <span className="text-xs opacity-50">
                                  ({Math.floor(message.media_metadata.seconds)}s)
                                </span>
                              )}
                              <span className="text-xs opacity-50 italic">
                                - Mídia indisponível
                              </span>
                            </div>
                          )
                        ) : message.media_type === 'image' ? (
                          /* Renderizar imagem */
                          message.media_url ? (
                            <div className="space-y-2">
                              <img 
                                src={message.media_url} 
                                alt="Imagem enviada"
                                className="rounded-lg max-w-full max-h-96 object-contain"
                                loading="lazy"
                              />
                              {message.corpo_mensagem && !message.corpo_mensagem.includes('[Imagem]') && message.corpo_mensagem !== 'Imagem' && (
                                <p className="text-sm whitespace-pre-wrap">
                                  {message.corpo_mensagem}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                              <ImageIcon className="h-4 w-4 opacity-70" />
                              <span className="opacity-70">Imagem</span>
                              <span className="text-xs opacity-50 italic">
                                - Mídia indisponível
                              </span>
                            </div>
                          )
                        ) : message.media_type === 'document' || message.media_type === 'application' ? (
                          /* Renderizar documento */
                          message.media_url ? (
                            <div className="space-y-2">
                              <a 
                                href={message.media_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-background/50 rounded-lg hover:bg-background/70 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <FileText className="h-8 w-8 flex-shrink-0 opacity-70" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium truncate">
                                    {message.media_metadata?.fileName || 'Documento'}
                                  </p>
                                  {message.media_metadata?.fileLength && (
                                    <p className="text-xs opacity-50">
                                      {(message.media_metadata.fileLength / 1024).toFixed(1)} KB
                                    </p>
                                  )}
                                </div>
                                <Download className="h-4 w-4 flex-shrink-0 opacity-70" />
                              </a>
                              {message.corpo_mensagem && message.corpo_mensagem !== 'Documento' && (
                                <p className="text-sm whitespace-pre-wrap">
                                  {message.corpo_mensagem}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 text-sm">
                              <FileText className="h-4 w-4 opacity-70" />
                              <span className="opacity-70">Documento</span>
                              <span className="text-xs opacity-50 italic">
                                - Mídia indisponível
                              </span>
                            </div>
                          )
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">
                            {(() => {
                              // Remove asteriscos da assinatura para mensagens antigas
                              let messageText = message.corpo_mensagem.replace(/^\*([^*]+):\*\n/, '$1:\n');
                              
                              // Detectar assinatura do colaborador no início da mensagem de saída
                              const signatureMatch = message.direcao === "SAIDA" && 
                                messageText.match(/^([^:]+):\n/);
                              
                              if (signatureMatch) {
                                const signature = signatureMatch[1];
                                const content = messageText.substring(signatureMatch[0].length);
                                
                                return (
                                  <>
                                    <strong className="font-semibold">{signature}:</strong>
                                    {"\n"}
                                    {messageSearchQuery.trim() ? (
                                      content.split(new RegExp(`(${messageSearchQuery})`, 'gi')).map((part, index) => 
                                        part.toLowerCase() === messageSearchQuery.toLowerCase() ? (
                                          <mark key={index} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
                                            {part}
                                          </mark>
                                        ) : (
                                          part
                                        )
                                      )
                                    ) : (
                                      content
                                    )}
                                  </>
                                );
                              }
                              
                              // Mensagem normal sem assinatura
                              return messageSearchQuery.trim() ? (
                                messageText.split(new RegExp(`(${messageSearchQuery})`, 'gi')).map((part, index) => 
                                  part.toLowerCase() === messageSearchQuery.toLowerCase() ? (
                                    <mark key={index} className="bg-yellow-300 dark:bg-yellow-600 rounded px-0.5">
                                      {part}
                                    </mark>
                                  ) : (
                                    part
                                  )
                                )
                              ) : (
                                messageText
                              );
                            })()}
                          </p>
                        )}
                        <div
                          className={`flex items-center gap-1 mt-1 text-xs ${
                            message.direcao === "SAIDA"
                              ? "text-chat-bubble-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span>{formatTime(message.data_hora)}</span>
                          {message.direcao === "SAIDA" && (
                            <>
                              {message.sendError ? (
                                <div className="flex items-center gap-1 ml-1">
                                  <span title={message.errorMessage}>
                                    <AlertCircle className="h-3 w-3 text-red-500" />
                                  </span>
                                  <button
                                    onClick={() => {
                                      const messageText = message.corpo_mensagem;
                                      setNewMessage(messageText);
                                      // Remover mensagem com erro
                                      setMessages(prev => prev.filter(m => m.id !== message.id));
                                    }}
                                    className="hover:opacity-70 transition-opacity"
                                    title="Clique para reenviar"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : message.isOptimistic ? (
                                <span title="Enviando...">
                                  <Clock className="h-3 w-3 ml-1 animate-pulse" />
                                </span>
                              ) : (
                                <span className="ml-1">
                                  {getStatusIcon(message.status_entrega)}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        
                        {/* Reações */}
                        {(() => {
                          const reactions = messageReactions.get(message.id) || [];
                          if (reactions.length === 0) return null;
                          
                          // Agrupar reações por emoji
                          const emojiGroups = reactions.reduce((acc, reaction) => {
                            if (!acc[reaction.emoji]) {
                              acc[reaction.emoji] = [];
                            }
                            acc[reaction.emoji].push(reaction);
                            return acc;
                          }, {} as Record<string, MessageReaction[]>);
                          
                          return (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {Object.entries(emojiGroups).map(([emoji, emojiReactions]) => {
                                const userReacted = emojiReactions.some(r => r.user_id === user?.id);
                                return (
                                  <button
                                    key={emoji}
                                    onClick={() => toggleReaction(message.id, emoji)}
                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors ${
                                      userReacted 
                                        ? 'bg-primary/20 border border-primary/30' 
                                        : 'bg-background/50 border border-border/50 hover:bg-background/70'
                                    }`}
                                    title={userReacted ? 'Remover sua reação' : 'Reagir também'}
                                  >
                                    <span>{emoji}</span>
                                    {emojiReactions.length > 1 && (
                                      <span className="font-medium">{emojiReactions.length}</span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>
              )}
                </ScrollArea>
              </div>
            </div>

            {/* Input de Mensagem */}
            {opusRecorder.isRecording ? (
              /* UI de gravação ativa */
              <div className="p-4 border-t flex items-center gap-3 bg-destructive/10">
                <div className="flex-1 flex items-center gap-3">
                  <div className="h-3 w-3 bg-destructive rounded-full animate-pulse" />
                  <span className="text-sm font-medium">
                    Gravando {Math.floor(opusRecorder.recordingTime / 60)}:{(opusRecorder.recordingTime % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <Button
                  type="button"
                  onClick={stopRecording}
                  size="icon"
                  className="shrink-0 bg-destructive hover:bg-destructive/90"
                >
                  <Square className="h-5 w-5 fill-current" />
                </Button>
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className="p-4 border-t flex items-end gap-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title="Anexar arquivo"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sendingFile}
                >
                  {sendingFile ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Paperclip className="h-5 w-5" />
                  )}
                </Button>
                <Textarea
                  ref={messageInputRef}
                  placeholder="Digite sua mensagem..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e as any);
                    }
                  }}
                  className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                  rows={1}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  title="Gravar áudio"
                  onClick={startRecording}
                >
                  <Mic className="h-5 w-5" />
                </Button>
                <Button type="submit" disabled={!newMessage.trim()} size="icon" variant="ghost" className="shrink-0">
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <dotlottie-wc 
                src="https://lottie.host/4e790ff6-4755-4288-966f-316fb6c4ef27/aj6gFtlr3H.lottie" 
                style={{ width: '300px', height: '300px', margin: '0 auto' }}
                autoplay
                loop
              ></dotlottie-wc>
              <p className="mt-4">Selecione um contato para iniciar a conversa</p>
            </div>
          </div>
        )}
      </Card>

      {/* Dialog para visualizar foto de perfil */}
      <Dialog open={!!viewingAvatar} onOpenChange={() => setViewingAvatar(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          {viewingAvatar && (
            <div className="flex flex-col">
              <div className="p-4 border-b">
                <h3 className="font-semibold text-lg">{viewingAvatar.name}</h3>
              </div>
              <div className="p-4 bg-muted/50 flex items-center justify-center">
                <img 
                  src={viewingAvatar.url} 
                  alt={viewingAvatar.name}
                  className="max-w-full max-h-[70vh] object-contain rounded-lg"
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ManageTagsDialog
        open={manageTagsOpen}
        onOpenChange={setManageTagsOpen}
        onTagsChanged={() => loadLeads()}
      />

      {selectedLead && (
        <Dialog open={leadTagsOpen} onOpenChange={setLeadTagsOpen}>
          <DialogContent className="max-w-md">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-1">Etiquetas</h3>
                <p className="text-sm text-muted-foreground">{selectedLead.nome_lead}</p>
              </div>
              <LeadTagsManager 
                leadId={selectedLead.id} 
                onTagsChanged={() => loadLeads()}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de confirmação para remover etiquetas */}
      <AlertDialog open={removeTagsDialogOpen} onOpenChange={setRemoveTagsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etiquetas</AlertDialogTitle>
            <AlertDialogDescription>
              Selecione as etiquetas que deseja remover deste lead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-2 max-h-[300px] overflow-y-auto">
            {leadToRemoveTags && availableTags
              .filter(tag => leadTagsMap.get(leadToRemoveTags)?.includes(tag.id))
              .map(tag => (
                <div
                  key={tag.id}
                  className="flex items-center space-x-2 p-2 rounded-md hover:bg-muted"
                >
                  <Checkbox
                    id={tag.id}
                    checked={selectedTagsToRemove.includes(tag.id)}
                    onCheckedChange={() => toggleTagSelection(tag.id)}
                  />
                  <label
                    htmlFor={tag.id}
                    className="flex items-center gap-2 cursor-pointer flex-1"
                    onClick={() => toggleTagSelection(tag.id)}
                  >
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${tag.color}15`,
                        color: tag.color,
                        borderColor: tag.color,
                      }}
                      className="border"
                    >
                      {tag.name}
                    </Badge>
                  </label>
                </div>
              ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setSelectedTagsToRemove([]);
              setLeadToRemoveTags(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmRemoveAllTags}
              disabled={selectedTagsToRemove.length === 0}
            >
              Remover {selectedTagsToRemove.length > 0 && `(${selectedTagsToRemove.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Chat;
