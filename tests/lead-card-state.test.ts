import assert from "node:assert/strict";
import test from "node:test";

import { brtDayKey, formatWaitingTime, getLeadAttention } from "../src/lib/leadCardState.ts";

// 14/11/2026 22:30 em Brasília = 15/11/2026 01:30 UTC
const NOW = new Date("2026-11-15T01:30:00.000Z");

test("brtDayKey usa o dia de Brasília", () => {
  assert.equal(brtDayKey(NOW), "2026-11-14");
  assert.equal(brtDayKey("2026-11-15T02:59:00.000Z"), "2026-11-14");
  assert.equal(brtDayKey("2026-11-15T03:00:00.000Z"), "2026-11-15");
});

test("precisa responder vence qualquer tarefa", () => {
  const result = getLeadAttention({
    waitingSince: "2026-11-14T22:30:00.000Z",
    openTasks: [{ due_date: "2026-11-10T12:00:00.000Z" }],
    now: NOW,
  });
  assert.deepEqual(result, { kind: "needs_reply", label: "Responder · 3 h" });
});

test("tarefa atrasada vence tarefa de hoje", () => {
  const result = getLeadAttention({
    waitingSince: null,
    openTasks: [{ due_date: "2026-11-14T20:00:00.000Z" }, { due_date: "2026-11-13T12:00:00.000Z" }],
    now: NOW,
  });
  assert.equal(result.kind, "overdue");
});

test("tarefa que vence hoje, mesmo já passada a hora, é 'hoje'", () => {
  const result = getLeadAttention({
    waitingSince: null,
    openTasks: [{ due_date: "2026-11-14T13:00:00.000Z" }],
    now: NOW,
  });
  assert.deepEqual(result, { kind: "today", label: "Tarefa hoje" });
});

test("sem tarefa aberta é 'sem tarefa'; tarefa futura ou sem prazo é normal", () => {
  assert.equal(getLeadAttention({ waitingSince: null, openTasks: [], now: NOW }).kind, "no_task");
  assert.equal(getLeadAttention({ waitingSince: null, openTasks: undefined, now: NOW }).kind, "no_task");
  assert.equal(
    getLeadAttention({ waitingSince: null, openTasks: [{ due_date: "2026-11-20T12:00:00.000Z" }], now: NOW }).kind,
    "normal",
  );
  assert.equal(getLeadAttention({ waitingSince: null, openTasks: [{ due_date: null }], now: NOW }).kind, "normal");
});

test("etapa final não cobra tarefa, mas ainda mostra resposta pendente", () => {
  assert.equal(getLeadAttention({ waitingSince: null, openTasks: [], isFinalStage: true, now: NOW }).kind, "normal");
  assert.equal(
    getLeadAttention({ waitingSince: "2026-11-15T01:20:00.000Z", openTasks: [], isFinalStage: true, now: NOW }).kind,
    "needs_reply",
  );
});

test("formatWaitingTime arredonda para baixo", () => {
  assert.equal(formatWaitingTime("2026-11-15T01:29:30.000Z", NOW), "agora");
  assert.equal(formatWaitingTime("2026-11-15T01:15:00.000Z", NOW), "15 min");
  assert.equal(formatWaitingTime("2026-11-13T01:30:00.000Z", NOW), "2 d");
});

test("dueDayKey trata data pura e meia-noite UTC como o próprio dia", async () => {
  const { dueDayKey } = await import("../src/lib/leadCardState.ts");
  assert.equal(dueDayKey("2026-11-14"), "2026-11-14");
  assert.equal(dueDayKey("2026-11-14 00:00:00+00"), "2026-11-14");
  assert.equal(dueDayKey("2026-11-14T00:00:00.000Z"), "2026-11-14");
  assert.equal(dueDayKey("2026-11-15T01:30:00.000Z"), "2026-11-14");
  assert.equal(dueDayKey("lixo"), null);
});
