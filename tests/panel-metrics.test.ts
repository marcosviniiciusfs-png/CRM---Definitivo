import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDaily,
  cacheTtlMs,
  classifyCreatives,
  costPerConversation,
  indicatorsFrom,
  normalizeAdAccountId,
  percentDelta,
  previousPeriod,
  sumTotals,
} from "../supabase/functions/_shared/panel-metrics.ts";

const conv = (n: number) => ({ action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(n) });
const real = (n: number) => ({ action_type: "onsite_conversion.messaging_user_depth_2_message_send", value: String(n) });

test("sumTotals soma contas e lê conversas, conversas reais e leads", () => {
  const totals = sumTotals([
    { spend: "100.50", reach: "1000", impressions: "4000", inline_link_clicks: "80", actions: [conv(20), real(12), { action_type: "lead", value: "3" }] },
    { spend: "49.50", reach: "500", impressions: "1000", inline_link_clicks: "20", actions: [conv(5), { action_type: "onsite_conversion.lead_grouped", value: "2" }] },
  ]);
  assert.deepEqual(totals, {
    spend: 150, reach: 1500, impressions: 5000, linkClicks: 100,
    conversations: 25, realConversations: 12, leads: 5, videoViews: 0,
  });
});

test("custo por conversa ignora gasto de campanhas de tráfego e alcance", () => {
  const result = costPerConversation([
    { objective: "OUTCOME_ENGAGEMENT", spend: "200", actions: [conv(40)] },
    { objective: "OUTCOME_TRAFFIC", spend: "300", actions: [] },
    { objective: "REACH", spend: "50", actions: [conv(10)] },
  ]);
  assert.equal(result.principalSpend, 200);
  assert.equal(result.conversations, 50);
  assert.equal(result.cost, 4);
  assert.equal(costPerConversation([]).cost, null);
});

test("indicadores: CTR, frequência e CPM", () => {
  const ind = indicatorsFrom({ spend: 150, reach: 1500, impressions: 5000, linkClicks: 100, conversations: 0, realConversations: 0, leads: 0, videoViews: 7 });
  assert.equal(ind.ctr, 0.02);
  assert.equal(Number(ind.frequency?.toFixed(4)), 3.3333);
  assert.equal(ind.cpm, 30);
  assert.equal(indicatorsFrom(sumTotals([])).ctr, null);
});

test("buildDaily junta contas por dia e ordena", () => {
  const daily = buildDaily([
    { date_start: "2026-11-02", spend: "10", actions: [conv(2)] },
    { date_start: "2026-11-01", spend: "30", actions: [conv(3), real(1)] },
    { date_start: "2026-11-02", spend: "10", actions: [conv(3)] },
  ]);
  assert.deepEqual(daily.map((d) => [d.date, d.spend, d.conversations, d.costPerConversation]), [
    ["2026-11-01", 30, 3, 10],
    ["2026-11-02", 20, 5, 4],
  ]);
});

test("criativos: Melhor e Revisar pelas regras do Hurtz", () => {
  const rows = classifyCreatives([
    { ad_id: "bom", ad_name: "Bom", spend: "40", actions: [conv(10), real(6)] },   // custo 4, 60% continuaram
    { ad_id: "caro", ad_name: "Caro", spend: "60", actions: [conv(5), real(4)] },  // custo 12
    { ad_id: "frio", ad_name: "Frio", spend: "30", actions: [conv(6), real(1)] },  // custo 5, 17% continuaram
    { ad_id: "pouco", ad_name: "Pouco", spend: "6", actions: [conv(2), real(2)] }, // poucas conversas
    { ad_id: "zerado", ad_name: "Zerado", spend: "0", actions: [] },
  ]);
  // média = 136 / 23 ≈ 5,91
  const verdict = Object.fromEntries(rows.map((r) => [r.adId, r.verdict]));
  assert.equal(verdict.bom, "best");
  assert.equal(verdict.caro, "review");
  assert.equal(verdict.frio, "review");
  assert.equal(verdict.pouco, null);
  assert.equal("zerado" in verdict, false);
  assert.equal(rows[0].adId, "bom");
});

test("percentDelta: igual abaixo de 0,5% e null sem base", () => {
  assert.equal(percentDelta(110, 100), 0.1);
  assert.equal(percentDelta(100.4, 100), 0);
  assert.equal(percentDelta(10, 0), null);
  assert.equal(percentDelta(null, 10), null);
});

test("previousPeriod tem o mesmo tamanho e termina na véspera", () => {
  assert.deepEqual(previousPeriod("2026-11-08", "2026-11-14"), { from: "2026-11-01", to: "2026-11-07" });
  assert.deepEqual(previousPeriod("2026-11-01", "2026-11-01"), { from: "2026-10-31", to: "2026-10-31" });
  assert.deepEqual(previousPeriod("2026-03-01", "2026-03-31"), { from: "2026-01-29", to: "2026-02-28" });
});

test("cache: 5 min até ontem, 1 h para períodos fechados", () => {
  assert.equal(cacheTtlMs("2026-11-14", "2026-11-14"), 5 * 60_000);
  assert.equal(cacheTtlMs("2026-11-13", "2026-11-14"), 5 * 60_000);
  assert.equal(cacheTtlMs("2026-11-12", "2026-11-14"), 60 * 60_000);
});

test("normalizeAdAccountId aceita número puro ou act_", () => {
  assert.equal(normalizeAdAccountId("123456789"), "act_123456789");
  assert.equal(normalizeAdAccountId(" act_123456789 "), "act_123456789");
  assert.equal(normalizeAdAccountId("abc"), null);
});
