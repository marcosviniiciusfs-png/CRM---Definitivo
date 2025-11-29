import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { LeadCard } from "@/components/LeadCard";
import { toast } from "sonner";
import { EditLeadModal } from "@/components/EditLeadModal";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Constantes vazias estáveis para evitar novas referências
const EMPTY_ITEMS: any[] = [];
const EMPTY_TAGS: Array<{ id: string; name: string; color: string }> = [];

type LeadItems = Record<string, any[]>;
type LeadTagsMap = Record<string, Array<{ id: string; name: string; color: string }>>;

// Etapas padrão (quando não há funil customizado)
const DEFAULT_STAGES = [
  { id: "NOVO", title: "Novo Lead", color: "bg-blue-500" },
  { id: "EM_ATENDIMENTO", title: "Em Atendimento", color: "bg-yellow-500" },
  { id: "FECHADO", title: "Fechado", color: "bg-green-500" },
  { id: "PERDIDO", title: "Perdido", color: "bg-red-500" },
];

const Pipeline = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const leadIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [stages, setStages] = useState<any[]>(DEFAULT_STAGES);
  const [usingCustomFunnel, setUsingCustomFunnel] = useState(false);
  const [activeFunnel, setActiveFunnel] = useState<any>(null);
  const [allFunnels, setAllFunnels] = useState<any[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [leadItems, setLeadItems] = useState<LeadItems>({});
  const [pauseRealtime, setPauseRealtime] = useState(false);
  const [leadTagsMap, setLeadTagsMap] = useState<LeadTagsMap>({});
  const [isDraggingActive, setIsDraggingActive] = useState(false);

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

    // Subscrever a novos leads
    const channel = supabase
      .channel('leads-changes')
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
            // Tocar som
            audioRef.current?.play().catch(() => {});
            
            // Mostrar toast
            toast.success(`Novo lead: ${newLead.nome_lead}`, {
              description: newLead.telefone_lead,
              duration: 5000,
            });
            
            // Adicionar ao estado
            setLeads(prev => [newLead, ...prev]);
            leadIdsRef.current.add(newLead.id);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [pauseRealtime, usingCustomFunnel, activeFunnel]);

  // Carregamento de dados - executa na montagem inicial e quando o funil muda
  useEffect(() => {
    if (!user?.id) return;
    
    const loadPipelineData = async () => {
      const funnelData = await loadFunnel();
      await loadLeads(funnelData);
      // Desabilitar animações após primeira carga
      if (isInitialLoad) {
        setTimeout(() => setIsInitialLoad(false), 1000);
      }
    };
    
    loadPipelineData();
  }, [selectedFunnelId, user?.id]);

  const loadFunnel = async () => {
    if (!user?.id) return { isCustom: false, funnel: null };
    
    try {
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!orgData) {
        setStages(DEFAULT_STAGES);
        setUsingCustomFunnel(false);
        return { isCustom: false, funnel: null };
      }

      // Buscar TODOS os funis ativos
      const { data: funnels, error } = await supabase
        .from("sales_funnels")
        .select(`
          *,
          stages:funnel_stages(*)
        `)
        .eq("organization_id", orgData.organization_id)
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

  const loadLeads = async (funnelData?: { isCustom: boolean; funnel: any }) => {
    if (!user?.id) return;
    
    try {
      setLoading(true);
      
      // Usar dados do funil passados ou estados atuais
      const isCustom = funnelData?.isCustom ?? usingCustomFunnel;
      const funnel = funnelData?.funnel ?? activeFunnel;
      
      // Otimizado: buscar apenas campos necessários (incluindo source para badges)
      let query = supabase
        .from("leads")
        .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, valor, updated_at, created_at, source, descricao_negocio");

      // Filtrar apenas leads da organização do usuário
      const { data: orgMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (orgMember) {
        query = query.eq("organization_id", orgMember.organization_id);
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
      setLoading(false);
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

  // Memoizar leads por stage para evitar recálculo constante
  const leadsByStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    
    stages.forEach((stage) => {
      let filtered;
      
      if (usingCustomFunnel) {
        filtered = leadsWithFormattedDates.filter((lead) => lead.funnel_stage_id === stage.id);
      } else {
        filtered = leadsWithFormattedDates.filter((lead) => (lead.stage || "NOVO") === stage.id);
      }
      
      filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
      map.set(stage.id, filtered);
    });
    
    return map;
  }, [leadsWithFormattedDates, stages, usingCustomFunnel]);

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

    // Determinar o stage de destino
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);
    
    const targetStage = isDroppedOverStage ? overId : (overLead?.stage || activeLead.stage || "NOVO");
    const activeStage = activeLead.stage || "NOVO";

    // Se for dropado no mesmo lugar, não fazer nada
    if (targetStage === activeStage && (isDroppedOverStage || leadId === overId)) {
      return;
    }

    try {
      if (isDroppedOverStage) {
        // Dropado diretamente em uma coluna
        const targetStageLeads = leadsByStage.get(targetStage) || [];
        const newPosition = targetStageLeads.length;

        // Atualizar estado local
        setLeads((prev) =>
          prev.map((l) => 
            l.id === leadId 
              ? { ...l, stage: targetStage, position: newPosition } 
              : l
          )
        );

        // Atualizar no banco
        const { error } = await supabase
          .from("leads")
          .update({ stage: targetStage, position: newPosition })
          .eq("id", leadId);

        if (error) throw error;
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

          // Reordenar array
          const reorderedLeads = arrayMove(stageLeads, oldIndex, newIndex);
          const reorderedWithPositions = reorderedLeads.map((originalLead, index) => {
            const lead: Lead = originalLead as Lead;
            return {
              id: lead.id,
              telefone_lead: lead.telefone_lead,
              nome_lead: lead.nome_lead,
              created_at: lead.created_at,
              updated_at: lead.updated_at,
              last_message_at: lead.last_message_at,
              source: lead.source,
              stage: lead.stage,
              email: lead.email,
              empresa: lead.empresa,
              valor: lead.valor,
              avatar_url: lead.avatar_url,
              responsavel: lead.responsavel,
              descricao_negocio: lead.descricao_negocio,
              is_online: lead.is_online,
              last_seen: lead.last_seen,
              funnel_id: lead.funnel_id,
              funnel_stage_id: lead.funnel_stage_id,
              position: index,
            };
          });

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

          toast.success("Lead reordenado!");

        } else {
          // Movendo para outra coluna e posicionando sobre outro lead
          const activeStageLeads = leadsByStage.get(activeStage) || [];
          const targetStageLeads = leadsByStage.get(targetStage) || [];
          
          const newIndex = targetStageLeads.findIndex((l) => l.id === overId);
          
          if (newIndex === -1) return;

          // Remover da coluna antiga e recalcular posições
          const updatedActiveStage = activeStageLeads
            .filter((l) => l.id !== leadId)
            .map((lead, index) => ({ ...lead, position: index }));

          // Adicionar na nova coluna na posição correta
          const updatedTargetStage = [...targetStageLeads];
          updatedTargetStage.splice(newIndex, 0, { ...activeLead, stage: targetStage });
          const updatedTargetWithPositions = updatedTargetStage.map((lead, index) => ({
            ...lead,
            position: index,
            stage: targetStage,
          }));

          // Combinar todos os leads
          setLeads((prev) => {
            const otherStageLeads = prev.filter(
              (l) => (l.stage || "NOVO") !== activeStage && (l.stage || "NOVO") !== targetStage
            );
            return [...otherStageLeads, ...updatedActiveStage, ...updatedTargetWithPositions];
          });

          // Atualizar no banco
          const updates = [
            ...updatedActiveStage.map((lead) =>
              supabase.from("leads").update({ position: lead.position }).eq("id", lead.id)
            ),
            ...updatedTargetWithPositions.map((lead) =>
              supabase
                .from("leads")
                .update({ position: lead.position, stage: lead.stage })
                .eq("id", lead.id)
            ),
          ];

          await Promise.all(updates);
          toast.success("Lead movido!");
        }
      }
      } catch (error) {
        console.error("Erro ao atualizar lead:", error);
        toast.error("Erro ao mover lead");
        // Recarregar em caso de erro
        loadLeads();
      }
    }, [leads, stages, user?.id, usingCustomFunnel, activeFunnel]);

  const handleEditLead = useCallback((lead: Lead) => {
    setEditingLead(lead);
  }, []);

  const activeLead = useMemo(() => 
    leads.find((lead) => lead.id === activeId),
    [leads, activeId]
  );

  if (loading) {
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
          <Button
            variant="outline"
            onClick={() => navigate("/funnel-builder")}
          >
            <Settings2 className="h-4 w-4 mr-2" />
            Gerenciar Funis
          </Button>
        </div>

        {allFunnels.length > 0 ? (
          <Tabs
            value={selectedFunnelId || allFunnels[0]?.id || "default"}
            onValueChange={setSelectedFunnelId}
            className="w-full"
          >
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              {allFunnels.map((funnel) => (
                <TabsTrigger
                  key={funnel.id}
                  value={funnel.id}
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3 transition-all duration-200 hover:bg-muted/50"
                >
                  {funnel.name}
                  {funnel.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(Padrão)</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent 
              value={selectedFunnelId || allFunnels[0]?.id || "default"}
              className="mt-6"
            >
              <div className="flex gap-3 overflow-x-auto pb-4">
                {loading ? (
                  // Skeleton loading para transições suaves
                  Array.from({ length: stages.length }).map((_, idx) => (
                    <div key={idx} className="min-w-[280px] h-[500px]">
                      <Skeleton className="w-full h-full rounded-lg" />
                    </div>
                  ))
                ) : (
                  stages.map((stage) => {
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
                        onLeadUpdate={loadLeads}
                        onEdit={setEditingLead}
                        leadItems={leadItems}
                        leadTagsMap={leadTagsMap}
                        isDraggingActive={isDraggingActive}
                      />
                    );
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
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
                    onLeadUpdate={loadLeads}
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
        onUpdate={loadLeads}
      />
    )}
    </>
  );
};

export default Pipeline;
