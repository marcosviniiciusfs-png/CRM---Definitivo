import assert from "node:assert/strict";
import test from "node:test";

import { getSegmentTerms, isOrganizationSegment } from "../src/lib/segmentTerms.ts";
import { formatBRL, formatBRLCompact, formatRelativeShort } from "../src/lib/money.ts";

test("termos mudam no modo consórcio", () => {
  const generic = getSegmentTerms("generico");
  const consortium = getSegmentTerms("consorcio");
  assert.equal(generic.value, "Valor");
  assert.equal(consortium.value, "Crédito");
  assert.equal(consortium.revenue, "Produção");
  assert.equal(consortium.sales, "Cotas vendidas");
  assert.equal(consortium.pipelineTotalSuffix, "em crédito no funil");
});

test("segmento desconhecido vira genérico", () => {
  assert.equal(isOrganizationSegment("consorcio"), true);
  assert.equal(isOrganizationSegment("varejo"), false);
  assert.equal(isOrganizationSegment(null), false);
  // @ts-expect-error valor fora do tipo, vindo do banco
  assert.equal(getSegmentTerms("varejo").value, "Valor");
});

test("dinheiro sem centavos e com espaço comum", () => {
  assert.equal(formatBRL(8900), "R$ 8.900");
  assert.equal(formatBRL(null), "R$ 0");
  assert.equal(formatBRL(1234.6), "R$ 1.235");
});

test("dinheiro resumido para cabeçalhos", () => {
  assert.equal(formatBRLCompact(9500), "R$ 9.500");
  assert.equal(formatBRLCompact(412_300), "R$ 412 mil");
  assert.equal(formatBRLCompact(1_250_000), "R$ 1,3 mi");
});

test("tempo relativo curto", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  assert.equal(formatRelativeShort("2026-11-16T11:59:40Z", now), "agora");
  assert.equal(formatRelativeShort("2026-11-16T11:48:00Z", now), "há 12 min");
  assert.equal(formatRelativeShort("2026-11-16T09:00:00Z", now), "há 3 h");
  assert.equal(formatRelativeShort("2026-11-14T12:00:00Z", now), "há 2 d");
  assert.equal(formatRelativeShort(null, now), "");
  assert.equal(formatRelativeShort("não é data", now), "");
});
