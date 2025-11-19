import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Lead, Message } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Send, Phone, Search, Check, CheckCheck, Clock, Loader2, RefreshCw, Tag, Filter, Pin, PinOff, GripVertical } from "lucide-react";
import { formatPhoneNumber } from "@/lib/utils";
import { AudioPlayer } from "@/components/AudioPlayer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { LeadTagsManager } from "@/components/LeadTagsManager";
import { LeadTagsBadge } from "@/components/LeadTagsBadge";
import { ManageTagsDialog } from "@/components/ManageTagsDialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [pinnedSectionOpen, setPinnedSectionOpen] = useState(true);
  const [presenceStatus, setPresenceStatus] = useState<
    Map<string, { isOnline: boolean; lastSeen?: string; status?: string; rateLimited?: boolean }>
  >(new Map());
  const [loadingPresence, setLoadingPresence] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const presenceQueue = useRef<Array<{ lead: Lead; instanceName: string }>>([]);
  const isProcessingQueue = useRef(false);

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

  // Carregar leads e configurar realtime
  useEffect(() => {
    loadLeads();
    loadAvailableTags();

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
          event: '*',
          schema: 'public',
          table: 'leads'
        },
        () => {
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'lead_tag_assignments'
        },
        () => {
          loadLeads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(leadsChannel);
      supabase.removeChannel(tagsChannel);
    };
  }, [location.state]);

  // Carregar mensagens quando um lead é selecionado e configurar realtime
  useEffect(() => {
    if (selectedLead) {
      loadMessages(selectedLead.id);

      // Configurar realtime para mensagens do lead selecionado
      const messagesChannel = supabase
        .channel(`messages-${selectedLead.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'mensagens_chat',
            filter: `id_lead=eq.${selectedLead.id}`
          },
          (payload) => {
            console.log('Mensagem recebida em realtime:', payload);
            // Recarregar mensagens
            loadMessages(selectedLead.id);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [selectedLead]);

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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
        .order("data_hora", { ascending: true });

      if (error) throw error;

      // Bucket chat-media é público, então podemos usar as URLs diretamente
      setMessages(data as Message[]);
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

  const sendMessage = async (text: string) => {
    if (!text.trim() || !selectedLead) return;

    setSending(true);
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

      // Nome do usuário logado ou fallback para "Atendente"
      const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || "Atendente";
      
      // Formatar mensagem: *Nome:* com quebra de linha
      const messageForEvolution = `*${userName}:*\n${text.trim()}`;

      console.log('📤 Enviando mensagem:', {
        instance: instanceData.instance_name,
        to: selectedLead.telefone_lead,
        message: messageForEvolution
      });

      // Call edge function to send message via Evolution API
      const { data, error } = await supabase.functions.invoke('send-whatsapp-message', {
        body: {
          instance_name: instanceData.instance_name,
          remoteJid: selectedLead.telefone_lead,
          message_text: messageForEvolution,
          leadId: selectedLead.id,
        },
      });

      if (error) {
        console.error('❌ Erro na invocação da função:', error);
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

      // Reload messages after sending
      await loadMessages(selectedLead.id);
      setNewMessage("");

      toast({
        title: "Mensagem enviada",
        description: "Sua mensagem foi enviada via WhatsApp",
      });
    } catch (error: any) {
      console.error("❌ Erro ao enviar mensagem:", error);
      
      // Extrair mensagem de erro mais específica
      let errorMessage = "Não foi possível enviar a mensagem";
      
      if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast({
        title: "Erro ao enviar",
        description: errorMessage,
        variant: "destructive",
      });
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
  }

  const SortableLeadItem = ({
    lead,
    isSelected,
    onLeadClick,
    onAvatarClick,
    onTogglePin,
    onOpenTags,
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
              onClick={() => onLeadClick(lead)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-background/60 transition-colors ${
                isSelected ? "bg-background shadow-sm" : ""
              }`}
            >
              <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing touch-none"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </div>
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
              <div className="flex-1 text-left overflow-hidden">
                <div className="flex items-center gap-2">
                  <Pin className="h-3 w-3 text-primary fill-primary" />
                  <p className="font-medium truncate">{lead.nome_lead}</p>
                  {presenceStatus.get(lead.id)?.isOnline && (
                    <span className="text-xs text-green-600 font-medium">Online</span>
                  )}
                  <LeadTagsBadge leadId={lead.id} />
                </div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {formatPhoneNumber(lead.telefone_lead)}
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
      <Card className="w-80 flex flex-col">
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

        <ScrollArea className="flex-1">
          {loading && !selectedLead ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : pinnedFilteredLeads.length === 0 && unpinnedFilteredLeads.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <p>Nenhum contato encontrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Seção de Conversas Fixadas */}
              {pinnedFilteredLeads.length > 0 && (
                <Collapsible
                  open={pinnedSectionOpen}
                  onOpenChange={setPinnedSectionOpen}
                  className="space-y-2"
                >
                  <div className="px-2 pt-2">
                    <CollapsibleTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between px-2 h-8 hover:bg-primary/5"
                      >
                        <div className="flex items-center gap-2">
                          <Pin className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold text-primary">
                            Fixadas ({pinnedFilteredLeads.length})
                          </span>
                        </div>
                        {pinnedSectionOpen ? (
                          <ChevronUp className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 text-primary" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  
                  <CollapsibleContent className="space-y-1 px-2 animate-accordion-down">
                    <div className="bg-primary/5 rounded-lg p-1 space-y-1">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={pinnedFilteredLeads.map((lead) => lead.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {pinnedFilteredLeads.map((lead) => (
                            <SortableLeadItem
                              key={lead.id}
                              lead={lead}
                              isSelected={selectedLead?.id === lead.id}
                              onLeadClick={handleLeadClick}
                              onAvatarClick={(url, name) => setViewingAvatar({ url, name })}
                              onTogglePin={togglePinLead}
                              onOpenTags={openTagsManagerForLead}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Seção de Todas as Conversas */}
              {unpinnedFilteredLeads.length > 0 && (
                <div className="space-y-1 px-2">
                  {pinnedFilteredLeads.length > 0 && (
                    <div className="px-2 py-1">
                      <span className="text-xs font-semibold text-muted-foreground">
                        Todas as conversas
                      </span>
                    </div>
                  )}
                  {unpinnedFilteredLeads.map((lead) => {
                    const isPinned = false;
                    
                    return (
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
                              {/* Indicador de presença */}
                              <div 
                                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${
                                  presenceStatus.get(lead.id)?.isOnline 
                                    ? 'bg-green-500 animate-pulse shadow-lg shadow-green-500/50' 
                                    : presenceStatus.get(lead.id)?.lastSeen
                                      ? 'bg-orange-400'
                                      : presenceStatus.get(lead.id)
                                        ? 'bg-gray-400'
                                        : 'bg-gray-500 opacity-30'
                                }`}
                                title={
                                  presenceStatus.get(lead.id)?.isOnline 
                                    ? '🟢 Online agora' 
                                    : presenceStatus.get(lead.id)?.lastSeen 
                                      ? `🟠 Visto: ${new Date(presenceStatus.get(lead.id)!.lastSeen!).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}`
                                      : presenceStatus.get(lead.id)
                                        ? '⚪ Offline'
                                        : '⚫ Status desconhecido'
                                }
                              />
                            </div>
                            <div className="flex-1 text-left overflow-hidden">
                              <div className="flex items-center gap-2">
                                <p className="font-medium truncate">{lead.nome_lead}</p>
                                {presenceStatus.get(lead.id)?.isOnline && (
                                  <span className="text-xs text-green-600 font-medium">Online</span>
                                )}
                                <LeadTagsBadge leadId={lead.id} />
                              </div>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {formatPhoneNumber(lead.telefone_lead)}
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
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </Card>

      {/* Área de Chat - Coluna Direita */}
      <Card className="flex-1 flex flex-col">
        {selectedLead ? (
          <>
            {/* Cabeçalho do Chat */}
            <div className="p-4 border-b flex items-center gap-3">
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
            </div>

            {/* Área de Mensagens */}
            <ScrollArea className="flex-1 p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p>Nenhuma mensagem ainda. Inicie a conversa!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-2 ${
                        message.direcao === "SAIDA"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
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
                        className={`max-w-[70%] rounded-lg p-3 ${
                          message.direcao === "SAIDA"
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted"
                        }`}
                      >
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
                        ) : (
                          <p className="text-sm whitespace-pre-wrap">
                            {message.corpo_mensagem}
                          </p>
                        )}
                        <div
                          className={`flex items-center gap-1 mt-1 text-xs ${
                            message.direcao === "SAIDA"
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"
                          }`}
                        >
                          <span>{formatTime(message.data_hora)}</span>
                          {message.direcao === "SAIDA" && (
                            <span className="ml-1">
                              {getStatusIcon(message.status_entrega)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            {/* Input de Mensagem */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 border-t flex gap-2"
            >
              <Input
                placeholder="Digite sua mensagem..."
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={sending}
                className="flex-1"
              />
              <Button type="submit" disabled={sending || !newMessage.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </form>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecione um contato para iniciar a conversa</p>
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
    </div>
  );
};

export default Chat;
