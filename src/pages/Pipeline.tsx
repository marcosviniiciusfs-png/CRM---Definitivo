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
import { Settings2, Search, Plus, Download, Upload, CalendarIcon, Users, Shield, LayoutGrid, List, Check } from "lucide-react";
import { FunnelPermissionsDialog } from "@/components/FunnelPermissionsDialog";
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
import { AddLeadModal } from "@/components/AddLeadModal";
import { ImportLeadsModal } from "@/components/ImportLeadsModal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

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
  const { toast: toastUI } = useToast();

  // States for features migrated from Leads page
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
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
  // Refs para evitar stale closure na subscrição Realtime (sem recriar o canal ao mudar funil)
  const activeFunnelRef = useRef<any>(null);
  const usingCustomFunnelRef = useRef<boolean>(false);
  const orgIdRef = useRef<string | undefined>(undefined);
  const pauseRealtimeRef = useRef<boolean>(false);
  // Refs de segurança: permissões e userId para filtrar eventos Realtime sem stale closure
  const canViewAllLeadsRef = useRef<boolean>(false);
  const currentUserIdRef = useRef<string | undefined>(undefined);
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
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [permissionsFunnelId, setPermissionsFunnelId] = useState<string | null>(null);
  // Mapa user_id -> { full_name, avatar_url } para exibir no card
  const [profilesMap, setProfilesMap] = useState<Record<string, { full_name: string; avatar_url: string | null }>>({});
  // Mapa leadId -> { reuniao, venda } para ícones de agendamento nos cards
  const [agendamentosMap, setAgendamentosMap] = useState<Record<string, { reuniao?: string | null; venda?: string | null }>>({});
  // Mapa leadId -> { fromName, minutes } para badge de redistribuição nos cards
  const [redistributedMap, setRedistributedMap] = useState<Record<string, { fromName: string; minutes: number }>>({});;

  // Scrollbar fixa customizada
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollTrackRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; scrollLeft: number } | null>(null);
  const [scrollThumbWidth, setScrollThumbWidth] = useState(20);
  const [scrollThumbPosition, setScrollThumbPosition] = useState(0);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [isDraggingScrollbar, setIsDraggingScrollbar] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // View mode: 'kanban' or 'list'
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');

  // Bulk selection for list view
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

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

  // Manter refs sincronizadas com o estado (para uso na callback da subscrição Realtime)
  useEffect(() => { activeFunnelRef.current = activeFunnel; }, [activeFunnel]);
  useEffect(() => { usingCustomFunnelRef.current = usingCustomFunnel; }, [usingCustomFunnel]);
  useEffect(() => { orgIdRef.current = organizationId; }, [organizationId]);
  useEffect(() => { pauseRealtimeRef.current = pauseRealtime; }, [pauseRealtime]);
  // Sincronizar refs de segurança com permissões e userId atuais
  useEffect(() => { canViewAllLeadsRef.current = permissions.canViewAllLeads; }, [permissions.canViewAllLeads]);
  useEffect(() => { currentUserIdRef.current = user?.id; }, [user?.id]);

  // Inicialização de áudio e subscrição a novos leads
  useEffect(() => {
    // Inicializar áudio de notificação
    audioRef.current = new Audio("/notification.mp3");
    audioRef.current.volume = 0.5;

    // Usar nome único por mount para evitar conflito de channel ao re-navegar
    const channelName = channelIdRef.current;

    // Subscrever a novos leads e agendamentos (canal criado apenas uma vez; valores dinâmicos via refs)
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_activities',
        },
        (payload) => {
          const activityType = payload.new?.activity_type;
          const leadId = payload.new?.lead_id;
          if (!leadId || (activityType !== 'Agendamento Reunião' && activityType !== 'Agendamento Venda')) return;
          try {
            const content = JSON.parse(payload.new.content);
            const isoDate = `${content.data}T${content.hora}:00`;
            setAgendamentosMap(prev => {
              const current = prev[leadId] || {};
              if (activityType === 'Agendamento Reunião') {
                return { ...prev, [leadId]: { ...current, reuniao: isoDate } };
              } else {
                return { ...prev, [leadId]: { ...current, venda: isoDate } };
              }
            });
          } catch (err) {
            console.warn('Erro ao parsear agendamento realtime:', err);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'lead_distribution_history',
        },
        async (payload) => {
          const row = payload.new as any;
          if (!row.is_redistribution || !row.lead_id) return;
          // Buscar nome do colaborador anterior e timeout do config
          const [profileRes, configRes] = await Promise.all([
            row.from_user_id
              ? supabase.from('profiles').select('full_name').eq('user_id', row.from_user_id).maybeSingle()
              : Promise.resolve({ data: null }),
            row.config_id
              ? supabase.from('lead_distribution_configs').select('redistribution_timeout_minutes').eq('id', row.config_id).maybeSingle()
              : Promise.resolve({ data: null }),
          ]);
          setRedistributedMap(prev => ({
            ...prev,
            [row.lead_id]: {
              fromName: (profileRes.data as any)?.full_name || '',
              minutes: (configRes.data as any)?.redistribution_timeout_minutes || 0,
            },
          }));
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'leads'
        },
        (payload) => {
          // Pausar processamento durante drag (usar ref para não recriar o canal)
          if (pauseRealtimeRef.current) return;

          const newLead = payload.new as Lead;

          // Filtro por organização (segurança – usar ref para valor atualizado)
          const currentOrgId = orgIdRef.current;
          if (currentOrgId && (newLead as any).organization_id !== currentOrgId) return;

          // Garantir que o lead pertence ao funil atualmente selecionado (usar refs, sem stale closure)
          const af = activeFunnelRef.current;
          const uc = usingCustomFunnelRef.current;

          if (uc && af) {
            if (newLead.funnel_id !== af.id) {
              return;
            }
          } else if (!uc && newLead.funnel_id !== null) {
            // Se estamos no funil padrão, ignorar leads de funis customizados
            return;
          }

          // SEGURANÇA: Verificar permissão antes de exibir o lead via Realtime.
          // Membros sem canViewAllLeads só podem ver leads atribuídos a eles.
          // Sem este filtro, leads sem responsável apareceriam momentaneamente para todos.
          if (!canViewAllLeadsRef.current) {
            const assignedTo = (newLead as any).responsavel_user_id;
            if (assignedTo !== currentUserIdRef.current) return;
          }

          // Verificar se é realmente um lead novo (não carregado anteriormente)
          if (!leadIdsRef.current.has(newLead.id)) {
            // Adicionar ao estado
            setLeads(prev => [newLead, ...prev]);
            leadIdsRef.current.add(newLead.id);
            // Carregar perfil do responsável se disponível
            const uid = (newLead as any).responsavel_user_id;
            if (uid) {
              supabase
                .from('profiles')
                .select('user_id, full_name, avatar_url')
                .eq('user_id', uid)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setProfilesMap(prev => ({
                      ...prev,
                      [data.user_id]: { full_name: data.full_name || '', avatar_url: data.avatar_url },
                    }));
                  }
                });
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []); // Deps vazias: subscrição criada uma vez por mount; valores dinâmicos acessados via refs

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

    // Carregar colaboradores para filtro de responsável
    // NOTA: organization_members NÃO tem FK para profiles — duas queries separadas
    const loadColaboradores = async () => {
      const { data: membersData } = await supabase
        .from('organization_members')
        .select('user_id, email, display_name')
        .eq('organization_id', organizationId);

      if (membersData && membersData.length > 0) {
        const userIds = membersData.map((m: any) => m.user_id).filter(Boolean);
        let profilesMap: Record<string, string | null> = {};
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, full_name')
            .in('user_id', userIds);
          if (profiles) {
            profilesMap = profiles.reduce((acc, p) => {
              acc[p.user_id] = p.full_name;
              return acc;
            }, {} as Record<string, string | null>);
          }
        }
        // Fallback via RPC (includes auth.users metadata)
        const rpcPipelineNamesMap: Record<string, string | null> = {};
        const { data: rpcPipelineMembers } = await supabase.rpc('get_organization_members_masked');
        (rpcPipelineMembers || []).forEach((rm: any) => { if (rm.user_id) rpcPipelineNamesMap[rm.user_id] = rm.full_name; });

        setColaboradores(membersData.map((m: any) => ({
          user_id: m.user_id,
          full_name: profilesMap[m.user_id] || rpcPipelineNamesMap[m.user_id] || m.display_name || m.email || 'Sem nome',
        })));
      }
    };
    loadColaboradores();

    return () => {
      isMounted = false;
    };
  }, [selectedFunnelId, user?.id, organizationId, isReady, permissions.canViewAllLeads, permissions.loading]);

  const handleExportCSV = () => {
    import("xlsx").then((XLSX) => {
      const data = filteredLeads.map((lead) => ({
        "Nome": lead.nome_lead || "",
        "Email": (lead as any).email || "",
        "Telefone": lead.telefone_lead || "",
        "Responsável": lead.responsavel || "",
        "Etapa": lead.stage || "NOVO",
        "Origem": lead.source || "",
        "Valor (R$)": lead.valor ? parseFloat(String(lead.valor)) : 0,
        "Criado em": format(new Date(lead.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      worksheet["!cols"] = [
        { wch: 30 }, // Nome
        { wch: 30 }, // Email
        { wch: 18 }, // Telefone
        { wch: 25 }, // Responsável
        { wch: 18 }, // Etapa
        { wch: 15 }, // Origem
        { wch: 15 }, // Valor
        { wch: 20 }, // Criado em
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Leads");
      XLSX.writeFile(workbook, `leads_${format(new Date(), "yyyy-MM-dd")}.xlsx`);

      toastUI({ title: "Exportação concluída", description: `${filteredLeads.length} leads exportados` });
    }).catch((err) => {
      console.error("Erro ao exportar:", err);
      toastUI({ title: "Erro na exportação", description: "Não foi possível gerar o arquivo Excel", variant: "destructive" });
    });
  };

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

      // PERMISSÕES: Colaboradores (não owners/admins) só veem funis que têm acesso
      let visibleFunnels = funnels;
      if (!permissions.canManagePipeline && user?.id) {
        // Buscar funis com acesso liberado para este usuário
        const { data: accessList } = await supabase
          .from("funnel_collaborators")
          .select("funnel_id")
          .eq("user_id", user.id)
          .eq("organization_id", organizationId);

        const accessibleIds = new Set((accessList || []).map((a: any) => a.funnel_id));
        // Mostrar apenas funis não-restritos OU onde o usuário tem acesso explícito
        visibleFunnels = funnels.filter(
          (f: any) => !f.is_restricted || accessibleIds.has(f.id)
        );
      }

      // Armazenar todos os funis visíveis
      setAllFunnels(visibleFunnels);

      // Se não há funis visíveis, usar padrão
      if (visibleFunnels.length === 0) {
        setStages(DEFAULT_STAGES);
        setUsingCustomFunnel(false);
        setActiveFunnel(null);
        return { isCustom: false, funnel: null };
      }

      // Selecionar o funil apropriado sem criar loop
      const funnelToActivate = selectedFunnelId
        ? visibleFunnels.find((f) => f.id === selectedFunnelId) || visibleFunnels[0]
        : visibleFunnels[0];

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
        .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count")
        .eq("organization_id", organizationId);

      // SEGURANÇA: Members só veem leads atribuídos a eles (usando UUID)
      if (!permissions.canViewAllLeads && user?.id) {
        query = query.eq("responsavel_user_id", user.id);
      }

      // Se estiver usando funil customizado, filtrar leads desse funil OU sem funil (orphans)
      if (isCustom && funnel) {
        // Inclui leads do funil específico E leads sem funil atribuído (orphans da mesma org)
        query = query.or(`funnel_id.eq.${funnel.id},funnel_id.is.null`);
      } else {
        // No funil padrão (legado), mostrar apenas leads que não pertencem a nenhum funil customizado
        query = query.is("funnel_id", null);
      }

      const { data, error } = await query
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(200); // Limitar para performance

      if (error) throw error;

      // Merge: preservar leads que chegaram via Realtime durante a query (evitar race condition)
      setLeads(prev => {
        if (!data || data.length === 0) return prev;
        const dbIds = new Set(data.map((l: any) => l.id));
        // Leads que estão no estado atual mas não vieram do banco (chegaram via Realtime)
        const realtimeOnly = prev.filter(l => !dbIds.has(l.id));
        return [...data, ...realtimeOnly];
      });

      // Armazenar IDs dos leads (DB + Realtime) para deduplicação
      if (data) {
        const existingRtIds = [...leadIdsRef.current];
        leadIdsRef.current = new Set([...data.map((lead: any) => lead.id), ...existingRtIds]);
        // Buscar todos lead_items, tags e perfis de responsáveis de uma vez
        const responsavelIds = [...new Set(data.map(l => l.responsavel_user_id).filter(Boolean))] as string[];
        await Promise.all([
          loadLeadItems(data.map(l => l.id)),
          loadLeadTags(data.map(l => l.id)),
          loadProfiles(responsavelIds),
          loadAgendamentos(data.map(l => l.id)),
          loadRedistributionData(data.map(l => l.id)),
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

  const loadProfiles = async (userIds: string[]) => {
    if (userIds.length === 0) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, full_name, avatar_url')
      .in('user_id', userIds);

    if (!error && data) {
      const map: Record<string, { full_name: string; avatar_url: string | null }> = {};
      data.forEach((p) => {
        map[p.user_id] = { full_name: p.full_name || '', avatar_url: p.avatar_url };
      });
      setProfilesMap((prev) => ({ ...prev, ...map }));
    }
  };

  const loadAgendamentos = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    const { data } = await supabase
      .from('lead_activities')
      .select('lead_id, activity_type, content, created_at')
      .in('lead_id', leadIds)
      .in('activity_type', ['Agendamento Reunião', 'Agendamento Venda'])
      .order('created_at', { ascending: false });

    if (data) {
      const map: Record<string, { reuniao?: string | null; venda?: string | null }> = {};
      data.forEach((a: any) => {
        if (!map[a.lead_id]) map[a.lead_id] = {};
        try {
          const parsed = JSON.parse(a.content);
          const isoDate = parsed.data && parsed.hora ? `${parsed.data}T${parsed.hora}:00` : null;
          if (a.activity_type === 'Agendamento Reunião' && !map[a.lead_id].reuniao) {
            map[a.lead_id].reuniao = isoDate;
          } else if (a.activity_type === 'Agendamento Venda' && !map[a.lead_id].venda) {
            map[a.lead_id].venda = isoDate;
          }
        } catch {}
      });
      setAgendamentosMap(map);
    }
  };

  const loadRedistributionData = async (leadIds: string[]) => {
    if (leadIds.length === 0) return;

    // Buscar a redistribuição mais recente por lead
    const { data } = await supabase
      .from('lead_distribution_history')
      .select('lead_id, from_user_id, config_id, created_at')
      .in('lead_id', leadIds)
      .eq('is_redistribution', true)
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) return;

    // Pegar apenas a entrada mais recente por lead
    const latestByLead = new Map<string, typeof data[0]>();
    data.forEach((row: any) => {
      if (!latestByLead.has(row.lead_id)) {
        latestByLead.set(row.lead_id, row);
      }
    });

    // Buscar nomes dos "from_user_id" e timeout dos configs
    const fromUserIds = [...new Set([...latestByLead.values()].map(r => r.from_user_id).filter(Boolean))];
    const configIds = [...new Set([...latestByLead.values()].map(r => r.config_id).filter(Boolean))];

    const [profilesRes, configsRes] = await Promise.all([
      fromUserIds.length > 0
        ? supabase.from('profiles').select('user_id, full_name').in('user_id', fromUserIds)
        : Promise.resolve({ data: [] }),
      configIds.length > 0
        ? supabase.from('lead_distribution_configs').select('id, redistribution_timeout_minutes').in('id', configIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profilesById: Record<string, string> = {};
    (profilesRes.data || []).forEach((p: any) => { profilesById[p.user_id] = p.full_name || ''; });

    const configsById: Record<string, number> = {};
    (configsRes.data || []).forEach((c: any) => { configsById[c.id] = c.redistribution_timeout_minutes || 0; });

    const map: Record<string, { fromName: string; minutes: number }> = {};
    latestByLead.forEach((row, leadId) => {
      map[leadId] = {
        fromName: row.from_user_id ? (profilesById[row.from_user_id] || '') : '',
        minutes: row.config_id ? (configsById[row.config_id] || 0) : 0,
      };
    });

    setRedistributedMap(map);
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
    let result = leadsWithFormattedDates;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      result = result.filter((lead) =>
        lead.nome_lead?.toLowerCase().includes(term) ||
        lead.email?.toLowerCase().includes(term) ||
        lead.telefone_lead?.toLowerCase().includes(term) ||
        lead.source?.toLowerCase().includes(term) ||
        lead.responsavel?.toLowerCase().includes(term)
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(lead => (lead.stage || "NOVO") === statusFilter);
    }

    if (sourceFilter !== "all") {
      result = result.filter(lead => (lead.source || "") === sourceFilter);
    }

    if (responsibleFilter !== "all") {
      result = result.filter(lead => lead.responsavel_user_id === responsibleFilter);
    }

    if (dateRange.from || dateRange.to) {
      result = result.filter(lead => {
        const d = new Date(lead.created_at);
        const fromOk = !dateRange.from || d >= dateRange.from;
        const toOk = !dateRange.to || d <= new Date(dateRange.to.getTime() + 86400000);
        return fromOk && toOk;
      });
    }

    return result;
  }, [leadsWithFormattedDates, searchTerm, statusFilter, sourceFilter, responsibleFilter, dateRange]);

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

  // Calcular quais leads são duplicados (mesmo email ou telefone na mesma org)
  const duplicateLeadIds = useMemo(() => {
    const phoneMap = new Map<string, string[]>(); // phone -> lead ids
    const emailMap = new Map<string, string[]>(); // email -> lead ids
    filteredLeads.forEach((lead) => {
      const phone = lead.telefone_lead?.replace(/\D/g, "");
      if (phone) {
        const arr = phoneMap.get(phone) || [];
        arr.push(lead.id);
        phoneMap.set(phone, arr);
      }
      const email = lead.email?.toLowerCase().trim();
      if (email) {
        const arr = emailMap.get(email) || [];
        arr.push(lead.id);
        emailMap.set(email, arr);
      }
    });
    const duplicates = new Set<string>();
    phoneMap.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => duplicates.add(id)); });
    emailMap.forEach((ids) => { if (ids.length > 1) ids.forEach((id) => duplicates.add(id)); });
    return duplicates;
  }, [filteredLeads]);

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

    // Verificar permissão de mover leads no pipeline
    if (permissions.role === 'member' && !permissions.canMoveLeadsPipeline) {
      toast.error("Você não tem permissão para mover leads no pipeline. Solicite acesso ao administrador.");
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
  }, [leads, stages, user?.id, usingCustomFunnel, activeFunnel, permissions.role, permissions.canMoveLeadsPipeline]);

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

  const handleDeleteLead = async (lead: Lead) => {
    setLeadToDelete(lead);
  };

  const confirmDeleteLead = async () => {
    if (!leadToDelete) return;
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadToDelete.id);

      if (error) {
        toast.error('Erro ao excluir lead');
        return;
      }

      setLeads(prev => prev.filter(l => l.id !== leadToDelete.id));
      toast.success(`Lead "${leadToDelete.nome_lead}" excluído com sucesso`);
    } catch (err) {
      toast.error('Erro inesperado ao excluir lead');
    } finally {
      setLeadToDelete(null);
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

      const { data: board } = await supabase
        .from("kanban_boards")
        .select("id, kanban_columns(id)")
        .eq("organization_id", organizationId)
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

  // Guard: membros com cargo personalizado que não têm permissão para ver o pipeline
  if (!permissions.loading && permissions.role === 'member' && permissions.customRoleId !== null && !permissions.canViewPipeline) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center px-4">
        <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
        <h2 className="text-xl font-semibold">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-md">
          Você não tem permissão para visualizar o funil de vendas.
          Entre em contato com o administrador da organização para solicitar acesso.
        </p>
      </div>
    );
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
      {/* Header Section - Always Visible */}
      <div className="space-y-6">
        <div className="space-y-3">
          {/* Linha 1: Título + Ações */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Funil de Vendas
              </h1>
              <p className="text-muted-foreground mt-1">
                {viewMode === 'kanban'
                  ? "Arraste e solte os cards para mover leads entre as etapas"
                  : "Visualize e gerencie seus leads em formato de lista"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* View Mode Toggle */}
              <div className="flex items-center border rounded-md overflow-hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none h-8 px-3",
                    viewMode === 'kanban' && "bg-primary/10 text-primary"
                  )}
                  onClick={() => setViewMode('kanban')}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />
                  Funil
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "rounded-none h-8 px-3 border-l",
                    viewMode === 'list' && "bg-primary/10 text-primary"
                  )}
                  onClick={() => setViewMode('list')}
                >
                  <List className="h-4 w-4 mr-1" />
                  Lista
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate("/funnel-builder")}>
                <Settings2 className="h-4 w-4 mr-2" />
                Gerenciar Funis
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Button>
              {permissions.canViewAllLeads && (
                <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                  <Upload className="h-4 w-4 mr-2" />
                  Importar
                </Button>
              )}
              {permissions.canCreateLeads && (
                <Button size="sm" className="bg-primary hover:bg-primary/90" onClick={() => setShowAddModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Lead
                </Button>
              )}
            </div>
          </div>
          {/* Linha 2: Busca + Filtros */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email, telefone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[145px] bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="NOVO">Novo</SelectItem>
                <SelectItem value="EM_ATENDIMENTO">Em Atendimento</SelectItem>
                <SelectItem value="FECHADO">Fechado</SelectItem>
                <SelectItem value="PERDIDO">Perdido</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="h-9 w-[145px] bg-background">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Origens</SelectItem>
                <SelectItem value="Facebook Leads">Facebook</SelectItem>
                <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                <SelectItem value="Webhook">Webhook</SelectItem>
                <SelectItem value="Manual">Manual</SelectItem>
              </SelectContent>
            </Select>
            <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
              <SelectTrigger className="h-9 w-[155px] bg-background">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Responsáveis</SelectItem>
                {colaboradores.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-9 text-sm", (dateRange.from || dateRange.to) && "border-primary text-primary")}
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {dateRange.from && dateRange.to
                    ? `${format(dateRange.from, "dd/MM", { locale: ptBR })} - ${format(dateRange.to, "dd/MM", { locale: ptBR })}`
                    : "Período"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex flex-col gap-1 p-2 border-b">
                  <Button variant="ghost" size="sm" className="justify-start text-xs"
                    onClick={() => setDateRange({ from: subDays(new Date(), 7), to: new Date() })}>
                    Últimos 7 dias
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start text-xs"
                    onClick={() => setDateRange({ from: subDays(new Date(), 30), to: new Date() })}>
                    Últimos 30 dias
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start text-xs"
                    onClick={() => setDateRange({ from: undefined, to: undefined })}>
                    Limpar filtro
                  </Button>
                </div>
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                  numberOfMonths={1}
                  locale={ptBR}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* View Mode Content */}
        {viewMode === 'list' ? (
          /* List View */
          <div className="border rounded-lg overflow-hidden bg-background">
            {/* Bulk Actions Bar */}
            {selectedLeadIds.size > 0 && (
              <div className="bg-primary/10 border-b border-primary/20 p-3 flex items-center gap-3">
                <span className="text-sm font-medium text-primary">
                  {selectedLeadIds.size} lead{selectedLeadIds.size > 1 ? 's' : ''} selecionado{selectedLeadIds.size > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="outline" size="sm" onClick={() => setSelectedLeadIds(new Set())}>
                    Limpar seleção
                  </Button>
                </div>
              </div>
            )}
            {/* Table Header */}
            <div className="bg-muted/50 flex items-center px-3 py-2.5 text-xs font-medium text-muted-foreground border-b">
              <Checkbox
                checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setSelectedLeadIds(new Set(filteredLeads.map(l => l.id)));
                  } else {
                    setSelectedLeadIds(new Set());
                  }
                }}
                className="mr-3"
              />
              <span className="w-[200px]">Nome</span>
              <span className="w-[120px]">Telefone</span>
              <span className="w-[150px]">Etapa</span>
              <span className="w-[100px]">Valor</span>
              <span className="w-[100px]">Origem</span>
              <span className="w-[120px]">Responsável</span>
              <span className="flex-1">Data</span>
              <span className="w-[60px]"></span>
            </div>
            {/* Table Rows */}
            <div className="max-h-[calc(100vh-350px)] overflow-y-auto">
              {filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Nenhum lead encontrado</p>
                  <p className="text-sm">Tente ajustar os filtros ou adicione um novo lead</p>
                </div>
              ) : (
                filteredLeads.map((lead) => {
                  const isSelected = selectedLeadIds.has(lead.id);
                  const stage = stages.find(s => s.id === (lead.funnel_stage_id || lead.stage));
                  const responsible = lead.responsavel_user_id ? profilesMap[lead.responsavel_user_id] : null;

                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        "flex items-center px-3 py-2.5 text-sm border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer",
                        isSelected && "bg-primary/10"
                      )}
                      onClick={() => setEditingLead(lead)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelectedLeadIds(prev => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(lead.id);
                            } else {
                              next.delete(lead.id);
                            }
                            return next;
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="mr-3"
                      />
                      <span className="w-[200px] font-medium truncate">{lead.nome_lead || "Sem nome"}</span>
                      <span className="w-[120px] truncate text-muted-foreground">{lead.telefone_lead || "-"}</span>
                      <span className="w-[150px]">
                        <span className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          stage?.color?.replace('bg-', 'bg-').replace('-500', '-500/20 text-').replace('bg-', '') ||
                          "bg-muted text-muted-foreground"
                        )}>
                          {stage?.title || lead.stage || "-"}
                        </span>
                      </span>
                      <span className="w-[100px] font-medium">
                        {lead.valor
                          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(lead.valor)
                          : "-"}
                      </span>
                      <span className="w-[100px] truncate text-muted-foreground">{lead.source || "-"}</span>
                      <span className="w-[120px] truncate text-muted-foreground">
                        {responsible?.full_name || lead.responsavel || "-"}
                      </span>
                      <span className="flex-1 text-muted-foreground">
                        {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                      </span>
                      <span className="w-[60px] flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLead(lead);
                          }}
                        >
                          ×
                        </Button>
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          /* Kanban View */
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <div
              style={{ touchAction: 'none' }}
              data-dragging-active={isDraggingActive}
            >
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
                        <div key={funnel.id} className="flex items-center">
                          <TabsTrigger
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
                          {/* Botão de permissões: visível apenas para owners/admins */}
                          {permissions.canManagePipeline && (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPermissionsFunnelId(funnel.id);
                              }}
                              className={cn(
                                "ml-1 p-1 rounded transition-colors",
                                funnel.is_restricted
                                  ? "text-amber-500 hover:text-amber-400"
                                  : "text-muted-foreground hover:text-foreground"
                              )}
                              title="Configurar permissões de acesso"
                            >
                              <Users className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
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
                            onDelete={handleDeleteLead}
                            leadItems={leadItems}
                            leadTagsMap={leadTagsMap}
                            isDraggingActive={isDraggingActive}
                            profilesMap={profilesMap}
                            duplicateLeadIds={duplicateLeadIds}
                            agendamentosMap={agendamentosMap}
                            redistributedMap={redistributedMap}
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
                        onDelete={handleDeleteLead}
                        leadItems={leadItems}
                        leadTagsMap={leadTagsMap}
                        isDraggingActive={isDraggingActive}
                        profilesMap={profilesMap}
                        duplicateLeadIds={duplicateLeadIds}
                        agendamentosMap={agendamentosMap}
                        redistributedMap={redistributedMap}
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
        )}
      </div>

      {/* Modal de Edição - FORA do DndContext */}
      {showAddModal && (
        <AddLeadModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => setShowAddModal(false)}
        />
      )}

      {showImportModal && (
        <ImportLeadsModal
          open={showImportModal}
          onOpenChange={setShowImportModal}
          organizationId={organizationId}
        />
      )}

      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          open={!!editingLead}
          onClose={() => setEditingLead(null)}
          onUpdate={async () => {
            if (editingLead) {
              const { data } = await supabase
                .from("leads")
                .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio, duplicate_attempts_count")
                .eq("id", editingLead.id)
                .single();
              if (data) {
                setLeads(prev => prev.map(l => l.id === data.id ? { ...l, ...data } : l));
                // Se o lead tem um novo responsável, garantir que o perfil está no mapa
                if (data.responsavel_user_id && !profilesMap[data.responsavel_user_id]) {
                  loadProfiles([data.responsavel_user_id]);
                }
              }
              // Recarregar agendamentos para refletir ícones de calendário em tempo real
              await loadAgendamentos([editingLead.id]);
            }
          }}
        />
      )}

      {/* Dialog de Confirmação de Exclusão de Lead */}
      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o lead{" "}
              <strong>{leadToDelete?.nome_lead || "sem nome"}</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setLeadToDelete(null)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteLead}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Dialog de Permissões do Funil */}
      {permissionsFunnelId && organizationId && (
        <FunnelPermissionsDialog
          funnel={allFunnels.find((f) => f.id === permissionsFunnelId) || { id: permissionsFunnelId, name: "" }}
          organizationId={organizationId}
          onClose={() => {
            setPermissionsFunnelId(null);
            // Recarregar funis para refletir mudanças de is_restricted
            loadFunnel();
          }}
        />
      )}

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
