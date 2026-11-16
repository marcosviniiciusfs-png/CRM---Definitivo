import assert from "node:assert/strict";
import test from "node:test";

import {
  businessDays,
  campaignStatus,
  goalPace,
  levelFromPoints,
  levelProgress,
  levelTier,
  pointsForLevel,
} from "../src/lib/gamification.ts";

test("níveis por pontos acumulados", () => {
  assert.equal(levelFromPoints(0), 1);
  assert.equal(levelFromPoints(49), 1);
  assert.equal(levelFromPoints(50), 2);
  assert.equal(levelFromPoints(800), 5);
  assert.equal(levelFromPoints(10_000_000), 50);
  assert.equal(pointsForLevel(10), 4050);
  const progress = levelProgress(125);
  assert.equal(progress.level, 2);
  assert.equal(progress.next, 200);
  assert.equal(progress.ratio, 0.5);
  assert.equal(levelTier(1), "Bronze");
  assert.equal(levelTier(6), "Prata");
  assert.equal(levelTier(15), "Ouro");
  assert.equal(levelTier(30), "Diamante");
});

test("dias úteis do mês", () => {
  // Novembro/2026: 21 dias úteis; até 16/11 (segunda) passaram 11.
  assert.deepEqual(businessDays("2026-11-16"), { total: 21, elapsed: 11 });
  assert.deepEqual(businessDays("2026-11-01"), { total: 21, elapsed: 0 });
});

test("ritmo da meta", () => {
  const onPace = goalPace(600_000, 1_000_000, "2026-11-16");
  assert.equal(onPace.status, "no_ritmo");
  assert.equal(onPace.daysLeft, 10);
  assert.equal(onPace.perDay, 40_000);
  assert.equal(goalPace(300_000, 1_000_000, "2026-11-16").status, "abaixo");
  assert.equal(goalPace(1_000_000, 1_000_000, "2026-11-16").status, "batida");
});

test("situação da campanha", () => {
  const base = { starts_on: "2026-11-10", ends_on: "2026-11-20", closed_at: null };
  assert.equal(campaignStatus(base, "2026-11-09"), "agendada");
  assert.equal(campaignStatus(base, "2026-11-16"), "em_andamento");
  assert.equal(campaignStatus(base, "2026-11-21"), "encerrada");
  assert.equal(campaignStatus({ ...base, closed_at: "x" }, "2026-11-16"), "encerrada");
});
