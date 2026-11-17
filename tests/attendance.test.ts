import assert from "node:assert/strict";
import test from "node:test";

import { formatDuration, formatRate, rateTone, responseRate, speedTone, teamTotals, type AttendanceRow } from "../src/lib/attendance.ts";

const row = (o: Partial<AttendanceRow>): AttendanceRow => ({
  user_id: "u", channels: 1, channels_connected: 1, conversations: 0, answered: 0, pending: 0, answered_5min: 0,
  avg_seconds: null, median_seconds: null, first_response_avg_seconds: null, oldest_pending_at: null, ...o,
});

test("duração legível", () => {
  assert.equal(formatDuration(45), "45 s");
  assert.equal(formatDuration(180), "3 min");
  assert.equal(formatDuration(4800), "1 h 20 min");
  assert.equal(formatDuration(7200), "2 h");
  assert.equal(formatDuration(200_000), "2 d 7 h");
  assert.equal(formatDuration(null), "—");
});

test("taxa e faixas", () => {
  assert.equal(responseRate({ answered: 18, conversations: 20 }), 0.9);
  assert.equal(responseRate({ answered: 0, conversations: 0 }), null);
  assert.equal(formatRate(0.876), "88%");
  assert.equal(formatRate(null), "—");
  assert.equal(speedTone(240), "bom");
  assert.equal(speedTone(900), "atencao");
  assert.equal(speedTone(4000), "ruim");
  assert.equal(speedTone(null), "sem_dados");
  assert.equal(rateTone(0.95), "bom");
  assert.equal(rateTone(0.75), "atencao");
  assert.equal(rateTone(0.4), "ruim");
});

test("totais da equipe ponderados", () => {
  const totals = teamTotals([
    row({ conversations: 10, answered: 8, pending: 2, answered_5min: 4, avg_seconds: 600, channels: 2, channels_connected: 1 }),
    row({ conversations: 30, answered: 24, pending: 6, answered_5min: 12, avg_seconds: 300 }),
    row({ conversations: 0 }),
  ]);
  assert.equal(totals.conversations, 40);
  assert.equal(totals.answered, 32);
  assert.equal(totals.pending, 8);
  assert.equal(totals.rate, 0.8);
  assert.equal(totals.within5min, 0.5);
  assert.equal(totals.avgSeconds, (600 * 8 + 300 * 24) / 32);
  assert.equal(totals.channels, 4);
  assert.equal(totals.connected, 3);
});
