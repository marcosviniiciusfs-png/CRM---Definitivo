import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { LeadCard } from "@/components/LeadCard";
import { toast } from "sonner";

const stages = [
  { id: "NOVO", title: "Novo Lead", color: "bg-blue-500" },
  { id: "EM_ATENDIMENTO", title: "Em Atendimento", color: "bg-yellow-500" },
  { id: "FECHADO", title: "Fechado", color: "bg-green-500" },
  { id: "PERDIDO", title: "Perdido", color: "bg-red-500" },
];

const Pipeline = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("stage", { ascending: true })
        .order("position", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error("Erro ao carregar leads:", error);
      toast.error("Erro ao carregar leads");
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    const activeLead = leads.find((l) => l.id === leadId);
    if (!activeLead) return;

    // Determinar o stage de destino
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);
    
    const targetStage = isDroppedOverStage ? overId : (overLead?.stage || activeLead.stage || "NOVO");
    const activeStage = activeLead.stage || "NOVO";

    // Se for dropado na mesma coluna e no mesmo lugar, não fazer nada
    if (targetStage === activeStage && leadId === overId) return;

    try {
      if (isDroppedOverStage) {
        // Dropado em uma coluna vazia ou no fundo da coluna
        if (targetStage === activeStage) {
          return; // Mesma coluna, não fazer nada
        }

        const targetStageLeads = getLeadsByStage(targetStage);
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
        toast.success("Lead movido com sucesso!");

      } else if (overLead) {
        // Dropado sobre outro lead
        if (targetStage === activeStage) {
          // Reordenando dentro da mesma coluna
          const stageLeads = getLeadsByStage(activeStage);
          const oldIndex = stageLeads.findIndex((l) => l.id === leadId);
          const newIndex = stageLeads.findIndex((l) => l.id === overId);

          if (oldIndex === newIndex) return;

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
          await Promise.all(
            reorderedWithPositions.map((lead) =>
              supabase
                .from("leads")
                .update({ position: lead.position })
                .eq("id", lead.id)
            )
          );

          toast.success("Lead reordenado com sucesso!");

        } else {
          // Movendo para outra coluna e posicionando sobre outro lead
          const activeStageLeads = getLeadsByStage(activeStage);
          const targetStageLeads = getLeadsByStage(targetStage);
          
          const newIndex = targetStageLeads.findIndex((l) => l.id === overId);
          
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

          // Atualizar no banco - apenas os afetados
          await Promise.all([
            ...updatedActiveStage.map((lead) =>
              supabase.from("leads").update({ position: lead.position }).eq("id", lead.id)
            ),
            ...updatedTargetWithPositions.map((lead) =>
              supabase
                .from("leads")
                .update({ position: lead.position, stage: lead.stage })
                .eq("id", lead.id)
            ),
          ]);

          toast.success("Lead movido com sucesso!");
        }
      }
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao mover lead");
      await loadLeads(); // Recarregar em caso de erro
    }
  };

  const getLeadsByStage = (stageId: string) => {
    return leads
      .filter((lead) => (lead.stage || "NOVO") === stageId)
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  };

  const activeLead = leads.find((lead) => lead.id === activeId);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando pipeline...</p>
      </div>
    );
  }

  return (
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
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default Pipeline;
