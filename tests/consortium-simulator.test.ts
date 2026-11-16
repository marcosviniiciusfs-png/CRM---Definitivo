import assert from "node:assert/strict";
import test from "node:test";

import {
  availableTerms,
  balanceAfterMonths,
  bidAmountFromPercent,
  bidPercentFromAmount,
  installmentAfterContemplation,
  parsePercent,
  parseTerms,
  planConditions,
  planFits,
  simulateBid,
  simulateFinancing,
  simulateInstallments,
  type PlanConditions,
} from "../src/lib/consortiumSimulator.ts";
import {
  buildProposalPayload,
  parseProposalPayload,
  proposalPlansSummary,
  proposalUrl,
  proposalWhatsAppMessage,
} from "../src/lib/consortiumProposal.ts";
import { parseDelimited, parsePlanRows, planTemplateCsv } from "../src/lib/consortiumPlanImport.ts";

const conditions: PlanConditions = {
  adminFeePercent: 18,
  reserveFundPercent: 2,
  insuranceMonthlyPercent: 0.05,
  reducedInstallmentPercent: 30,
  maxEmbeddedBidPercent: 25,
  fixedBidPercent: 30,
};

const plan = {
  asset_type: "imovel",
  credit_min: "100000",
  credit_max: 500000,
  terms: [180, 200],
  is_active: true,
  admin_fee_percent: "18",
  reserve_fund_percent: 2,
  insurance_monthly_percent: 0.05,
  reduced_installment_percent: 30,
  max_embedded_bid_percent: 25,
  fixed_bid_percent: null,
};

test("parcela cheia, reduzida, custo total e total pago", () => {
  const result = simulateInstallments(200000, 200, conditions);
  // 200.000 × 1,20 / 200 = 1.200; seguro 200.000 × 0,05% = 100
  assert.equal(result.baseInstallment, 1200);
  assert.equal(result.insuranceMonthly, 100);
  assert.equal(result.fullInstallment, 1300);
  // 1.200 × 0,7 + 100
  assert.equal(result.reducedInstallment, 940);
  assert.equal(result.adminFeeAmount, 36000);
  assert.equal(result.reserveFundAmount, 4000);
  assert.equal(result.insuranceTotal, 20000);
  assert.equal(result.totalCost, 60000);
  assert.equal(result.totalPaid, 260000);
  assert.equal(result.costPercent, 30);
});

test("sem redutor e sem seguro", () => {
  const result = simulateInstallments(100000, 100, { ...conditions, insuranceMonthlyPercent: 0, reducedInstallmentPercent: 0 });
  assert.equal(result.fullInstallment, 1200);
  assert.equal(result.reducedInstallment, null);
  assert.equal(result.totalPaid, 120000);
});

test("saldo e parcela depois da contemplação", () => {
  const installments = simulateInstallments(200000, 200, conditions);
  // total base 240.000; 10 parcelas reduzidas de 840 = 8.400
  assert.equal(balanceAfterMonths(installments, conditions, 10), 231600);
  // 231.600 / 190 + 100
  assert.equal(installmentAfterContemplation(installments, conditions, 10), 1318.95);
});

test("lance livre com embutido limitado ao máximo do plano", () => {
  const noReducer = { ...conditions, reducedInstallmentPercent: 0 };
  const installments = simulateInstallments(200000, 200, noReducer);
  const bid = simulateBid(installments, noReducer, { mode: "livre", embeddedPercent: 40, ownAmount: 20000, contemplationMonth: 1 });
  assert.ok(bid);
  assert.equal(bid.embeddedCapped, true);
  assert.equal(bid.embeddedPercent, 25);
  assert.equal(bid.embeddedAmount, 50000);
  assert.equal(bid.ownAmount, 20000);
  assert.equal(bid.totalAmount, 70000);
  assert.equal(bid.totalPercent, 35);
  assert.equal(bid.netCredit, 150000);
  // saldo: 240.000 − 1.200 = 238.800; − 70.000 = 168.800
  assert.equal(bid.balanceAfterBid, 168800);
  // 168.800 / 199 + 100
  assert.equal(bid.installmentAfterBid, 948.24);
  // 168.800 / 1.200 = 140,67 -> 141
  assert.equal(bid.remainingMonthsAfterBid, 141);
});

test("lance fixo: parte embutida e parte com recurso próprio", () => {
  const installments = simulateInstallments(200000, 200, conditions);
  const bid = simulateBid(installments, conditions, { mode: "fixo", embeddedPercent: 10, ownAmount: 999, contemplationMonth: 1 });
  assert.ok(bid);
  assert.equal(bid.unavailable, false);
  assert.equal(bid.totalPercent, 30);
  assert.equal(bid.embeddedAmount, 20000);
  assert.equal(bid.ownAmount, 40000);
  assert.equal(bid.netCredit, 180000);

  const noFixed = simulateBid(installments, { ...conditions, fixedBidPercent: null }, { mode: "fixo", embeddedPercent: 10, ownAmount: 0, contemplationMonth: 1 });
  assert.equal(noFixed?.unavailable, true);
  assert.equal(noFixed?.totalAmount, 0);
  assert.equal(simulateBid(installments, conditions, { mode: "nenhum", embeddedPercent: 0, ownAmount: 0, contemplationMonth: 1 }), null);
});

test("lance livre: valor e percentual do crédito", () => {
  assert.equal(bidPercentFromAmount(250000, 50000), 20);
  assert.equal(bidAmountFromPercent(250000, 12.5), 31250);
  assert.equal(bidPercentFromAmount(0, 1000), 0);
});

