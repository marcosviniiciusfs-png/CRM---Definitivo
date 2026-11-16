// Cálculos do simulador de consórcio (Fase 3 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md).
// Funções puras. Os números são ESTIMATIVAS a partir do que a corretora cadastrou no plano; as
// condições finais (reajuste, seguro sobre saldo, regras de lance) são as da administradora.
//
// Notação: C = crédito, n = prazo em meses, a = taxa de administração total (%),
// f = fundo de reserva total (%), s = seguro (% do crédito ao mês), r = redutor (%).
//
//   parcela base      = C × (1 + a/100 + f/100) / n          (fundo comum + taxa + fundo, por mês)
//   seguro mensal     = C × s/100
//   parcela cheia     = parcela base + seguro mensal
//   parcela reduzida  = parcela base × (1 − r/100) + seguro    (até a contemplação; o seguro não reduz)
//   custo total       = C × a/100 + C × f/100 + seguro mensal × n
//   total pago        = C + custo total
//
// Lance (dado na contemplação, no mês k):
//   lance embutido    = C × e/100, com e limitado ao máximo do plano; crédito líquido = C − embutido
//   lance livre       = embutido + recurso próprio (valor ↔ % do crédito)
//   lance fixo        = C × fixo/100; a parte embutida sai do crédito e o resto é recurso próprio
//   saldo antes       = C × (1 + a + f) − parcelas base pagas até k (reduzidas, se houver redutor)
//   saldo depois      = saldo antes − lance
//   parcela depois    = saldo depois / (n − k) + seguro           (mantendo o prazo)
//   meses restantes   = ⌈saldo depois / parcela base⌉             (mantendo a parcela cheia)
//
// Financiamento (Price): parcela = P × i / (1 − (1 + i)^−n), i = taxa ao mês; total = parcela × n.

import type { AssetType } from "@/lib/consortium";

export type AdjustmentIndex = "INCC" | "IPCA" | "INPC" | "IGP-M" | "nenhum";
export type BidMode = "nenhum" | "livre" | "fixo";

export const ADJUSTMENT_INDEXES: Array<{ value: AdjustmentIndex; label: string }> = [
  { value: "INCC", label: "INCC" },
  { value: "IPCA", label: "IPCA" },
  { value: "INPC", label: "INPC" },
  { value: "IGP-M", label: "IGP-M" },
  { value: "nenhum", label: "Sem reajuste" },
];

export const adjustmentIndexLabel = (value: string | null | undefined) =>
  ADJUSTMENT_INDEXES.find((option) => option.value === value)?.label ?? "Sem reajuste";

export const isAdjustmentIndex = (value: unknown): value is AdjustmentIndex =>
  ADJUSTMENT_INDEXES.some((option) => option.value === value);

/** Condições de um plano usadas no cálculo (percentuais em %, ex.: 18 = 18%). */
export interface PlanConditions {
  adminFeePercent: number;
  reserveFundPercent: number;
  insuranceMonthlyPercent: number;
  reducedInstallmentPercent: number;
  maxEmbeddedBidPercent: number;
  fixedBidPercent: number | null;
}

