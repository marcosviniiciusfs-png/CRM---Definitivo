import assert from "node:assert/strict";
import test from "node:test";

import { biggestDrop, buildInsights, buildSteps, presetRange, stalledTotal, winRate, worstStalledStage, type FunnelIntel, type FunnelStageStat } from "../src/lib/funnelIntel.ts";

const stage = (o: Partial<FunnelStageStat> & { name: string; position: number }): FunnelStageStat => ({
  id: o.name, stage_type: "custom", is_final: false, linked_event: null, color: null,
  reached: 0, avg_seconds_in_stage: null, current: 0, stalled: 0, lost_here: 0, ...o,
});

const intel: FunnelIntel = {
  totals: { leads: 100, won: 5, lost: 20, won_value: 500000, avg_days_to_win: 12.5 },
  stages: [
    stage({ name: "Novo", position: 0, reached: 100, current: 10, stalled: 2, lost_here: 8 }),
    stage({ name: "Qualificado", position: 1, reached: 70, current: 40, stalled: 30, lost_here: 12 }),
    stage({ name: "Reunião", position: 2, reached: 30, current: 15, stalled: 3 }),
    stage({ name: "Ganho", position: 3, reached: 5, stage_type: "won", is_final: true, current: 5 }),
    stage({ name: "Perdido", position: 99, reached: 20, stage_type: "lost", is_final: true, current: 20 }),
  ],
};

test("etapas do caminho de venda e taxas entre elas", () => {
  const steps = buildSteps(intel);
  assert.deepEqual(steps.map((s) => s.stage.name), ["Novo", "Qualificado", "Reunião", "Ganho"]);
  assert.equal(steps[0].conversionFromPrevious, null);
  assert.equal(steps[1].conversionFromPrevious, 0.7);
  assert.equal(steps[2].shareOfLeads, 0.3);
  assert.equal(winRate(intel), 0.05);
});

test("maior queda ignora etapas com poucos leads", () => {
  const drop = biggestDrop(buildSteps(intel));
  assert.equal(drop?.from.name, "Reunião");
  assert.equal(drop?.to.name, "Ganho");
  assert.equal(drop?.lost, 25);
  const tiny: FunnelIntel = { ...intel, stages: [stage({ name: "A", position: 0, reached: 3 }), stage({ name: "B", position: 1, reached: 0 })] };
  assert.equal(biggestDrop(buildSteps(tiny)), null);
});

test("leads parados e frases", () => {
  assert.equal(stalledTotal(intel), 35);
  assert.equal(worstStalledStage(intel)?.name, "Qualificado");
  const insights = buildInsights(intel);
  assert.equal(insights.length, 4);
  assert.match(insights[0], /Reunião.*Ganho.*83%/);
  assert.match(insights[1], /35 de 65/);
  assert.match(insights[3], /12,5 dias/);
  assert.deepEqual(buildInsights({ totals: { leads: 0, won: 0, lost: 0, won_value: 0, avg_days_to_win: null }, stages: [] }), []);
});

test("períodos prontos em Brasília", () => {
  const now = new Date("2026-11-17T15:00:00Z");
  assert.deepEqual(presetRange("7d", now), { from: "2026-11-11", to: "2026-11-17" });
  assert.deepEqual(presetRange("30d", now), { from: "2026-10-19", to: "2026-11-17" });
  assert.deepEqual(presetRange("this_month", now), { from: "2026-11-01", to: "2026-11-17" });
  assert.deepEqual(presetRange("last_month", now), { from: "2026-10-01", to: "2026-10-31" });
});
