import assert from "node:assert/strict";
import test from "node:test";

import {
  addMonths,
  buildForecast,
  buildSchedule,
  chargebackPercent,
  computeChargeback,
  formatMonth,
  guessStatementColumns,
  installmentsToCancel,
  matchRule,
  matchStatement,
  normalizeKey,
  parseInstallmentNumber,
  parsePercentInput,
  parseStatementValue,
  roundCents,
  sellerAmount,
  sellerSharePercent,
  splitEvenly,
  validateCommissionRule,
  type CommissionRuleLike,
} from "../src/lib/consortiumCommission.ts";

const baseRule: CommissionRuleLike = {
  administrator_id: null,
  asset_type: null,
  commission_percent: 3,
  installment_percents: [1, 0.5, 0.5, 0.5, 0.25, 0.25],
  chargeback: [
    { until_installment: 3, percent: 100 },
    { until_installment: 6, percent: 50 },
    { until_installment: 12, percent: 25 },
  ],
  seller_share_percent: 30,
  seller_tiers: null,
  is_active: true,
};

test("vale a regra ativa mais específica", () => {
  const rules = [
    { ...baseRule, id: "padrao" },
    { ...baseRule, id: "imovel", asset_type: "imovel" },
    { ...baseRule, id: "embracon", administrator_id: "emb" },
    { ...baseRule, id: "embracon-imovel", administrator_id: "emb", asset_type: "imovel" },
    { ...baseRule, id: "embracon-veiculo-off", administrator_id: "emb", asset_type: "veiculo", is_active: false },
  ];
  assert.equal(matchRule(rules, { administrator_id: "emb", asset_type: "imovel" })?.id, "embracon-imovel");
  assert.equal(matchRule(rules, { administrator_id: "emb", asset_type: "veiculo" })?.id, "embracon");
  assert.equal(matchRule(rules, { administrator_id: "porto", asset_type: "imovel" })?.id, "imovel");
  assert.equal(matchRule(rules, { administrator_id: "porto", asset_type: "moto" })?.id, "padrao");
  assert.equal(matchRule([], { administrator_id: "porto", asset_type: "moto" }), null);
});

