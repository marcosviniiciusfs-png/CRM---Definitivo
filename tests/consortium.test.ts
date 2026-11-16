import assert from "node:assert/strict";
import test from "node:test";

import {
  assetTypeLabel,
  maskMoneyInput,
  moneyToInput,
  parseMoneyInput,
  parseMonths,
  saleCountDate,
  saleCounts,
  todayInBrazil,
} from "../src/lib/consortium.ts";

test("regra da adesão conta tudo menos cancelada", () => {
  assert.equal(saleCounts("aguardando_primeira_parcela", "adesao"), true);
  assert.equal(saleCounts("ativa", "adesao"), true);
  assert.equal(saleCounts("cancelada", "adesao"), false);
});

test("regra da 1ª parcela só conta cota ativa", () => {
  assert.equal(saleCounts("aguardando_primeira_parcela", "primeira_parcela"), false);
  assert.equal(saleCounts("ativa", "primeira_parcela"), true);
  assert.equal(saleCounts("cancelada", "primeira_parcela"), false);
});

test("data que posiciona a cota no período", () => {
  const sale = { status: "ativa" as const, adhesion_date: "2026-11-02", first_installment_paid_on: "2026-11-10" };
  assert.equal(saleCountDate(sale, "adesao"), "2026-11-02");
  assert.equal(saleCountDate(sale, "primeira_parcela"), "2026-11-10");
  assert.equal(saleCountDate({ ...sale, status: "cancelada" }, "adesao"), null);
});

test("leitura de valores digitados", () => {
  assert.equal(parseMoneyInput("R$ 250.000"), 250000);
  assert.equal(parseMoneyInput("R$ 250.000,50"), 250000.5);
  assert.equal(parseMoneyInput("1500,5"), 1500.5);
  assert.equal(parseMoneyInput("250000"), 250000);
  assert.equal(parseMoneyInput("1.500.000"), 1500000);
  assert.equal(parseMoneyInput("0"), null);
  assert.equal(parseMoneyInput(""), null);
  assert.equal(parseMoneyInput("abc"), null);
});

test("máscara de moeda", () => {
  assert.equal(maskMoneyInput("250000"), "R$ 250.000");
  assert.equal(maskMoneyInput("1500,5"), "R$ 1.500,5");
  assert.equal(maskMoneyInput("1500,567"), "R$ 1.500,56");
  assert.equal(maskMoneyInput(""), "");
  assert.equal(moneyToInput(250000), "R$ 250.000");
  assert.equal(moneyToInput("1500.5"), "R$ 1.500,50");
  assert.equal(moneyToInput(null), "");
  assert.equal(parseMoneyInput(moneyToInput(1500.5)), 1500.5);
});

test("prazo em meses", () => {
  assert.equal(parseMonths("200"), 200);
  assert.equal(parseMonths("200 meses"), 200);
  assert.equal(parseMonths("0"), null);
  assert.equal(parseMonths("400"), null);
});

test("rótulos e data de Brasília", () => {
  assert.equal(assetTypeLabel("imovel"), "Imóvel");
  assert.equal(assetTypeLabel("barco"), null);
  assert.equal(todayInBrazil(new Date("2026-11-17T02:00:00Z")), "2026-11-16");
});
