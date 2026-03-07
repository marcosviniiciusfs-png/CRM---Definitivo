import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import { LeadCard } from "@/components/LeadCard";
import { toast } from "sonner";
import { EditLeadModal } from "@/components/EditLeadModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import saleConfirmationIcon from "@/assets/sale-confirmation-icon.gif";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
import { usePermissions } from "@/hooks/usePermissions";

// Constantes vazias estáveis para evitar novas referências
const EMPTY_ITEMS: any[] = [];
const EMPTY_TAGS: Array<{ id: string; name: string; color: string }> = [];

type LeadItems = Record<string, any[]>;
type LeadTagsMap = Record<string, Array<{ id: string; name: string; color: string }>>;

// Mapeamento de ícones emoji para funis
const ICON_EMOJI_MAP: Record<string, string> = {
  "target": "🎯",
  "briefcase": "💼",
  "book": "📓",
  "headphones": "🎧",
  "shopping-cart": "🛒",
  "trophy": "🏆",
  "star": "⭐",
  "zap": "⚡",
  "crown": "👑",
  "home": "🏠",
  "package": "📦",
  "store": "🏪",
  "phone": "📱",
  "laptop": "💻",
  "car": "🚗",
  "plane": "✈️",
  "graduation-cap": "🎓",
  "stethoscope": "🩺",
  "utensils": "🍽️",
  "dumbbell": "💪",
};

// Etapas padrão (quando não há funil customizado)
const DEFAULT_STAGES = [
  { id: "NOVO_LEAD", title: "Novo Lead", color: "bg-blue-500" },
  { id: "QUALIFICACAO", title: "Qualificação / Aquecido", color: "bg-cyan-500" },
  { id: "AGENDAMENTO", title: "Agendamento Realizado", color: "bg-yellow-500" },
  { id: "REUNIAO", title: "Reunião Feita", color: "bg-orange-500" },
  { id: "PROPOSTA", title: "Proposta / Negociação", color: "bg-purple-500" },
  { id: "APROVACAO", title: "Aprovação / Análise", color: "bg-indigo-500" },
  { id: "VENDA", title: "Venda Realizada", color: "bg-green-500" },
  { id: "POS_VENDA", title: "Pós-venda / Ativação", color: "bg-emerald-500" },
  { id: "PERDIDO", title: "Perdido", color: "bg-red-500" },
];

