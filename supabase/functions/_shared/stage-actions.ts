// Regras puras das ações de etapa (sem Deno nem Supabase), usadas por process-stage-actions
// e testadas em tests/stage-actions.test.ts.

export type StageAction = "send_message" | "create_task" | "assign_agent" | "meta_purchase";

export interface StageActionRun {
  id: string;
  lead_id: string;
  stage_id: string;
  action: StageAction;
  stage_config: Record<string, unknown> | null;
  moved_by: string | null;
}

export interface StageActionLead {
  id: string;
  nome_lead: string | null;
  telefone_lead: string | null;
  funnel_stage_id: string | null;
  organization_id: string | null;
  responsavel_user_id: string | null;
  whatsapp_instance_id: string | null;
  valor: number | null;
}

export type SkipReason =
  | "lead_missing"
  | "lead_without_organization"
  | "moved_out"
  | "missing_config"
  | "missing_phone";

/** Motivo para não executar a ação, ou null se ela pode rodar. */
export function skipReason(run: StageActionRun, lead: StageActionLead | null): SkipReason | null {
  if (!lead) return "lead_missing";
  if (!lead.organization_id) return "lead_without_organization";
  // O lead saiu da etapa antes da ação rodar (arrastou errado e voltou, por exemplo).
  if (lead.funnel_stage_id !== run.stage_id) return "moved_out";

  const config = run.stage_config ?? {};
  switch (run.action) {
    case "send_message":
      if (!text(config.message_template)) return "missing_config";
      if (!text(lead.telefone_lead)) return "missing_phone";
      return null;
    case "create_task":
      return text(config.task_title) ? null : "missing_config";
    case "assign_agent":
      return text(config.agent_email) ? null : "missing_config";
    case "meta_purchase":
      return null;
  }
}

export const SKIP_REASON_TEXT: Record<SkipReason, string> = {
  lead_missing: "O lead não existe mais.",
  lead_without_organization: "O lead não pertence a nenhuma organização.",
  moved_out: "O lead saiu da etapa antes da ação rodar.",
  missing_config: "A etapa não tem a configuração da ação.",
  missing_phone: "O lead não tem telefone.",
};

/** Substitui {{nome}} pelo nome do lead. */
export function renderMessageTemplate(template: string, lead: Pick<StageActionLead, "nome_lead">): string {
  const name = text(lead.nome_lead) || "";
  return template.replace(/\{\{\s*nome\s*\}\}/gi, name).trim();
}

/** Quem aparece como criador da tarefa: quem moveu, senão o responsável, senão o dono da organização. */
export function pickTaskCreator(
  movedBy: string | null,
  responsibleUserId: string | null,
  ownerUserId: string | null,
): string | null {
  return movedBy || responsibleUserId || ownerUserId || null;
}

export function normalizeEmail(value: unknown): string {
  return text(value).toLowerCase();
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
