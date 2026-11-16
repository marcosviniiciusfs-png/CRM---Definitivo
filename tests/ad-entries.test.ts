import assert from "node:assert/strict";
import test from "node:test";

import { buildAdEntryTable, listDays } from "../src/lib/adEntries.ts";

test("listDays inclui as pontas", () => {
  assert.deepEqual(listDays("2026-11-29", "2026-12-02"), ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
  assert.deepEqual(listDays("2026-11-02", "2026-11-01"), []);
});

test("tabela tem todos os dias, colunas por volume e totais", () => {
  const table = buildAdEntryTable(
    [
      { day: "2026-11-10", source_key: "wa:quero saber", source_label: "Quero saber", leads: 2 },
      { day: "2026-11-10", source_key: "meta_form", source_label: "Formulário da Meta", leads: 5 },
      { day: "2026-11-12T00:00:00.000Z", source_key: "wa:quero saber", source_label: "Quero saber", leads: 1 },
    ],
    { "2026-11-10": 1, "2026-11-12": 2 },
    "2026-11-10",
    "2026-11-12",
  );

  assert.deepEqual(table.sources.map((s) => [s.key, s.total]), [["meta_form", 5], ["wa:quero saber", 3]]);
  assert.deepEqual(table.days.map((d) => [d.day, d.total, d.scheduled]), [
    ["2026-11-12", 1, 2],
    ["2026-11-11", 0, 0],
    ["2026-11-10", 7, 1],
  ]);
  assert.deepEqual(table.totals, { bySource: { meta_form: 5, "wa:quero saber": 3 }, total: 8, scheduled: 3 });
});

test("sem entradas: dias zerados e nenhuma coluna", () => {
  const table = buildAdEntryTable([], {}, "2026-11-01", "2026-11-02");
  assert.equal(table.sources.length, 0);
  assert.deepEqual(table.days.map((d) => d.total), [0, 0]);
});
