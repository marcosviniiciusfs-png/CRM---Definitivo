import assert from "node:assert/strict";
import test from "node:test";

import { attendanceRates, formatPercent, goalProgress, rate, sumAttendance } from "../src/lib/panelRates.ts";

const day = (overrides: Record<string, number>) => ({
  day: "2026-11-01",
  new_leads: 0, scheduled: 0, scheduled_from_ads: 0, confirmed: 0, attended: 0, no_show: 0, won: 0, lost: 0,
  ...overrides,
});

test("taxas do atendimento", () => {
  const totals = sumAttendance([
    day({ new_leads: 40, scheduled: 8, scheduled_from_ads: 6, confirmed: 4 }),
    day({ new_leads: 60, scheduled: 12, scheduled_from_ads: 3, attended: 9, no_show: 3, won: 3 }),
  ]);
  const rates = attendanceRates(totals);
  assert.equal(rates.scheduling, 0.2);
  assert.equal(rates.confirmation, 0.2);
  assert.equal(rates.attendance, 0.75);
  assert.equal(Number(rates.closing?.toFixed(4)), 0.3333);
  assert.equal(rates.leadToWon, 0.03);
  assert.equal(rates.fromAds, 0.45);
});

test("taxa sem base ou acima de 100% vira '-'", () => {
  assert.equal(rate(5, 0), null);
  assert.equal(rate(6, 5), null);
  assert.equal(formatPercent(null), "-");
  assert.equal(formatPercent(0.125, 1), "12,5%");
});

test("meta mensal: esperado, ritmo e quanto falta por dia", () => {
  const progress = goalProgress(300, 120, 10, 30);
  assert.deepEqual(progress, { goal: 300, done: 120, expected: 100, pace: 360, perDayNeeded: 9, state: "on_pace" });
  assert.equal(goalProgress(300, 60, 10, 30).state, "behind");
  assert.equal(goalProgress(300, 5, 2, 30).state, "early");
  assert.equal(goalProgress(300, 310, 20, 30).state, "reached");
  assert.equal(goalProgress(300, 310, 20, 30).perDayNeeded, 0);
});
