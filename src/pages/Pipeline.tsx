import { PipelineColumn } from "@/components/PipelineColumn";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Lead } from "@/types/chat";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, closestCorners } from "@dnd-kit/core";
import { DragOverlayLeadCard } from "@/components/DragOverlayLeadCard";
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
    const newStage = over.id as string;

    // Encontrar o lead que está sendo movido
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === newStage) return;

    // Atualizar localmente primeiro para feedback imediato
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l))
    );

    // Atualizar no Supabase
    try {
      const { error } = await supabase
        .from("leads")
        .update({ stage: newStage })
        .eq("id", leadId);

      if (error) throw error;
      toast.success("Lead movido com sucesso!");
    } catch (error) {
      console.error("Erro ao atualizar lead:", error);
      toast.error("Erro ao mover lead");
      // Reverter mudança local em caso de erro
      loadLeads();
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
          <DragOverlayLeadCard name={activeLead.nome_lead} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

export default Pipeline;