test("financiamento pela tabela Price", () => {
  const financing = simulateFinancing(100000, 1, 120);
  assert.equal(financing.installment, 1434.71);
  assert.equal(financing.totalPaid, 172165.14);
  assert.equal(financing.totalInterest, 72165.14);
  assert.equal(simulateFinancing(12000, 0, 12).installment, 1000);
});

test("plano atende ao bem, crédito e prazo", () => {
  assert.equal(planFits(plan, { assetType: "imovel", credit: 200000, termMonths: 200 }), true);
  assert.equal(planFits(plan, { assetType: "imovel", credit: 600000, termMonths: 200 }), false);
  assert.equal(planFits(plan, { assetType: "imovel", credit: 200000, termMonths: 150 }), false);
  assert.equal(planFits(plan, { assetType: "veiculo", credit: 200000, termMonths: 200 }), false);
  assert.equal(planFits({ ...plan, is_active: false }, { assetType: "imovel", credit: 200000, termMonths: 200 }), false);
  assert.deepEqual(availableTerms([plan, { ...plan, terms: [150, 200] }], "imovel", 200000), [150, 180, 200]);
  assert.deepEqual(availableTerms([plan], "imovel", 50000), []);
  assert.equal(planConditions(plan).adminFeePercent, 18);
  assert.equal(planConditions(plan).fixedBidPercent, null);
});

test("leitura de percentuais e prazos", () => {
  assert.equal(parsePercent("1,5"), 1.5);
  assert.equal(parsePercent("0.038"), 0.038);
  assert.equal(parsePercent("18%"), 18);
  assert.equal(parsePercent(""), null);
  assert.deepEqual(parseTerms("200, 150 e 180, 200"), [150, 180, 200]);
  assert.equal(parseTerms("0 100"), null);
  assert.equal(parseTerms("sem prazo"), null);
});

test("proposta: retrato, leitura e mensagem", () => {
  const installments = simulateInstallments(200000, 200, conditions);
  const payload = buildProposalPayload({
    credit: 200000,
    assetType: "imovel",
    financing: simulateFinancing(200000, 1, 200),
    plans: [
      {
        administrator: "Embracon",
        planName: "Imóvel 200",
        assetType: "imovel",
        adjustmentIndex: "INCC",
        conditions,
        installments,
        bid: simulateBid(installments, conditions, { mode: "livre", embeddedPercent: 10, ownAmount: 0, contemplationMonth: 1 }),
      },
    ],
  });
  assert.equal(payload.plans[0].label, "Plano A");
  assert.equal(payload.plans[0].full_installment, 1300);
  assert.equal(payload.plans[0].bid?.net_credit, 180000);
  assert.throws(() => buildProposalPayload({ credit: 1, assetType: null, financing: null, plans: [] }));

  const parsed = parseProposalPayload(JSON.parse(JSON.stringify({ ...payload, client: { name: "Maria Souza" } })));
  assert.ok(parsed);
  assert.equal(parsed.client.name, "Maria Souza");
  assert.equal(parsed.plans[0].reduced_installment, 940);
  assert.equal(parseProposalPayload({ plans: [] }), null);
  assert.equal(parseProposalPayload("x"), null);
  assert.equal(proposalPlansSummary(parsed), "Embracon Imóvel 200");

  const url = proposalUrl("https://app.kairoz.com.br/", "abc");
  assert.equal(url, "https://app.kairoz.com.br/proposta/abc");
  const message = proposalWhatsAppMessage("Maria Souza", url, 2);
  assert.ok(message.startsWith("Olá, Maria!"));
  assert.ok(message.includes("2 opções"));
  assert.ok(message.includes(url));
  assert.ok(proposalWhatsAppMessage("", url, 1).startsWith("Olá!"));
});

test("importação de planos por CSV", () => {
  const rows = parseDelimited(
    "\uFEFFAdministradora;Plano;Tipo de bem;Crédito mínimo;Crédito máximo;Prazos;Taxa de administração (%);Fundo de reserva (%);Seguro (% ao mês);Índice de reajuste;Redutor (%);Lance embutido máx. (%);Lance fixo (%);Observações\r\n" +
      'Embracon;Imóvel 200;Imóvel;R$ 100.000;500000;150 180 200;18;2;0,038;INCC;30;30;;"Grupo novo; sorteio mensal"\r\n' +
      "Porto;Auto;carro;30000;20000;60;15;;;;;;;\r\n" +
      ";;;;;;;;;;;;;\r\n",
  );
  assert.equal(rows.length, 2);
  const { plans, errors } = parsePlanRows(rows);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].credit_min, 100000);
  assert.deepEqual(plans[0].terms, [150, 180, 200]);
  assert.equal(plans[0].insurance_monthly_percent, 0.038);
  assert.equal(plans[0].adjustment_index, "INCC");
  assert.equal(plans[0].fixed_bid_percent, null);
  assert.equal(plans[0].notes, "Grupo novo; sorteio mensal");
  assert.deepEqual(errors, [{ line: 3, message: "O crédito máximo precisa ser maior ou igual ao mínimo." }]);

  const fromXlsx = parsePlanRows([
    { Administradora: "Rodobens", Plano: "Moto", "Tipo de bem": "moto", "Crédito mínimo": 10000, "Crédito máximo": 30000, Prazos: 48, "Taxa de administração (%)": 16, "Índice de reajuste": "igpm" },
  ]);
  assert.equal(fromXlsx.errors.length, 0);
  assert.equal(fromXlsx.plans[0].adjustment_index, "IGP-M");
  assert.deepEqual(fromXlsx.plans[0].terms, [48]);

  const template = parseDelimited(planTemplateCsv());
  assert.equal(parsePlanRows(template).plans.length, 1);
});