const Pipeline = () => {
  const navigate = useNavigate();
  const { user, organizationId, isReady } = useOrganizationReady();
  const queryClient = useQueryClient();
  const permissions = usePermissions();
  // Unique channel ID per mount to avoid Supabase channel name conflicts on re-navigation
  const channelIdRef = useRef<string>(`leads-ch-${Date.now()}`);
  const [userProfile, setUserProfile] = useState<{ full_name: string } | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const leadIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stages, setStages] = useState<any[]>(DEFAULT_STAGES);
  const [usingCustomFunnel, setUsingCustomFunnel] = useState(false);
  const [activeFunnel, setActiveFunnel] = useState<any>(null);
  const [allFunnels, setAllFunnels] = useState<any[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [leadItems, setLeadItems] = useState<LeadItems>({});
  const [pauseRealtime, setPauseRealtime] = useState(false);
  const [leadTagsMap, setLeadTagsMap] = useState<LeadTagsMap>({});
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const [isTabTransitioning, setIsTabTransitioning] = useState(false);
  const [wonConfirmation, setWonConfirmation] = useState<{
    show: boolean;
    lead: Lead | null;
    targetStage: string;
    event: DragEndEvent | null;
  }>({ show: false, lead: null, targetStage: '', event: null });

  // Scrollbar fixa customizada
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; scrollLeft: number } | null>(null);
  const [scrollThumbWidth, setScrollThumbWidth] = useState(20);
  const [scrollThumbPosition, setScrollThumbPosition] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Atualiza a posição e tamanho do thumb da scrollbar
  const updateScrollbarThumb = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      const hasOverflow = scrollWidth > clientWidth;
      setShowScrollbar(hasOverflow);

      if (hasOverflow) {
        const thumbWidth = (clientWidth / scrollWidth) * 100;
        const maxScrollLeft = scrollWidth - clientWidth;
        const thumbPosition = maxScrollLeft > 0 ? (scrollLeft / maxScrollLeft) * (100 - thumbWidth) : 0;
        setScrollThumbWidth(thumbWidth);
        setScrollThumbPosition(thumbPosition);
      }
    }
  }, []);

  // Sincroniza scroll do container com a barra customizada
  const handleScrollContainerScroll = useCallback(() => {
    updateScrollbarThumb();
  }, [updateScrollbarThumb]);

  // Clique na track da scrollbar
  const handleScrollbarTrackClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollContainerRef.current || e.target !== e.currentTarget) return;
    const track = e.currentTarget;
    const rect = track.getBoundingClientRect();
    const clickPosition = (e.clientX - rect.left) / rect.width;
    const { scrollWidth, clientWidth } = scrollContainerRef.current;
    const maxScrollLeft = scrollWidth - clientWidth;
    scrollContainerRef.current.scrollTo({
      left: clickPosition * maxScrollLeft,
      behavior: 'smooth'
    });
  }, []);

  // Handler para iniciar o drag do thumb
  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Salva a posição inicial do mouse e do scroll
    if (scrollContainerRef.current) {
      dragStartRef.current = {
        mouseX: e.clientX,
        scrollLeft: scrollContainerRef.current.scrollLeft
      };
    }

    setIsDraggingScrollbar(true);
  }, []);

  // Effect para lidar com drag global do scrollbar
  useEffect(() => {
    if (!isDraggingScrollbar) return;

    // Previne seleção de texto durante o drag
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current || !scrollTrackRef.current || !dragStartRef.current) return;

      const track = scrollTrackRef.current;
      const rect = track.getBoundingClientRect();
      const { scrollWidth, clientWidth } = scrollContainerRef.current;
      const maxScrollLeft = scrollWidth - clientWidth;

      // Calcula o delta do movimento do mouse
      const mouseDelta = e.clientX - dragStartRef.current.mouseX;

      // Converte o delta do mouse para delta de scroll (proporcionalmente)
      const trackWidth = rect.width;
      const thumbWidth = (clientWidth / scrollWidth) * trackWidth;
      const scrollableTrackWidth = trackWidth - thumbWidth;
      const scrollDelta = (mouseDelta / scrollableTrackWidth) * maxScrollLeft;

      // Aplica o delta à posição inicial
      const newScrollLeft = Math.max(0, Math.min(maxScrollLeft, dragStartRef.current.scrollLeft + scrollDelta));
      scrollContainerRef.current.scrollLeft = newScrollLeft;
    };

    const handleMouseUp = () => {
      setIsDraggingScrollbar(false);
      dragStartRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    // Escuta em múltiplos eventos para garantir que o drag pare
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingScrollbar]);

  // Atualiza scrollbar quando stages/leads mudam
  useEffect(() => {
    updateScrollbarThumb();
    const timer = setTimeout(updateScrollbarThumb, 100);
    return () => clearTimeout(timer);
  }, [stages, leads, selectedFunnelId, updateScrollbarThumb]);

  // Configurar sensor com constraint de distância
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Previne drag acidental
      },
    })
  );

  // Inicialização de áudio e subscrição a novos leads
  useEffect(() => {
    // Inicializar áudio de notificação
    audioRef.current = new Audio("/notification.mp3");
    audioRef.current.volume = 0.5;

    // Usar nome único por mount para evitar conflito de channel ao re-navegar
    const channelName = channelIdRef.current;

    // Subscrever a novos leads
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads'
        },
        (payload) => {
          // Pausar processamento durante drag
          if (pauseRealtime) return;

          const newLead = payload.new as Lead;

          // Garantir que o lead pertence ao funil atualmente selecionado
          if (usingCustomFunnel && activeFunnel) {
            if (newLead.funnel_id !== activeFunnel.id) {
              return;
            }
          } else if (!usingCustomFunnel && newLead.funnel_id !== null) {
            // Se estamos no funil padrão, ignorar leads de funis customizados
            return;
          }

          // Verificar se é realmente um lead novo (não carregado anteriormente)
          if (!leadIdsRef.current.has(newLead.id)) {
            // Adicionar ao estado
            setLeads(prev => [newLead, ...prev]);
            leadIdsRef.current.add(newLead.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pauseRealtime, usingCustomFunnel, activeFunnel]);

  // Carregar perfil do usuário
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return;

      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (isMounted && profileData?.full_name) {
          setUserProfile(profileData);
        }
      } catch (error) {
        console.error('Erro ao buscar perfil:', error);
      }
    };

    let isMounted = true;
    loadUserProfile();
    return () => { isMounted = false; };
  }, [user?.id]);

  // UseEffect para carregar dados do pipeline
  useEffect(() => {
    // Aguardar que auth + organização estejam prontos antes de carregar
    if (!isReady || !organizationId) return;

    let isMounted = true;

    const fetchPipelineData = async () => {
      try {
        if (!user?.id || permissions.loading) {
          if (!permissions.loading) {
            setInitialLoading(false);
          }
          return;
        }

        // Carregar funil e leads (organizationId já disponível via contexto)
        const funnelData = await loadFunnel();
        if (isMounted) {
          await loadLeads(funnelData);
        }
      } catch (err) {
        console.error("Erro crítico ao carregar pipeline:", err);
      } finally {
        if (isMounted) {
          setInitialLoading(false);
        }
      }
    };

    fetchPipelineData();

    return () => {
      isMounted = false;
    };
  }, [selectedFunnelId, user?.id, organizationId, isReady, permissions.canViewAllLeads, permissions.loading]);

  const loadFunnel = async () => {
    // Usar organizationId já disponível via contexto (evita query redundante a organization_members)
    if (!organizationId) {
      setStages(DEFAULT_STAGES);
      setUsingCustomFunnel(false);
      return { isCustom: false, funnel: null };
    }

    try {
      // Buscar TODOS os funis ativos
      const { data: funnels, error } = await supabase
        .from("sales_funnels")
        .select(`
          *,
          stages:funnel_stages(*)
        `)
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });

      if (error || !funnels || funnels.length === 0) {
        // Usar etapas padrão se não houver funil customizado
        setStages(DEFAULT_STAGES);
        setUsingCustomFunnel(false);
        setActiveFunnel(null);
        setAllFunnels([]);
        return { isCustom: false, funnel: null };
      }

      // Armazenar todos os funis
      setAllFunnels(funnels);

      // Selecionar o funil apropriado sem criar loop
      const funnelToActivate = selectedFunnelId
        ? funnels.find((f) => f.id === selectedFunnelId) || funnels[0]
        : funnels[0];

      if (!funnelToActivate.stages || funnelToActivate.stages.length === 0) {
        setStages(DEFAULT_STAGES);
        setUsingCustomFunnel(false);
        setActiveFunnel(null);
        return { isCustom: false, funnel: null };
      }

      // Usar funil selecionado
      const customStages = funnelToActivate.stages
        .sort((a, b) => a.position - b.position)
        .map((stage) => ({
          id: stage.id,
          title: stage.name,
          color: stage.color,
          icon: stage.icon,
          stageData: stage,
        }));

      setStages(customStages);
      setUsingCustomFunnel(true);
      setActiveFunnel(funnelToActivate);

      // Inicializar selectedFunnelId apenas se for null (primeira vez)
      if (selectedFunnelId === null) {
        setSelectedFunnelId(funnelToActivate.id);
      }

      return { isCustom: true, funnel: funnelToActivate };
    } catch (error) {
      console.error("Erro ao carregar funil:", error);
      setStages(DEFAULT_STAGES);
      setUsingCustomFunnel(false);
      return { isCustom: false, funnel: null };
    }
  };

  const loadLeads = async (funnelData?: { isCustom: boolean; funnel: any }, isTabChange: boolean = false) => {
    if (!user?.id || !organizationId) return;

    try {
      // Controlar estados de loading: Skeletons apenas se realmente necessário
      if (!isTabChange && leads.length === 0) {
        setInitialLoading(true);
      }
      setIsLoadingData(true);

      // Usar dados do funil passados ou estados atuais
      const isCustom = funnelData?.isCustom ?? usingCustomFunnel;
      const funnel = funnelData?.funnel ?? activeFunnel;

      // Otimizado: buscar apenas campos necessários (incluindo source para badges)
      // Usar organizationId do contexto diretamente - evita query redundante a organization_members
      let query = supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio")
        .eq("organization_id", organizationId);

      // SEGURANÇA: Members só veem leads atribuídos a eles (usando UUID)
      if (!permissions.canViewAllLeads && user?.id) {
        query = query.eq("responsavel_user_id", user.id);
      }

      // Se estiver usando funil customizado, filtrar apenas leads desse funil específico
      if (isCustom && funnel) {
        query = query.eq("funnel_id", funnel.id);
      } else {
        // No funil padrão (legado), mostrar apenas leads que não pertencem a nenhum funil customizado
        query = query.is("funnel_id", null);
      }

      const { data, error } = await query
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(200); // Limitar para performance

      if (error) throw error;

      setLeads(data || []);

      // Armazenar IDs dos leads carregados inicialmente
      if (data) {
        leadIdsRef.current = new Set(data.map(lead => lead.id));
        // Buscar todos lead_items e tags de uma vez
        await Promise.all([
          loadLeadItems(data.map(l => l.id)),
          loadLeadTags(data.map(l => l.id))
        ]);
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setIsLoadingData(false);
      setInitialLoading(false);
      setIsTabTransitioning(false);
    }
  };

  const loadLeadItems = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    const { data, error } = await supabase
      .from('lead_items')
      .select(`
        *,
        items:item_id (
          id,
          name,
          icon,
          sale_price
        )
      `)
      .in('lead_id', leadIds);

    if (!error && data) {
      const itemsMap: LeadItems = {};
      data.forEach((item) => {
        if (!itemsMap[item.lead_id]) {
          itemsMap[item.lead_id] = [];
        }
        itemsMap[item.lead_id].push(item);
      });
      setLeadItems(itemsMap);
    }
  };

  const loadLeadTags = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    const { data, error } = await supabase
      .from('lead_tag_assignments')
      .select(`
        lead_id,
        lead_tags (
          id,
          name,
          color
        )
      `)
      .in('lead_id', leadIds)
      .limit(250); // 5 tags por lead * 50 leads

    if (!error && data) {
      const tagsMap: LeadTagsMap = {};
      data.forEach((item: any) => {
        if (item.lead_tags) {
          if (!tagsMap[item.lead_id]) {
            tagsMap[item.lead_id] = [];
          }
          tagsMap[item.lead_id].push(item.lead_tags);
        }
      });
      setLeadTagsMap(tagsMap);
    }
  };

  // Pré-calcular datas formatadas para evitar recálculo a cada render
  const leadsWithFormattedDates = useMemo(() => {
    return leads.map(lead => ({
      ...lead,
      formattedDate: new Date(lead.created_at).toLocaleString("pt-BR")
    }));
  }, [leads]);

  // Filtrar leads por termo de busca (nome ou fonte)
  const filteredLeads = useMemo(() => {
    if (!searchTerm.trim()) return leadsWithFormattedDates;

    const term = searchTerm.toLowerCase().trim();
    return leadsWithFormattedDates.filter((lead) => {
      const nameMatch = lead.nome_lead?.toLowerCase().includes(term);
      const sourceMatch = lead.source?.toLowerCase().includes(term);
      return nameMatch || sourceMatch;
    });
  }, [leadsWithFormattedDates, searchTerm]);

  // Memoizar leads por stage para evitar recálculo constante
  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();

    stages.forEach((stage) => {
      let filtered;

      if (usingCustomFunnel) {
        filtered = filteredLeads.filter((lead) => lead.funnel_stage_id === stage.id);
      } else {
        filtered = filteredLeads.filter((lead) => (lead.stage || "NOVO") === stage.id);
      }

      filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
      map.set(stage.id, filtered);
    });

    return map;
  }, [filteredLeads, stages, usingCustomFunnel]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setPauseRealtime(true);
    setIsDraggingActive(true);
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setPauseRealtime(false);
    setIsDraggingActive(false);

    if (!over) {
      return;
    }

    const leadId = active.id as string;
    const overId = over.id as string;

    const activeLead = leads.find((l) => l.id === leadId);
    if (!activeLead) return;

    // Determinar o stage de destino - usar campo correto baseado no tipo de funil
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);

    // Obter stage atual do lead baseado no tipo de funil
    const activeStage = usingCustomFunnel
      ? (activeLead.funnel_stage_id || stages[0]?.id)
      : (activeLead.stage || "NOVO");

    // Determinar stage de destino baseado no tipo de funil
    const targetStage = isDroppedOverStage
      ? overId
      : usingCustomFunnel
        ? (overLead?.funnel_stage_id || activeStage)
        : (overLead?.stage || activeStage);

    // Se for dropado no mesmo lugar, não fazer nada
    if (targetStage === activeStage && (isDroppedOverStage || leadId === overId)) {
      return;
    }

    // Verificar se o stage de destino é um stage de ganho (won)
    const targetStageData = stages.find(s => s.id === targetStage);
    if (targetStageData?.stageData?.stage_type === 'won' && activeStage !== targetStage) {
      // Verificar se o lead tem valor definido
      if (!activeLead.valor || activeLead.valor <= 0) {
        toast.error("Este lead não possui um valor definido. Por favor, adicione um valor antes de confirmar a venda.");
        return;
      }

      // Mostrar dialog de confirmação
      setWonConfirmation({
        show: true,
        lead: activeLead,
        targetStage,
        event,
      });
      return;
    }

    // Processar movimentação normal
    await processLeadMove(event, leadId, overId, activeLead, targetStage, activeStage, isDroppedOverStage, overLead);
  }, [leads, stages, user?.id, usingCustomFunnel, activeFunnel]);

  const processLeadMove = async (
    event: DragEndEvent,
    leadId: string,
    overId: string,
    activeLead: Lead,
    targetStage: string,
    activeStage: string,
    isDroppedOverStage: boolean,
    overLead?: Lead
  ) => {

    try {
      if (isDroppedOverStage) {
        // Dropado diretamente em uma coluna
        const targetStageLeads = leadsByStage.get(targetStage) || [];
        const newPosition = targetStageLeads.length;

        // Atualizar estado local
        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? usingCustomFunnel
                ? { ...l, funnel_stage_id: targetStage, position: newPosition }
                : { ...l, stage: targetStage, position: newPosition }
              : l
          )
        );

        // Atualizar no banco
        const updateData: any = usingCustomFunnel
          ? { funnel_stage_id: targetStage, position: newPosition }
          : { stage: targetStage, position: newPosition };

        // Se for won stage, adicionar data_conclusao
        const targetStageData = stages.find(s => s.id === targetStage);
        if (targetStageData?.stageData?.stage_type === 'won') {
          updateData.data_conclusao = new Date().toISOString();
        }

        const { error } = await supabase
          .from("leads")
          .update(updateData)
          .eq("id", leadId);

        if (error) throw error;

        // Executar ações automáticas da etapa
        if (targetStageData?.stageData) {
          await executeStageActions(leadId, activeLead, targetStageData.stageData);
        }

        toast.success("Lead movido!");

      } else if (overLead) {
        // Dropado sobre outro lead
        if (targetStage === activeStage) {
          // Reordenando dentro da mesma coluna
          const stageLeads = leadsByStage.get(activeStage) || [];
          const oldIndex = stageLeads.findIndex((l) => l.id === leadId);
          const newIndex = stageLeads.findIndex((l) => l.id === overId);

          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
            return;
          }

          // Reordenar array - simplificado para manter TODOS os campos
          const reorderedLeads = arrayMove(stageLeads, oldIndex, newIndex);
          const reorderedWithPositions = reorderedLeads.map((lead, index) => ({
            ...lead,
            position: index,
          }));

          // Atualizar estado local
          setLeads((prev) =>
            prev.map((lead) => {
              const reordered = reorderedWithPositions.find((l) => l.id === lead.id);
              return reordered || lead;
            })
          );

          // Atualizar posições no banco
          await Promise.all(
            reorderedWithPositions.map((lead) =>
              supabase
                .from("leads")
                .update({ position: lead.position })
                .eq("id", lead.id)
            )
          );

          // Não executar ações automáticas ao reordenar na mesma coluna
          toast.success("Lead reordenado!");

        } else {
          // Movendo para outra coluna e posicionando sobre outro lead
          const activeStageLeads = leadsByStage.get(activeStage) || [];
          const targetStageLeads = leadsByStage.get(targetStage) || [];

          const newIndex = targetStageLeads.findIndex((l) => l.id === overId);

          if (newIndex === -1) return;

          // Verificar se é etapa won para adicionar data_conclusao
          const targetStageData = stages.find(s => s.id === targetStage);
          const isWonStage = targetStageData?.stageData?.stage_type === 'won';

          // Remover da coluna antiga e recalcular posições (atualizar campo correto)
          const updatedActiveStage = activeStageLeads
            .filter((l) => l.id !== leadId)
            .map((lead, index) => usingCustomFunnel
              ? { ...lead, position: index }
              : { ...lead, position: index }
            );

          // Adicionar na nova coluna na posição correta
          const updatedTargetStage = [...targetStageLeads];
          const leadToMove = usingCustomFunnel
            ? { ...activeLead, funnel_stage_id: targetStage }
            : { ...activeLead, stage: targetStage };
          updatedTargetStage.splice(newIndex, 0, leadToMove);
          const updatedTargetWithPositions = updatedTargetStage.map((lead, index) =>
            usingCustomFunnel
              ? { ...lead, position: index, funnel_stage_id: targetStage }
              : { ...lead, position: index, stage: targetStage }
          );

          // Combinar todos os leads - filtrar por campo correto
          setLeads((prev) => {
            const otherStageLeads = prev.filter((l) => {
              const leadStage = usingCustomFunnel ? l.funnel_stage_id : (l.stage || "NOVO");
              return leadStage !== activeStage && leadStage !== targetStage;
            });
            return [...otherStageLeads, ...updatedActiveStage, ...updatedTargetWithPositions];
          });

          // Atualizar no banco
          const updates = [
            ...updatedActiveStage.map((lead) =>
              supabase.from("leads").update({ position: lead.position }).eq("id", lead.id)
            ),
            ...updatedTargetWithPositions.map((lead) => {
              const updateData: any = usingCustomFunnel
                ? { position: lead.position, funnel_stage_id: lead.funnel_stage_id }
                : { position: lead.position, stage: lead.stage };

              // Adicionar data_conclusao se for won stage e for o lead sendo movido
              if (isWonStage && lead.id === leadId) {
                updateData.data_conclusao = new Date().toISOString();
              }

              return supabase.from("leads").update(updateData).eq("id", lead.id);
            }),
          ];

          await Promise.all(updates);

          // Executar ações automáticas da etapa se houver
          if (targetStageData?.stageData) {
            await executeStageActions(leadId, activeLead, targetStageData.stageData);
          }

          toast.success("Lead movido!");
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao mover lead");
      // Recarregar em caso de erro
      loadLeads(undefined, false);
    }
  };

  const handleWonConfirmation = async (confirmed: boolean) => {
    if (!confirmed || !wonConfirmation.lead || !wonConfirmation.event) {
      setWonConfirmation({ show: false, lead: null, targetStage: '', event: null });
      return;
    }

    const { lead, targetStage, event } = wonConfirmation;
    const { active, over } = event;

    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);

    // Usar campo correto baseado no tipo de funil
    const activeStage = usingCustomFunnel
      ? (lead.funnel_stage_id || stages[0]?.id)
      : (lead.stage || "NOVO");

    // Fechar o dialog
    setWonConfirmation({ show: false, lead: null, targetStage: '', event: null });

    // Processar a movimentação
    await processLeadMove(event, leadId, overId, lead, targetStage, activeStage, isDroppedOverStage, overLead);
  };

  const handleEditLead = useCallback((lead: Lead) => {
    setEditingLead(lead);
  }, []);

  // Executar ações automáticas baseadas no tipo da etapa
  const executeStageActions = async (leadId: string, lead: Lead, stage: any) => {
    if (!stage.stage_type || stage.stage_type === "custom") return;

    try {
      switch (stage.stage_type) {
        case "send_message":
          if (stage.stage_config?.message_template) {
            await sendAutomaticMessage(leadId, lead, stage.stage_config.message_template);
          }
          break;
        case "create_task":
          if (stage.stage_config?.task_title) {
            await createFollowUpTask(leadId, lead, stage.stage_config);
          }
          break;
        case "assign_agent":
          if (stage.stage_config?.agent_email) {
            await assignLeadToAgent(leadId, stage.stage_config.agent_email);
          }
          break;
        case "won":
          // Enviar evento de conversão para Meta Conversions API
          await sendMetaConversionEvent(leadId, lead);
          break;
        case "lost":
        case "discarded":
          // Ações futuras podem ser adicionadas aqui (ex: métricas, notificações)
          break;
      }
    } catch (error) {
      console.error("Erro ao executar ação automática:", error);
    }
  };

  const sendAutomaticMessage = async (leadId: string, lead: Lead, template: string) => {
    try {
      // Substituir variáveis no template
      const message = template.replace(/\{\{nome\}\}/g, lead.nome_lead);

      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("instance_name")
        .eq("status", "connected")
        .limit(1)
        .maybeSingle();

      if (!instances?.instance_name) {
        console.log("Nenhuma instância WhatsApp conectada");
        return;
      }

      await supabase.functions.invoke("send-whatsapp-message", {
        body: {
          instance_name: instances.instance_name,
          remoteJid: lead.telefone_lead,
          message_text: message,
          leadId: leadId,
        },
      });

      toast.success("Mensagem automática enviada!");
    } catch (error) {
      console.error("Erro ao enviar mensagem automática:", error);
    }
  };

  const createFollowUpTask = async (leadId: string, lead: Lead, config: any) => {
    try {
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user?.id)
        .limit(1)
        .maybeSingle();

      if (!orgMember) return;

      const { data: board } = await supabase
        .from("kanban_boards")
        .select("id, kanban_columns(id)")
        .eq("organization_id", orgMember.organization_id)
        .limit(1)
        .maybeSingle();

      if (!board?.kanban_columns?.[0]?.id) return;

      await supabase.from("kanban_cards").insert({
        column_id: board.kanban_columns[0].id,
        content: config.task_title,
        description: `Follow-up com lead: ${lead.nome_lead}`,
        estimated_time: config.estimated_time || null,
        created_by: user?.id,
      });

      toast.success("Tarefa de follow-up criada!");
    } catch (error) {
      console.error("Erro ao criar tarefa:", error);
    }
  };

  const assignLeadToAgent = async (leadId: string, agentEmail: string) => {
    try {
      const { data: profile } = await supabase
        .from("organization_members")
        .select("user_id, profiles(full_name)")
        .eq("email", agentEmail)
        .limit(1)
        .maybeSingle();

      if (!profile) {
        toast.error("Agente não encontrado");
        return;
      }

      const agentName = (profile as any).profiles?.full_name || agentEmail;
      const agentUserId = profile.user_id;

      // ATUALIZADO: usar UUID + TEXT para compatibilidade
      await supabase
        .from("leads")
        .update({
          responsavel_user_id: agentUserId,
          responsavel: agentName // Mantém TEXT para compatibilidade
        })
        .eq("id", leadId);

      toast.success(`Lead atribuído para ${agentName}!`);
    } catch (error) {
      console.error("Erro ao atribuir lead:", error);
    }
  };

  // Enviar evento de conversão para Meta Conversions API (funciona para todos os funis)
  const sendMetaConversionEvent = async (leadId: string, lead: Lead) => {
    try {
      const { error } = await supabase.functions.invoke("send-meta-conversion-event", {
        body: {
          lead_id: leadId,
          event_name: "Purchase",
          value: lead.valor || 0,
        },
      });

      if (error) {
        console.error("Erro ao enviar evento Meta:", error);
      } else {
        console.log("Evento de conversão enviado para Meta");
      }
    } catch (error) {
      console.error("Erro ao enviar evento Meta:", error);
    }
  };

  // Handler otimizado para mudança de aba com transição suave
  const handleTabChange = useCallback((value: string) => {
    setIsTabTransitioning(true);
    setSelectedFunnelId(value);
  }, []);

  const activeLead = useMemo(() =>
    leads.find((lead) => lead.id === activeId),
    [leads, activeId]
  );

  // Guard: Aguardar inicialização completa (auth + org)
  if (!isReady || !organizationId) {
    return <LoadingAnimation text="Carregando pipeline..." />;
  }

  if (initialLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stages.map((stage) => (
            <div key={stage.id} className="space-y-4">
              <Skeleton className="h-12 w-full" />
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <DndContext
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        sensors={sensors}
      >
        <div
          className="space-y-6"
          style={{ touchAction: 'none' }}
          data-dragging-active={isDraggingActive}
        >
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Pipeline de Vendas
              </h1>
              <p className="text-muted-foreground mt-1">
                Arraste e solte os cards para mover leads entre as etapas
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              <Button
                variant="outline"
                onClick={() => navigate("/funnel-builder")}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                Gerenciar Funis
              </Button>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou origem..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {allFunnels.length > 0 ? (
            <Tabs
              value={selectedFunnelId || allFunnels[0]?.id || "default"}
              onValueChange={handleTabChange}
              className="w-full pipeline-tabs"
            >
              <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
                {allFunnels.map((funnel) => {
                  const iconEmoji = funnel.icon ? ICON_EMOJI_MAP[funnel.icon] : null;
                  return (
                    <TabsTrigger
                      key={funnel.id}
                      value={funnel.id}
                      className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 transition-all duration-200 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        {iconEmoji && (
                          <span className="text-lg">{iconEmoji}</span>
                        )}
                        <span>{funnel.name}</span>
                        {funnel.is_default && (
                          <span className="text-xs text-muted-foreground">(Padrão)</span>
                        )}
                      </div>
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent
                value={selectedFunnelId || allFunnels[0]?.id || "default"}
                className="mt-6"
              >
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScrollContainerScroll}
                  className={cn(
                    "flex gap-3 overflow-x-auto pb-4 scrollbar-hide pipeline-content",
                    isTabTransitioning && "transitioning"
                  )}
                  data-dragging-active={isDraggingActive}
                >
                  {stages.map((stage) => {
                    const stageLeads = leadsByStage.get(stage.id) || [];
                    return (
                      <PipelineColumn
                        key={`${selectedFunnelId}-${stage.id}`}
                        id={stage.id}
                        title={stage.title}
                        count={stageLeads.length}
                        color={stage.color}
                        leads={stageLeads}
                        isEmpty={stageLeads.length === 0}
                        onLeadUpdate={() => loadLeads(undefined, false)}
                        onEdit={setEditingLead}
                        leadItems={leadItems}
                        leadTagsMap={leadTagsMap}
                        isDraggingActive={isDraggingActive}
                      />
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div
              ref={scrollContainerRef}
              onScroll={handleScrollContainerScroll}
              className={cn(
                "flex gap-3 overflow-x-auto pb-4 scrollbar-hide pipeline-content",
                isTabTransitioning && "transitioning"
              )}
              data-dragging-active={isDraggingActive}
            >
              {stages.map((stage) => {
                const stageLeads = leadsByStage.get(stage.id) || [];
                return (
                  <PipelineColumn
                    key={`default-${stage.id}`}
                    id={stage.id}
                    title={stage.title}
                    count={stageLeads.length}
                    color={stage.color}
                    leads={stageLeads}
                    isEmpty={stageLeads.length === 0}
                    onLeadUpdate={() => loadLeads(undefined, false)}
                    onEdit={handleEditLead}
                    leadItems={leadItems}
                    leadTagsMap={leadTagsMap}
                    isDraggingActive={isDraggingActive}
                  />
                );
              })}
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeLead ? (
            <LeadCard
              id={activeLead.id}
              name={activeLead.nome_lead}
              phone={activeLead.telefone_lead}
              date={(activeLead as any).formattedDate || new Date(activeLead.created_at).toLocaleString("pt-BR")}
              avatarUrl={activeLead.avatar_url}
              stage={activeLead.stage}
              value={activeLead.valor}
              createdAt={activeLead.created_at}
              source={activeLead.source}
              description={activeLead.descricao_negocio}
              leadItems={leadItems[activeLead.id] || EMPTY_ITEMS}
              leadTags={leadTagsMap[activeLead.id] || EMPTY_TAGS}
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Modal de Edição - FORA do DndContext */}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          open={!!editingLead}
          onClose={() => setEditingLead(null)}
          onUpdate={async () => {
            if (editingLead) {
              const { data } = await supabase
                .from("leads")
                .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio")
                .eq("id", editingLead.id)
                .single();
              if (data) {
                setLeads(prev => prev.map(l => l.id === data.id ? { ...l, ...data } : l));
              }
            }
          }}
        />
      )}

      {/* Dialog de Confirmação de Venda */}
      <AlertDialog open={wonConfirmation.show} onOpenChange={(open) => !open && handleWonConfirmation(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center justify-center mb-4">
              <img
                src={saleConfirmationIcon}
                alt="Confirmar Venda"
                className="w-24 h-24"
              />
            </div>
            <AlertDialogTitle className="text-center text-2xl">Confirmar Venda</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2">
              <p className="text-center">
                O lead <strong>{wonConfirmation.lead?.nome_lead}</strong> está sendo movido para uma etapa de ganho/venda.
              </p>
              <p className="font-semibold text-primary text-center text-lg">
                💰 Valor: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(wonConfirmation.lead?.valor || 0)}
              </p>
              <p className="text-sm text-center">
                Este valor será contabilizado na produção do mês atual. Confirma que o lead realmente fechou uma negociação?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleWonConfirmation(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handleWonConfirmation(true)}>
              Confirmar Venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Barra de rolagem fixa no rodapé */}
      {showScrollbar && (
        <div
          ref={scrollTrackRef}
          className="fixed bottom-3 left-[var(--sidebar-width,256px)] right-6 h-2 z-40 bg-muted/20 rounded-full cursor-pointer transition-all hover:h-3 hover:bg-muted/30"
          onClick={handleScrollbarTrackClick}
        >
          <div
            className="h-full bg-muted-foreground/25 rounded-full hover:bg-muted-foreground/40 transition-colors cursor-grab active:cursor-grabbing"
            style={{
              width: `${scrollThumbWidth}%`,
              marginLeft: `${scrollThumbPosition}%`
            }}
            onMouseDown={handleThumbMouseDown}
          />
        </div>
      )}
    </>
  );
};

export default Pipeline;