test("cronograma começa no mês em que a venda conta e fecha o total", () => {
  const rows = buildSchedule(250000, baseRule, "2026-11-20");
  assert.deepEqual(rows.map((row) => row.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(rows[0].due_month, "2026-11-01");
  assert.equal(rows[2].due_month, "2027-01-01");
  assert.equal(rows[0].amount, 2500);
  assert.equal(roundCents(rows.reduce((total, row) => total + row.amount, 0)), 7500);
});

test("mês com 0% não gera parcela e a última absorve o arredondamento", () => {
  const rule = { commission_percent: 1, installment_percents: [0.3333, 0, 0.3333, 0.3334] };
  const rows = buildSchedule(100001, rule, "2026-12-05");
  assert.deepEqual(rows.map((row) => row.n), [1, 3, 4]);
  assert.equal(rows[1].due_month, "2027-02-01");
  assert.equal(roundCents(rows.reduce((total, row) => total + row.amount, 0)), 1000.01);
});

test("faixa do vendedor pela produção do mês", () => {
  const rule = {
    seller_share_percent: 30,
    seller_tiers: [
      { min_monthly_production: 500000, share_percent: 40 },
      { min_monthly_production: 1000000, share_percent: 50 },
    ],
  };
  assert.equal(sellerSharePercent(rule, 100000), 30);
  assert.equal(sellerSharePercent(rule, 500000), 40);
  assert.equal(sellerSharePercent(rule, 2500000), 50);
  assert.equal(sellerSharePercent({ seller_share_percent: 25, seller_tiers: null }, 9e9), 25);
  assert.equal(sellerAmount(2500, 40), 1000);
});

test("estorno pela parcela do cancelamento", () => {
  assert.equal(chargebackPercent(baseRule.chargeback, 1), 100);
  assert.equal(chargebackPercent(baseRule.chargeback, 3), 100);
  assert.equal(chargebackPercent(baseRule.chargeback, 4), 50);
  assert.equal(chargebackPercent(baseRule.chargeback, 12), 25);
  assert.equal(chargebackPercent(baseRule.chargeback, 13), 0);
  assert.equal(chargebackPercent(baseRule.chargeback, null), 100);

  const rows = [
    { n: 1, status: "paga_vendedor", amount: 2500, seller_amount: 750 },
    { n: 2, status: "recebida", amount: 1250, seller_amount: 375 },
    { n: 3, status: "prevista", amount: 1250, seller_amount: 375 },
    { n: 4, status: "prevista", amount: 1250, seller_amount: 375 },
  ];
  assert.deepEqual(computeChargeback(rows, baseRule.chargeback, 5), { amount: -1875, seller_amount: -562.5, percent: 50 });
  assert.deepEqual(computeChargeback(rows, baseRule.chargeback, 20), { amount: 0, seller_amount: 0, percent: 0 });
  assert.deepEqual(installmentsToCancel(rows, 3).map((row) => row.n), [3, 4]);
  assert.deepEqual(installmentsToCancel(rows, null).map((row) => row.n), [3, 4]);
});

test("validação da regra", () => {
  assert.deepEqual(validateCommissionRule(baseRule), []);
  assert.match(validateCommissionRule({ ...baseRule, installment_percents: [1, 1] }).join(" "), /soma das parcelas/);
  assert.match(validateCommissionRule({ ...baseRule, chargeback: [{ until_installment: 3, percent: 100 }, { until_installment: 3, percent: 50 }] }).join(" "), /mesma parcela/);
  assert.match(validateCommissionRule({ ...baseRule, seller_share_percent: 120 }).join(" "), /vendedor/);
  assert.match(validateCommissionRule({ ...baseRule, commission_percent: 0, installment_percents: [] }).join(" "), /comissão total/);
  assert.deepEqual(splitEvenly(3, 6), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  assert.equal(roundCents(splitEvenly(1, 3).reduce((a, b) => a + b, 0) * 100) / 100, 1);
  assert.equal(parsePercentInput("1,5"), 1.5);
  assert.equal(parsePercentInput("2%"), 2);
  assert.equal(parsePercentInput("abc"), null);
});

test("previsão mês a mês", () => {
  const forecast = buildForecast(
    [
      { due_month: "2026-11-01", status: "paga_vendedor", amount: 2500, seller_amount: 750 },
      { due_month: "2026-11-01", status: "recebida", amount: 1000, seller_amount: 300 },
      { due_month: "2026-12-01", status: "prevista", amount: 1250, seller_amount: 375 },
      { due_month: "2026-12-01", status: "cancelada", amount: 1250, seller_amount: 375 },
      { due_month: "2026-12-01", status: "estorno", amount: -1875, seller_amount: -562.5 },
      { due_month: "2027-06-01", status: "prevista", amount: 99, seller_amount: 9 },
    ],
    ["2026-11-01", "2026-12-01", "2027-01-01"],
  );
  assert.equal(forecast.length, 3);
  assert.deepEqual(forecast[0], { month: "2026-11-01", toReceive: 0, received: 3500, toPaySellers: 300, paidSellers: 750, chargebacks: 0, sellerChargebacks: 0 });
  assert.equal(forecast[1].toReceive, 1250);
  assert.equal(forecast[1].chargebacks, -1875);
  assert.equal(forecast[2].toReceive, 0);
  assert.equal(addMonths("2026-11-01", 14), "2028-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
  assert.equal(formatMonth("2026-11-01"), "nov/2026");
});

test("leitura do extrato", () => {
  assert.equal(normalizeKey(" 000123-4 "), "1234");
  assert.equal(normalizeKey("0"), "0");
  assert.equal(parseInstallmentNumber("03/06"), 3);
  assert.equal(parseInstallmentNumber(2), 2);
  assert.equal(parseInstallmentNumber("sem"), null);
  assert.equal(parseStatementValue("R$ 1.234,56"), 1234.56);
  assert.equal(parseStatementValue("1.250"), 1250);
  assert.equal(parseStatementValue(99.999), 100);
  assert.equal(parseStatementValue("-12,50"), -12.5);
  assert.deepEqual(guessStatementColumns(["Grupo", "Cota", "Nº Parcela", "Valor da comissão", "Contrato"]), {
    contract: 4, group: 0, quota: 1, installment: 2, value: 3,
  });
});

test("conciliação do extrato com as parcelas", () => {
  const sales = [
    { id: "s1", contract_number: "AB-123", group_code: "001", quota_number: "45" },
    { id: "s2", contract_number: null, group_code: "2000", quota_number: "7" },
    { id: "s3", contract_number: "999", group_code: null, quota_number: null },
    { id: "s4", contract_number: "999", group_code: null, quota_number: null },
  ];
  const installments = [
    { id: "i1", sale_id: "s1", n: 1, status: "recebida", amount: 2500 },
    { id: "i2", sale_id: "s1", n: 2, status: "prevista", amount: 1250 },
    { id: "i3", sale_id: "s2", n: 1, status: "prevista", amount: 300 },
    { id: "i4", sale_id: "s2", n: 2, status: "cancelada", amount: 300 },
  ];
  const columns = { contract: 0, group: 1, quota: 2, installment: 3, value: 4 };
  const rows = [
    ["ab123", "", "", "2", "1.250,00"],
    ["", "2000", "0007", "1/6", "310"],
    ["AB-123", "", "", "1", "2500"],
    ["", "2000", "7", "2", "300"],
    ["555", "", "", "1", "10"],
    ["999", "", "", "1", "10"],
    ["AB-123", "", "", "x", "10"],
    ["AB-123", "", "", "9", "10"],
    ["ab123", "", "", "2", "1250"],
    ["", "", "", "", "Total"],
  ];
  const result = matchStatement(rows, columns, sales, installments);
  assert.deepEqual(result.map((match) => match.status), [
    "ok", "ok", "ja_recebida", "cancelada", "sem_cota", "cota_repetida", "parcela_invalida", "sem_parcela", "linha_repetida",
  ]);
  assert.equal(result[0].installmentId, "i2");
  assert.equal(result[0].valueDiffers, false);
  assert.equal(result[1].valueDiffers, true);
});
