import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
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

  useEffect(() => {
    loadFunnel();
    
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
          const newLead = payload.new as Lead;
          console.log("Novo lead detectado:", newLead);
          
          // Verificar se é realmente um lead novo (não carregado anteriormente)
          if (!leadIdsRef.current.has(newLead.id)) {
            // Tocar som
            audioRef.current?.play().catch(err => console.log("Erro ao tocar som:", err));
            
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
  }, []);

  // Carregar funil quando selectedFunnelId mudar
  useEffect(() => {
    loadFunnel();
  }, [selectedFunnelId]);

  // Recarregar leads quando o funil ativo mudar
  useEffect(() => {
    if (activeFunnel) {
      loadLeads();
    }
  }, [activeFunnel?.id]);

  const loadFunnel = async () => {
    try {
      const { data: orgData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user?.id)
        .maybeSingle();

      if (!orgData) return;

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
        return;
      }

      // Armazenar todos os funis
      setAllFunnels(funnels);

      // Selecionar o primeiro funil (padrão) se nenhum estiver selecionado
      const funnelToActivate = selectedFunnelId
        ? funnels.find((f) => f.id === selectedFunnelId) || funnels[0]
        : funnels[0];

      if (!funnelToActivate.stages || funnelToActivate.stages.length === 0) {
        setStages(DEFAULT_STAGES);
        setUsingCustomFunnel(false);
        setActiveFunnel(null);
        return;
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
      setSelectedFunnelId(funnelToActivate.id);
    } catch (error) {
      console.error("Erro ao carregar funil:", error);
      setStages(DEFAULT_STAGES);
      setUsingCustomFunnel(false);
    }
  };

  const loadLeads = async () => {
    try {
      let query = supabase
        .from("leads")
        .select("*");

      // Se estiver usando funil customizado, filtrar apenas leads desse funil ou sem funil
      if (usingCustomFunnel && activeFunnel) {
        query = query.or(`funnel_id.eq.${activeFunnel.id},funnel_id.is.null`);
      }

      const { data, error } = await query
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      console.log("Leads carregados:", data?.length);
      setLeads(data || []);
      
      // Armazenar IDs dos leads carregados inicialmente
      if (data) {
        leadIdsRef.current = new Set(data.map(lead => lead.id));
      }
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    console.log("Drag iniciado:", event.active.id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) {
      console.log("Drag cancelado - sem alvo");
      return;
    }

    const leadId = active.id as string;
    const overId = over.id as string;

    console.log("Drag finalizado:", { leadId, overId });

    const activeLead = leads.find((l) => l.id === leadId);
    if (!activeLead) {
      console.error("Lead ativo não encontrado:", leadId);
      return;
    }

    // Determinar o stage de destino
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);
    
    const targetStage = isDroppedOverStage ? overId : (overLead?.stage || activeLead.stage || "NOVO");
    const activeStage = activeLead.stage || "NOVO";

    console.log("Informações do drop:", { 
      isDroppedOverStage, 
      targetStage, 
      activeStage,
      overLeadExists: !!overLead 
    });

    // Se for dropado no mesmo lugar, não fazer nada
    if (targetStage === activeStage && (isDroppedOverStage || leadId === overId)) {
      console.log("Mesma posição, nenhuma ação necessária");
      return;
    }

    try {
      if (isDroppedOverStage) {
        // Dropado diretamente em uma coluna
        const targetStageLeads = getLeadsByStage(targetStage);
        const newPosition = targetStageLeads.length;

        console.log("Movendo para coluna:", { targetStage, newPosition, totalLeadsInTarget: targetStageLeads.length });

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
          const stageLeads = getLeadsByStage(activeStage);
          const oldIndex = stageLeads.findIndex((l) => l.id === leadId);
          const newIndex = stageLeads.findIndex((l) => l.id === overId);

          console.log("Reordenando na mesma coluna:", { 
            stage: activeStage,
            oldIndex, 
            newIndex,
            totalLeads: stageLeads.length 
          });

          if (oldIndex === -1 || newIndex === -1) {
            console.error("Índices inválidos:", { oldIndex, newIndex });
            return;
          }

          if (oldIndex === newIndex) {
            console.log("Mesma posição, ignorando");
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
          console.log("Atualizando posições no banco para", reorderedWithPositions.length, "leads");
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
          const activeStageLeads = getLeadsByStage(activeStage);
          const targetStageLeads = getLeadsByStage(targetStage);
          
          const newIndex = targetStageLeads.findIndex((l) => l.id === overId);
          
          console.log("Movendo para coluna diferente:", { 
            from: activeStage,
            to: targetStage, 
            newIndex,
            activeCount: activeStageLeads.length,
            targetCount: targetStageLeads.length
          });

          if (newIndex === -1) {
            console.error("Lead de destino não encontrado na coluna");
            return;
          }

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
          console.log("Atualizando banco:", {
            activeStageUpdates: updatedActiveStage.length,
            targetStageUpdates: updatedTargetWithPositions.length
          });

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
      await loadLeads();
    }
  };

  const getLeadsByStage = (stageId: string) => {
    let filtered;
    
    if (usingCustomFunnel) {
      // No funil customizado, usar funnel_stage_id
      filtered = leads.filter((lead) => lead.funnel_stage_id === stageId);
    } else {
      // No funil padrão, usar stage (texto)
      filtered = leads.filter((lead) => (lead.stage || "NOVO") === stageId);
    }
    
    // Ordenar por position
    filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    console.log(`Leads no stage ${stageId}:`, filtered.length);
    return filtered;
  };

  const activeLead = leads.find((lead) => lead.id === activeId);

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
    >
      <div className="space-y-6">
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
            value={selectedFunnelId || allFunnels[0]?.id}
            onValueChange={(value) => {
              setSelectedFunnelId(value);
            }}
            className="w-full"
          >
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              {allFunnels.map((funnel) => (
                <TabsTrigger
                  key={funnel.id}
                  value={funnel.id}
                  className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-6 py-3"
                >
                  {funnel.name}
                  {funnel.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground">(Padrão)</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            {allFunnels.map((funnel) => (
              <TabsContent key={funnel.id} value={funnel.id} className="mt-6">
                <div className="flex gap-3 overflow-x-auto pb-4">
                  {stages.map((stage) => {
                    const stageLeads = getLeadsByStage(stage.id);
                    return (
                      <PipelineColumn
                        key={stage.id}
                        id={stage.id}
                        title={stage.title}
                        count={stageLeads.length}
                        color={stage.color}
                        leads={stageLeads}
                        isEmpty={stageLeads.length === 0}
                        onLeadUpdate={loadLeads}
                        onEdit={setEditingLead}
                      />
                    );
                  })}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageLeads = getLeadsByStage(stage.id);
              return (
                <PipelineColumn
                  key={stage.id}
                  id={stage.id}
                  title={stage.title}
                  count={stageLeads.length}
                  color={stage.color}
                  leads={stageLeads}
                  isEmpty={stageLeads.length === 0}
                  onLeadUpdate={loadLeads}
                  onEdit={setEditingLead}
                />
              );
            })}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeLead ? (
          <LeadCard
            id={activeLead.id}
            name={activeLead.nome_lead}
            phone={activeLead.telefone_lead}
            date={new Date(activeLead.created_at).toLocaleString("pt-BR")}
            avatarUrl={activeLead.avatar_url}
            stage={activeLead.stage}
            value={activeLead.valor}
            createdAt={activeLead.created_at}
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
