import assert from "node:assert/strict";
import test from "node:test";

import { humanizeFieldName, humanizeFieldValue } from "../src/lib/formFields.ts";

test("nomes de campo legíveis", () => {
  assert.equal(humanizeFieldName("Full Name"), "Nome completo");
  assert.equal(humanizeFieldName("whatsapp_com_ddd"), "WhatsApp com DDD");
  assert.equal(humanizeFieldName("Possui Entrada Disponivel"), "Possui entrada disponivel");
  assert.equal(humanizeFieldName("city"), "Cidade");
  assert.equal(humanizeFieldName("usa_fgts"), "Usa FGTS");
});

test("valores legíveis sem estragar dados", () => {
  assert.equal(humanizeFieldValue("de_8_a_15_mil"), "De 8 a 15 mil");
  assert.equal(humanizeFieldValue("sim"), "Sim");
  assert.equal(humanizeFieldValue("+5594992505822"), "+5594992505822");
  assert.equal(humanizeFieldValue("ana@exemplo.com"), "ana@exemplo.com");
  assert.equal(humanizeFieldValue("Canaã dos Carajás"), "Canaã dos Carajás");
  assert.equal(humanizeFieldValue("https://x.com/a_b"), "https://x.com/a_b");
});
