import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { MeetingEvent } from "@/lib/stageEvents";

/** Etapas do funil-modelo de consórcio (Fase 0 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md). */
export const CONSORTIUM_STAGES: Array<{
  name: string;
  description: string;
  color: string;
  linked_event?: MeetingEvent;
}> = [
  { name: "Novo lead", description: "Lead recém-chegado, ainda sem conversa", color: "#3B82F6" },
  { name: "Qualificado", description: "Já sabemos o bem, o crédito e a parcela que cabe", color: "#14B8A6" },
  { name: "Simulação enviada", description: "Simulação enviada ao cliente", color: "#F59E0B" },
  { name: "Reunião agendada", description: "Apresentação marcada com o cliente", color: "#8B5CF6", linked_event: "scheduled" },
  { name: "Reunião feita", description: "Apresentação aconteceu", color: "#6366F1", linked_event: "attended" },
  { name: "Proposta enviada", description: "Proposta enviada, aguardando decisão", color: "#EC4899" },
  { name: "Aguardando pagamento", description: "Adesão feita, aguardando a 1ª parcela", color: "#0EA5E9" },
];

export const CONSORTIUM_WON_STAGE = { name: "Cota vendida", description: "Cota vendida ao cliente", color: "#16A34A" };
export const CONSORTIUM_LOST_STAGE = { name: "Perdido", description: "Cliente desistiu ou não fechou", color: "#A1A1AA" };

export const consortiumTemplatePreview = () =>
  [...CONSORTIUM_STAGES.map((stage) => stage.name), CONSORTIUM_WON_STAGE.name].join(" → ");

interface ExistingStage {
  id: string;
  name: string;
  is_final: boolean;
  stage_type: string;
}

/**
 * Cria as etapas do modelo de consórcio num funil que ainda não tem etapas próprias nem leads.
 * Mantém as etapas de ganho e perda que já existirem (a de ganho passa a se chamar "Cota vendida")
 * e cria as que faltarem.
 */
export async function applyConsortiumTemplate(funnelId: string, currentStages: ExistingStage[]) {
  if (currentStages.some((stage) => !stage.is_final && stage.stage_type === "custom")) {
    throw new Error("Este funil já tem etapas próprias. O modelo só entra em funil vazio.");
  }

  const { count, error: countError } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("funnel_id", funnelId);
  if (countError) throw countError;
  if ((count ?? 0) > 0) {
    throw new Error("Este funil já tem leads. O modelo só entra em funil vazio.");
  }

  const base = {
    funnel_id: funnelId,
    icon: null,
    default_value: null,
    max_days_in_stage: null,
    required_fields: [] as string[],
    stage_config: {},
  };

  const rows: TablesInsert<"funnel_stages">[] = CONSORTIUM_STAGES.map((stage, index) => ({
    ...base,
    name: stage.name,
    description: stage.description,
    color: stage.color,
    position: index,
    stage_type: "custom",
    is_final: false,
    linked_event: stage.linked_event ?? null,
  }));

  const won = currentStages.find((stage) => stage.stage_type === "won");
  const lost = currentStages.find((stage) => stage.stage_type === "lost");

  if (!won) {
    rows.push({ ...base, ...CONSORTIUM_WON_STAGE, position: CONSORTIUM_STAGES.length, stage_type: "won", is_final: true, linked_event: null });
  }
  if (!lost) {
    rows.push({ ...base, ...CONSORTIUM_LOST_STAGE, position: 999, stage_type: "lost", is_final: true, linked_event: null });
  }

  const { error: insertError } = await supabase.from("funnel_stages").insert(rows);
  if (insertError) throw insertError;

  if (won && won.name !== CONSORTIUM_WON_STAGE.name) {
    const { error: renameError } = await supabase
      .from("funnel_stages")
      .update({ name: CONSORTIUM_WON_STAGE.name })
      .eq("id", won.id);
    if (renameError) throw renameError;
  }
}
