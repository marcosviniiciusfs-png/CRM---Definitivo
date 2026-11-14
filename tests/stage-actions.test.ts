import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeEmail,
  pickTaskCreator,
  renderMessageTemplate,
  skipReason,
  type StageActionLead,
  type StageActionRun,
} from "../supabase/functions/_shared/stage-actions.ts";

const lead: StageActionLead = {
  id: "lead-1",
  nome_lead: "Maria Silva",
  telefone_lead: "5511999998888",
  funnel_stage_id: "stage-msg",
  organization_id: "org-1",
  responsavel_user_id: "user-resp",
  whatsapp_instance_id: null,
  valor: 1500,
};

const run = (overrides: Partial<StageActionRun> = {}): StageActionRun => ({
  id: "run-1",
  lead_id: "lead-1",
  stage_id: "stage-msg",
  action: "send_message",
  stage_config: { message_template: "Olá {{nome}}!" },
  moved_by: null,
  ...overrides,
});

test("roda quando o lead continua na etapa e a configuração existe", () => {
  assert.equal(skipReason(run(), lead), null);
  assert.equal(skipReason(run({ action: "meta_purchase", stage_config: {} }), lead), null);
  assert.equal(skipReason(run({ action: "create_task", stage_config: { task_title: "Ligar" } }), lead), null);
  assert.equal(
    skipReason(run({ action: "assign_agent", stage_config: { agent_email: "ana@empresa.com" } }), lead),
    null,
  );
});

test("pula quando o lead sumiu, não tem organização ou saiu da etapa", () => {
  assert.equal(skipReason(run(), null), "lead_missing");
  assert.equal(skipReason(run(), { ...lead, organization_id: null }), "lead_without_organization");
  assert.equal(skipReason(run(), { ...lead, funnel_stage_id: "outra" }), "moved_out");
});

test("pula quando falta configuração ou telefone", () => {
  assert.equal(skipReason(run({ stage_config: { message_template: "  " } }), lead), "missing_config");
  assert.equal(skipReason(run(), { ...lead, telefone_lead: "" }), "missing_phone");
  assert.equal(skipReason(run({ action: "create_task", stage_config: {} }), lead), "missing_config");
  assert.equal(skipReason(run({ action: "assign_agent", stage_config: null }), lead), "missing_config");
});

test("renderMessageTemplate troca {{nome}} pelo nome do lead", () => {
  assert.equal(renderMessageTemplate("Olá {{nome}}, tudo bem?", lead), "Olá Maria Silva, tudo bem?");
  assert.equal(renderMessageTemplate("Oi {{ NOME }}", lead), "Oi Maria Silva");
  assert.equal(renderMessageTemplate("Oi {{nome}}", { nome_lead: null }), "Oi");
});

test("pickTaskCreator usa quem moveu, depois o responsável, depois o dono", () => {
  assert.equal(pickTaskCreator("mover", "resp", "owner"), "mover");
  assert.equal(pickTaskCreator(null, "resp", "owner"), "resp");
  assert.equal(pickTaskCreator(null, null, "owner"), "owner");
  assert.equal(pickTaskCreator(null, null, null), null);
});

test("normalizeEmail tira espaços e maiúsculas", () => {
  assert.equal(normalizeEmail("  Ana@Empresa.COM "), "ana@empresa.com");
  assert.equal(normalizeEmail(undefined), "");
});