/** Plano como sai do banco (só o que o simulador precisa). */
export interface PlanLike {
  asset_type: string;
  credit_min: number | string;
  credit_max: number | string;
  terms: number[];
  is_active: boolean;
  admin_fee_percent: number | string;
  reserve_fund_percent: number | string;
  insurance_monthly_percent: number | string;
  reduced_installment_percent: number | string;
  max_embedded_bid_percent: number | string;
  fixed_bid_percent: number | string | null;
}

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const num = (value: number | string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function planConditions(plan: PlanLike): PlanConditions {
  return {
    adminFeePercent: num(plan.admin_fee_percent),
    reserveFundPercent: num(plan.reserve_fund_percent),
    insuranceMonthlyPercent: num(plan.insurance_monthly_percent),
    reducedInstallmentPercent: num(plan.reduced_installment_percent),
    maxEmbeddedBidPercent: num(plan.max_embedded_bid_percent),
    fixedBidPercent: plan.fixed_bid_percent == null || plan.fixed_bid_percent === "" ? null : num(plan.fixed_bid_percent),
  };
}

/** O plano atende ao tipo de bem, ao crédito e ao prazo pedidos? */
export function planFits(plan: PlanLike, query: { assetType: AssetType | string; credit: number; termMonths: number }): boolean {
  return (
    plan.is_active &&
    plan.asset_type === query.assetType &&
    query.credit >= num(plan.credit_min) &&
    query.credit <= num(plan.credit_max) &&
    plan.terms.includes(query.termMonths)
  );
}

/** Prazos oferecidos pelos planos ativos que atendem ao tipo de bem e ao crédito, em ordem. */
export function availableTerms(plans: PlanLike[], assetType: string, credit: number | null): number[] {
  const terms = new Set<number>();
  for (const plan of plans) {
    if (!plan.is_active || plan.asset_type !== assetType) continue;
    if (credit != null && (credit < num(plan.credit_min) || credit > num(plan.credit_max))) continue;
    plan.terms.forEach((term) => terms.add(term));
  }
  return [...terms].sort((a, b) => a - b);
}

export interface InstallmentResult {
  credit: number;
  termMonths: number;
  /** Fundo comum + taxa + fundo de reserva, por mês. */
  baseInstallment: number;
  insuranceMonthly: number;
  fullInstallment: number;
  /** Parcela até a contemplação com o redutor; null se o plano não tem redutor. */
  reducedInstallment: number | null;
  adminFeeAmount: number;
  reserveFundAmount: number;
  insuranceTotal: number;
  /** Taxa + fundo + seguro. */
  totalCost: number;
  /** Crédito + custo total. */
  totalPaid: number;
  /** Custo total em % do crédito. */
  costPercent: number;
}

export function simulateInstallments(credit: number, termMonths: number, conditions: PlanConditions): InstallmentResult {
  const n = Math.max(1, Math.round(termMonths));
  const adminFeeAmount = (credit * conditions.adminFeePercent) / 100;
  const reserveFundAmount = (credit * conditions.reserveFundPercent) / 100;
  const baseInstallment = (credit + adminFeeAmount + reserveFundAmount) / n;
  const insuranceMonthly = (credit * conditions.insuranceMonthlyPercent) / 100;
  const insuranceTotal = insuranceMonthly * n;
  const totalCost = adminFeeAmount + reserveFundAmount + insuranceTotal;
  const reduction = Math.min(Math.max(conditions.reducedInstallmentPercent, 0), 60);
  return {
    credit: roundMoney(credit),
    termMonths: n,
    baseInstallment: roundMoney(baseInstallment),
    insuranceMonthly: roundMoney(insuranceMonthly),
    fullInstallment: roundMoney(baseInstallment + insuranceMonthly),
    reducedInstallment: reduction > 0 ? roundMoney(baseInstallment * (1 - reduction / 100) + insuranceMonthly) : null,
    adminFeeAmount: roundMoney(adminFeeAmount),
    reserveFundAmount: roundMoney(reserveFundAmount),
    insuranceTotal: roundMoney(insuranceTotal),
    totalCost: roundMoney(totalCost),
    totalPaid: roundMoney(credit + totalCost),
    costPercent: credit > 0 ? Math.round((totalCost / credit) * 10000) / 100 : 0,
  };
}

/** Lance livre: valor em R$ -> % do crédito. */
export const bidPercentFromAmount = (credit: number, amount: number) =>
  credit > 0 ? Math.round((amount / credit) * 10000) / 100 : 0;

/** Lance livre: % do crédito -> valor em R$. */
export const bidAmountFromPercent = (credit: number, percent: number) => roundMoney((credit * percent) / 100);

export interface BidInput {
  mode: BidMode;
  /** Lance embutido pedido (% do crédito); fica limitado ao máximo do plano. */
  embeddedPercent: number;
  /** Recurso próprio do lance livre, em R$. */
  ownAmount: number;
  /** Mês da contemplação (1 = primeira assembleia). */
  contemplationMonth: number;
}

export interface BidResult {
  mode: Exclude<BidMode, "nenhum">;
  /** Plano sem lance fixo cadastrado (modo fixo). */
  unavailable: boolean;
  embeddedPercent: number;
  embeddedAmount: number;
  /** O lance embutido pedido passou do máximo do plano e foi limitado. */
  embeddedCapped: boolean;
  ownAmount: number;
  totalAmount: number;
  totalPercent: number;
  netCredit: number;
  contemplationMonth: number;
  balanceBeforeBid: number;
  balanceAfterBid: number;
  /** Parcela depois do lance, mantendo o prazo. */
  installmentAfterBid: number;
  /** Meses que faltam depois do lance, mantendo a parcela cheia. */
  remainingMonthsAfterBid: number;
}

/** Saldo devedor (sem seguro) depois de pagar k parcelas, com ou sem redutor. */
export function balanceAfterMonths(installments: InstallmentResult, conditions: PlanConditions, months: number): number {
  const k = Math.min(Math.max(Math.round(months), 0), installments.termMonths);
  const reduction = Math.min(Math.max(conditions.reducedInstallmentPercent, 0), 60);
  const paidPerMonth = installments.baseInstallment * (1 - reduction / 100);
  const total = installments.baseInstallment * installments.termMonths;
  return roundMoney(Math.max(total - paidPerMonth * k, 0));
}

/** Parcela depois da contemplação no mês k, sem lance (o redutor acaba e a diferença é diluída). */
export function installmentAfterContemplation(installments: InstallmentResult, conditions: PlanConditions, month: number): number {
  const k = Math.min(Math.max(Math.round(month), 1), installments.termMonths);
  const remaining = installments.termMonths - k;
  if (remaining <= 0) return 0;
  return roundMoney(balanceAfterMonths(installments, conditions, k) / remaining + installments.insuranceMonthly);
}

export function simulateBid(installments: InstallmentResult, conditions: PlanConditions, bid: BidInput): BidResult | null {
  if (bid.mode === "nenhum") return null;
  const credit = installments.credit;
  const k = Math.min(Math.max(Math.round(bid.contemplationMonth) || 1, 1), installments.termMonths);
  const requestedEmbedded = Math.max(bid.embeddedPercent || 0, 0);
  let embeddedPercent = Math.min(requestedEmbedded, conditions.maxEmbeddedBidPercent);
  let embeddedCapped = requestedEmbedded > conditions.maxEmbeddedBidPercent;
  let ownAmount = Math.max(bid.ownAmount || 0, 0);
  let unavailable = false;

  if (bid.mode === "fixo") {
    if (conditions.fixedBidPercent == null) {
      unavailable = true;
      embeddedPercent = 0;
      embeddedCapped = false;
      ownAmount = 0;
    } else {
      embeddedPercent = Math.min(embeddedPercent, conditions.fixedBidPercent);
      ownAmount = (credit * (conditions.fixedBidPercent - embeddedPercent)) / 100;
    }
  }

  const embeddedAmount = (credit * embeddedPercent) / 100;
  const totalAmount = embeddedAmount + ownAmount;
  const balanceBeforeBid = balanceAfterMonths(installments, conditions, k);
  const balanceAfterBid = Math.max(balanceBeforeBid - totalAmount, 0);
  const remaining = installments.termMonths - k;

  return {
    mode: bid.mode,
    unavailable,
    embeddedPercent: Math.round(embeddedPercent * 100) / 100,
    embeddedAmount: roundMoney(embeddedAmount),
    embeddedCapped,
    ownAmount: roundMoney(ownAmount),
    totalAmount: roundMoney(totalAmount),
    totalPercent: bidPercentFromAmount(credit, totalAmount),
    netCredit: roundMoney(credit - embeddedAmount),
    contemplationMonth: k,
    balanceBeforeBid: roundMoney(balanceBeforeBid),
    balanceAfterBid: roundMoney(balanceAfterBid),
    installmentAfterBid: remaining > 0 && balanceAfterBid > 0 ? roundMoney(balanceAfterBid / remaining + installments.insuranceMonthly) : 0,
    remainingMonthsAfterBid:
      installments.baseInstallment > 0 ? Math.ceil(Math.round((balanceAfterBid / installments.baseInstallment) * 1000) / 1000) : 0,
  };
}

export interface FinancingResult {
  principal: number;
  monthlyRatePercent: number;
  termMonths: number;
  installment: number;
  totalPaid: number;
  totalInterest: number;
}

/** Financiamento pela tabela Price, para comparar com o consórcio. */
export function simulateFinancing(principal: number, monthlyRatePercent: number, termMonths: number): FinancingResult {
  const n = Math.max(1, Math.round(termMonths));
  const i = Math.max(monthlyRatePercent, 0) / 100;
  const installment = i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
  const totalPaid = installment * n;
  return {
    principal: roundMoney(principal),
    monthlyRatePercent,
    termMonths: n,
    installment: roundMoney(installment),
    totalPaid: roundMoney(totalPaid),
    totalInterest: roundMoney(totalPaid - principal),
  };
}

// ------------------------------------------------------------
// Leitura de campos digitados e formatação
// ------------------------------------------------------------

/** "1,5" / "1.5" / "18%" / 18 -> número (percentual). Ponto e vírgula são sempre decimais. */
export function parsePercent(raw: string | number | null | undefined): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = raw.replace(/[%\s]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** "150, 180 e 200" -> [150, 180, 200] (sem repetir, em ordem). Null se houver prazo fora de 1 a 300. */
export function parseTerms(raw: string | number | null | undefined): number[] | null {
  if (raw == null) return null;
  const parts = String(raw).match(/\d+/g);
  if (!parts || parts.length === 0) return null;
  const values = parts.map(Number);
  if (values.some((value) => value < 1 || value > 300)) return null;
  return [...new Set(values)].sort((a, b) => a - b);
}

const brlCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** "R$ 1.234,56": valores de parcela e financeiro, com centavos. */
export const formatBRLCents = (value: number | null | undefined) => brlCents.format(Number(value) || 0).replace(/\s/g, " ");

/** "1,5%" / "0,038%". */
export const formatPercent = (value: number | null | undefined) => `${percentFormat.format(Number(value) || 0)}%`;

/** "1,5" para preencher um campo. */
export const percentToInput = (value: number | string | null | undefined) =>
  value == null || value === "" ? "" : percentFormat.format(Number(value));
