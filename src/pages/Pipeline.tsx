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
import { FunnelTabs } from "@/components/FunnelTabs";
import { FunnelBuilderModal } from "@/components/FunnelBuilderModal";
import { usePermissions } from "@/hooks/usePermissions";

interface FunnelStage {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  is_final: boolean;
}

interface Funnel {
  id: string;
  name: string;
  is_default: boolean;
  is_active: boolean;
}

const Pipeline = () => {
  const { canManageAutomation } = usePermissions();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const leadIdsRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Estados de funis
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [activeFunnelId, setActiveFunnelId] = useState<string | null>(null);
  const [funnelStages, setFunnelStages] = useState<FunnelStage[]>([]);
  const [showFunnelBuilder, setShowFunnelBuilder] = useState(false);
  const [editingFunnelId, setEditingFunnelId] = useState<string | null>(null);

  useEffect(() => {
    loadFunnels();
    
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

  useEffect(() => {
    if (activeFunnelId) {
      loadFunnelStages(activeFunnelId);
      loadLeads();
    }
  }, [activeFunnelId]);

  const loadFunnels = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: memberData } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", user.id)
        .single();

      if (!memberData?.organization_id) return;

      const { data, error } = await supabase
        .from("sales_funnels")
        .select("*")
        .eq("organization_id", memberData.organization_id)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at");

      if (error) throw error;

      setFunnels(data || []);
      
      // Selecionar funil padrão ou primeiro
      const defaultFunnel = data?.find(f => f.is_default) || data?.[0];
      if (defaultFunnel) {
        setActiveFunnelId(defaultFunnel.id);
      }
    } catch (error) {
      console.error("Erro ao carregar funis:", error);
      toast.error("Erro ao carregar funis");
    }
  };

  const loadFunnelStages = async (funnelId: string) => {
    try {
      const { data, error } = await supabase
        .from("funnel_stages")
        .select("*")
        .eq("funnel_id", funnelId)
        .order("position");

      if (error) throw error;

      setFunnelStages(data?.map(stage => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        icon: stage.icon,
        position: stage.position,
        is_final: stage.is_final
      })) || []);
    } catch (error) {
      console.error("Erro ao carregar etapas:", error);
      toast.error("Erro ao carregar etapas do funil");
    }
  };

  const loadLeads = async () => {
    if (!activeFunnelId) return;
    
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("funnel_id", activeFunnelId)
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

  const handleCreateFunnel = () => {
    if (!canManageAutomation) {
      toast.error("Apenas administradores podem criar funis");
      return;
    }
    setEditingFunnelId(null);
    setShowFunnelBuilder(true);
  };

  const handleEditFunnel = (funnelId: string) => {
    if (!canManageAutomation) {
      toast.error("Apenas administradores podem editar funis");
      return;
    }
    setEditingFunnelId(funnelId);
    setShowFunnelBuilder(true);
  };

  const handleFunnelSuccess = () => {
    loadFunnels();
    setShowFunnelBuilder(false);
    setEditingFunnelId(null);
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
    const isDroppedOverStage = funnelStages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);
    
    const targetStageId = isDroppedOverStage ? overId : (overLead?.funnel_stage_id || activeLead.funnel_stage_id);
    const activeStageId = activeLead.funnel_stage_id;

    console.log("Informações do drop:", { 
      isDroppedOverStage, 
      targetStageId, 
      activeStageId,
      overLeadExists: !!overLead 
    });

    // Se for dropado no mesmo lugar, não fazer nada
    if (targetStageId === activeStageId && (isDroppedOverStage || leadId === overId)) {
      console.log("Mesma posição, nenhuma ação necessária");
      return;
    }

    try {
      if (isDroppedOverStage) {
        // Dropado diretamente em uma coluna
        const targetStageLeads = getLeadsByStage(targetStageId);
        const newPosition = targetStageLeads.length;

        console.log("Movendo para coluna:", { targetStageId, newPosition, totalLeadsInTarget: targetStageLeads.length });

        // Atualizar estado local
        setLeads((prev) =>
          prev.map((l) => 
            l.id === leadId 
              ? { ...l, funnel_stage_id: targetStageId, position: newPosition } 
              : l
          )
        );

        // Atualizar no banco
        const { error } = await supabase
          .from("leads")
          .update({ funnel_stage_id: targetStageId, position: newPosition })
          .eq("id", leadId);

        if (error) throw error;
        toast.success("Lead movido!");

      } else if (overLead) {
        // Dropado sobre outro lead
        if (targetStageId === activeStageId) {
          // Reordenando dentro da mesma coluna
          const stageLeads = getLeadsByStage(activeStageId);
          const oldIndex = stageLeads.findIndex((l) => l.id === leadId);
          const newIndex = stageLeads.findIndex((l) => l.id === overId);

          console.log("Reordenando na mesma coluna:", { 
            stage: activeStageId,
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
          const activeStageLeads = getLeadsByStage(activeStageId);
          const targetStageLeads = getLeadsByStage(targetStageId);
          
          const newIndex = targetStageLeads.findIndex((l) => l.id === overId);
          
          console.log("Movendo para coluna diferente:", { 
            from: activeStageId,
            to: targetStageId, 
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
          updatedTargetStage.splice(newIndex, 0, { ...activeLead, funnel_stage_id: targetStageId });
          const updatedTargetWithPositions = updatedTargetStage.map((lead, index) => ({
            ...lead,
            position: index,
            funnel_stage_id: targetStageId,
          }));

          // Combinar todos os leads
          setLeads((prev) => {
            const otherStageLeads = prev.filter(
              (l) => l.funnel_stage_id !== activeStageId && l.funnel_stage_id !== targetStageId
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
                .update({ position: lead.position, funnel_stage_id: lead.funnel_stage_id })
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
    const filtered = leads.filter((lead) => lead.funnel_stage_id === stageId);
    
    // Ordenar por position
    filtered.sort((a, b) => (a.position || 0) - (b.position || 0));
    
    console.log(`Leads no stage ${stageId}:`, filtered.length);
    return filtered;
  };

  const activeLead = leads.find((lead) => lead.id === activeId);

  if (loading || !activeFunnelId || funnelStages.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-4">
              <Skeleton className="h-12 w-full" />
              {[...Array(3)].map((_, j) => (
                <Skeleton key={j} className="h-32 w-full" />
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
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pipeline de Vendas</h1>
          <p className="text-muted-foreground mt-1">
            Arraste e solte os cards para mover leads entre as etapas do funil
          </p>
        </div>

        {funnels.length > 0 && (
          <FunnelTabs
            funnels={funnels}
            activeFunnelId={activeFunnelId}
            onFunnelChange={setActiveFunnelId}
            onCreateFunnel={handleCreateFunnel}
            onEditFunnel={handleEditFunnel}
          />
        )}

        <div className="flex gap-3 overflow-x-auto pb-4">
          {funnelStages.map((stage) => {
            const stageLeads = getLeadsByStage(stage.id);
            return (
              <PipelineColumn
                key={stage.id}
                id={stage.id}
                title={stage.name}
                count={stageLeads.length}
                color={`bg-[${stage.color}]`}
                leads={stageLeads}
                isEmpty={stageLeads.length === 0}
                onLeadUpdate={loadLeads}
                onEdit={setEditingLead}
              />
            );
          })}
        </div>
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

    {/* Modal de Edição */}
    {editingLead && (
      <EditLeadModal
        lead={editingLead}
        open={!!editingLead}
        onClose={() => setEditingLead(null)}
        onUpdate={loadLeads}
      />
    )}

    {/* Modal do Construtor de Funil */}
    <FunnelBuilderModal
      open={showFunnelBuilder}
      onClose={() => {
        setShowFunnelBuilder(false);
        setEditingFunnelId(null);
      }}
      onSuccess={handleFunnelSuccess}
      funnelId={editingFunnelId}
    />
    </>
  );
};

export default Pipeline;
