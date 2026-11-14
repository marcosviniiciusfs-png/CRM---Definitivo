import assert from "node:assert/strict";
import test from "node:test";

import {
  findMeetingEventOwner,
  findStagesForEvent,
  getStageEvent,
  missingMeetingEvents,
} from "../src/lib/stageEvents.ts";

const stages = [
  { id: "novo", name: "Novo Lead", stage_type: "custom", linked_event: null },
  { id: "agendado", name: "Agendamento Realizado", stage_type: "custom", linked_event: "scheduled" },
  { id: "msg", name: "Lembrete", stage_type: "send_message", linked_event: "confirmed" },
  { id: "ganho", name: "Venda Realizada", stage_type: "won", linked_event: null },
  { id: "ganho2", name: "Venda Recorrente", stage_type: "won", linked_event: null },
  { id: "perdido", name: "Perdido", stage_type: "lost", linked_event: null },
];

test("getStageEvent lê ganho/perdido do stage_type e reunião do linked_event", () => {
  assert.equal(getStageEvent(stages[0]), null);
  assert.equal(getStageEvent(stages[1]), "scheduled");
  assert.equal(getStageEvent(stages[2]), "confirmed");
  assert.equal(getStageEvent(stages[3]), "won");
  assert.equal(getStageEvent(stages[5]), "lost");
  assert.equal(getStageEvent({ id: "x", linked_event: "inventado" }), null);
});

test("findStagesForEvent devolve todas as etapas de ganho e a única etapa da reunião", () => {
  assert.deepEqual(findStagesForEvent(stages, "won").map((s) => s.id), ["ganho", "ganho2"]);
  assert.deepEqual(findStagesForEvent(stages, "scheduled").map((s) => s.id), ["agendado"]);
  assert.deepEqual(findStagesForEvent(stages, "no_show"), []);
});

test("findMeetingEventOwner ignora a própria etapa em edição", () => {
  assert.equal(findMeetingEventOwner(stages, "scheduled")?.id, "agendado");
  assert.equal(findMeetingEventOwner(stages, "scheduled", "agendado"), null);
  assert.equal(findMeetingEventOwner(stages, "attended"), null);
});

test("missingMeetingEvents lista o que falta marcar no funil", () => {
  assert.deepEqual(missingMeetingEvents(stages), ["attended", "no_show"]);
  assert.deepEqual(missingMeetingEvents([]), ["scheduled", "confirmed", "attended", "no_show"]);
});
