import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateByTeam,
  brtDate,
  conversionRate,
  gapToNext,
  periodRange,
  periodUntilYesterday,
  rankDelta,
  rankRows,
  type RankingRow,
} from "../src/lib/scoring.ts";

const row = (user_id: string, overrides: Partial<RankingRow> = {}): RankingRow => ({
  user_id,
  production: 0,
  sales: 0,
  points: 0,
  leads_received: 0,
  meetings_scheduled: 0,
  meetings_done: 0,
  fast_replies: 0,
  ...overrides,
});

test("data e períodos no horário de Brasília", () => {
  // 02:00 UTC de 17/11 ainda é 16/11 em Brasília (segunda-feira)
  const now = new Date("2026-11-17T02:00:00Z");
  assert.equal(brtDate(now), "2026-11-16");
  assert.deepEqual(periodRange("today", now), { from: "2026-11-16", to: "2026-11-16" });
  assert.deepEqual(periodRange("week", now), { from: "2026-11-16", to: "2026-11-16" });
  assert.deepEqual(periodRange("month", now), { from: "2026-11-01", to: "2026-11-16" });
  const sunday = new Date("2026-11-22T15:00:00Z");
  assert.deepEqual(periodRange("week", sunday), { from: "2026-11-16", to: "2026-11-22" });
});

test("período até ontem", () => {
  const now = new Date("2026-11-16T15:00:00Z");
  assert.equal(periodUntilYesterday("today", now), null);
  assert.equal(periodUntilYesterday("week", now), null); // segunda: semana começou hoje
  assert.deepEqual(periodUntilYesterday("month", now), { from: "2026-11-01", to: "2026-11-15" });
  assert.equal(periodUntilYesterday("month", new Date("2026-11-01T15:00:00Z")), null);
});

test("ranking com empates e valores escondidos", () => {
  const ranked = rankRows(
    [
      row("a", { production: 100, points: 10 }),
      row("b", { production: 300, points: 5 }),
      row("c", { production: 100, points: 50 }),
      row("d", { production: null, points: 99 }),
    ],
    "production",
  );
  assert.deepEqual(ranked.map((r) => [r.row.user_id, r.rank]), [["b", 1], ["c", 2], ["a", 2], ["d", 0]]);
});

test("conversão ignora quem não recebeu leads", () => {
  assert.equal(conversionRate({ sales: 3, leads_received: 30 }), 0.1);
  assert.equal(conversionRate({ sales: 1, leads_received: 0 }), null);
  const ranked = rankRows([row("a", { sales: 2, leads_received: 10 }), row("b", { sales: 1, leads_received: 0 })], "conversion");
  assert.equal(ranked[0].row.user_id, "a");
  assert.equal(ranked[1].rank, 0);
});

test("subida e distância para o próximo", () => {
  assert.equal(rankDelta(2, 5), 3);
  assert.equal(rankDelta(4, 1), -3);
  assert.equal(rankDelta(1, undefined), 0);
  const ranked = rankRows([row("a", { points: 50 }), row("b", { points: 80 }), row("c", { points: 80 })], "points");
  assert.deepEqual(gapToNext(ranked, "a")?.gap, 30);
  assert.equal(gapToNext(ranked, "b"), null);
});

test("soma por equipe", () => {
  const teams = aggregateByTeam(
    [row("a", { production: 100, sales: 1 }), row("b", { production: 50, sales: 2 }), row("c", { production: null, sales: 1 })],
    [
      { team_id: "t1", user_id: "a" },
      { team_id: "t1", user_id: "b" },
      { team_id: "t2", user_id: "c" },
      { team_id: "t2", user_id: "fora" },
    ],
  );
  const t1 = teams.find((t) => t.team_id === "t1");
  const t2 = teams.find((t) => t.team_id === "t2");
  assert.equal(t1?.production, 150);
  assert.equal(t1?.sales, 3);
  assert.equal(t1?.members, 2);
  assert.equal(t2?.production, null);
  assert.equal(t2?.members, 1);
});
