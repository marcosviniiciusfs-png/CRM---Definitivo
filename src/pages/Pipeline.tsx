import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners, DragOverEvent } from "@dnd-kit/core";
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

    // Check if dropped over a stage (column) or another lead
    const isDroppedOverStage = stages.some((s) => s.id === overId);
    const overLead = leads.find((l) => l.id === overId);

    if (isDroppedOverStage) {
      // Moving to different stage
      const newStage = overId;
      if (activeLead.stage === newStage) return;

      const stageLeads = getLeadsByStage(newStage);
      const newPosition = stageLeads.length;

      setLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, stage: newStage, position: newPosition } : l))
      );

      try {
        const { error } = await supabase
          .from("leads")
          .update({ stage: newStage, position: newPosition })
          .eq("id", leadId);

        if (error) throw error;
        toast.success("Lead movido com sucesso!");
      } catch (error) {
        console.error("Erro ao atualizar lead:", error);
        toast.error("Erro ao mover lead");
        loadLeads();
      }
    } else if (overLead) {
      // Reordering within same or different stage
      const activeStage = activeLead.stage || "NOVO";
      const overStage = overLead.stage || "NOVO";

      const stageLeads = getLeadsByStage(overStage);
      const oldIndex = stageLeads.findIndex((l) => l.id === leadId);
      const newIndex = stageLeads.findIndex((l) => l.id === overId);

      if (activeStage === overStage && oldIndex === newIndex) return;

      let newLeadsOrder: Lead[];

      if (activeStage === overStage) {
        // Reordering within same stage
        newLeadsOrder = arrayMove(stageLeads, oldIndex, newIndex);
      } else {
        // Moving to different stage
        const activeStageLeads = getLeadsByStage(activeStage).filter((l) => l.id !== leadId);
        const overStageLeads = getLeadsByStage(overStage);
        const insertIndex = overStageLeads.findIndex((l) => l.id === overId);
        
        overStageLeads.splice(insertIndex, 0, { ...activeLead, stage: overStage });
        newLeadsOrder = overStageLeads;
      }

      // Update positions
      const updatedLeads = newLeadsOrder.map((lead, index) => ({
        ...lead,
        position: index,
        stage: overStage,
      }));

      setLeads((prev) => {
        const otherStageLeads = prev.filter((l) => (l.stage || "NOVO") !== overStage);
        return [...otherStageLeads, ...updatedLeads];
      });

      try {
        const updates = updatedLeads.map((lead) => 
          supabase
            .from("leads")
            .update({ position: lead.position, stage: lead.stage })
            .eq("id", lead.id)
        );

        await Promise.all(updates);
        toast.success("Lead reordenado com sucesso!");
      } catch (error) {
        console.error("Erro ao atualizar ordem:", error);
        toast.error("Erro ao reordenar lead");
        loadLeads();
      }
    }
  };

  const getLeadsByStage = (stageId: string) => {
    return leads.filter((lead) => (lead.stage || "NOVO") === stageId);
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
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default Pipeline;
