// Proposta de consórcio: o retrato salvo em consortium_proposals.payload, a leitura defensiva
// para a página pública e a mensagem pronta para o WhatsApp. Funções puras.

import type { BidResult, FinancingResult, InstallmentResult } from "./consortiumSimulator";

export const PROPOSAL_DISCLAIMER =
  "Valores estimados a partir das condições cadastradas pela corretora. As condições finais são as da administradora.";

export const PROPOSAL_LABELS = ["Plano A", "Plano B"] as const;

export interface ProposalBid {
  mode: "livre" | "fixo";
  embedded_percent: number;
  embedded_amount: number;
  own_amount: number;
  total_amount: number;
  total_percent: number;
  net_credit: number;
  contemplation_month: number;
  installment_after_bid: number;
  remaining_months_after_bid: number;
}

export interface ProposalPlan {
  label: string;
  administrator: string | null;
  plan_name: string;
  asset_type: string | null;
  credit: number;
  term_months: number;
  admin_fee_percent: number;
  reserve_fund_percent: number;
  insurance_monthly_percent: number;
  adjustment_index: string;
  reduced_installment_percent: number;
  full_installment: number;
  reduced_installment: number | null;
  admin_fee_amount: number;
  reserve_fund_amount: number;
  insurance_total: number;
  total_cost: number;
  total_paid: number;
  bid: ProposalBid | null;
}

export interface ProposalFinancing {
  monthly_rate_percent: number;
  term_months: number;
  installment: number;
  total_paid: number;
  total_interest: number;
}

export interface ProposalPayload {
  version: 1;
  organization: { name: string | null };
  seller: { name: string | null };
  client: { name: string | null };
  asset_type: string | null;
  credit: number;
  plans: ProposalPlan[];
  financing: ProposalFinancing | null;
  disclaimer: string;
  created_at?: string;
  expires_at?: string;
}

export interface ProposalPlanInput {
  administrator: string | null;
  planName: string;
  assetType: string | null;
  adjustmentIndex: string;
  conditions: {
    adminFeePercent: number;
    reserveFundPercent: number;
    insuranceMonthlyPercent: number;
    reducedInstallmentPercent: number;
  };
  installments: InstallmentResult;
  bid: BidResult | null;
}

const bidSnapshot = (bid: BidResult | null): ProposalBid | null =>
  bid && !bid.unavailable
    ? {
        mode: bid.mode,
        embedded_percent: bid.embeddedPercent,
        embedded_amount: bid.embeddedAmount,
        own_amount: bid.ownAmount,
        total_amount: bid.totalAmount,
        total_percent: bid.totalPercent,
        net_credit: bid.netCredit,
        contemplation_month: bid.contemplationMonth,
        installment_after_bid: bid.installmentAfterBid,
        remaining_months_after_bid: bid.remainingMonthsAfterBid,
      }
    : null;

/**
 * Monta o retrato da proposta (1 ou 2 planos). Nomes da organização, do vendedor e do cliente
 * e o aviso são preenchidos pelo banco na criação; aqui vão vazios.
 */
export function buildProposalPayload(input: {
  credit: number;
  assetType: string | null;
  plans: ProposalPlanInput[];
  financing: FinancingResult | null;
}): ProposalPayload {
  if (input.plans.length < 1 || input.plans.length > 2) {
    throw new Error("A proposta precisa de 1 ou 2 planos.");
  }
  return {
    version: 1,
    organization: { name: null },
    seller: { name: null },
    client: { name: null },
    asset_type: input.assetType,
    credit: input.credit,
    plans: input.plans.map((plan, index) => ({
      label: PROPOSAL_LABELS[index],
      administrator: plan.administrator,
      plan_name: plan.planName,
      asset_type: plan.assetType,
      credit: plan.installments.credit,
      term_months: plan.installments.termMonths,
      admin_fee_percent: plan.conditions.adminFeePercent,
      reserve_fund_percent: plan.conditions.reserveFundPercent,
      insurance_monthly_percent: plan.conditions.insuranceMonthlyPercent,
      adjustment_index: plan.adjustmentIndex,
      reduced_installment_percent: plan.conditions.reducedInstallmentPercent,
      full_installment: plan.installments.fullInstallment,
      reduced_installment: plan.installments.reducedInstallment,
      admin_fee_amount: plan.installments.adminFeeAmount,
      reserve_fund_amount: plan.installments.reserveFundAmount,
      insurance_total: plan.installments.insuranceTotal,
      total_cost: plan.installments.totalCost,
      total_paid: plan.installments.totalPaid,
      bid: bidSnapshot(plan.bid),
    })),
    financing: input.financing
      ? {
          monthly_rate_percent: input.financing.monthlyRatePercent,
          term_months: input.financing.termMonths,
          installment: input.financing.installment,
          total_paid: input.financing.totalPaid,
          total_interest: input.financing.totalInterest,
        }
      : null,
    disclaimer: PROPOSAL_DISCLAIMER,
  };
}

// ------------------------------------------------------------
// Leitura defensiva (página pública e lista do lead)
// ------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const nOrNull = (value: unknown) => (value == null ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const s = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

function parseBid(value: unknown): ProposalBid | null {
  if (!isObj(value)) return null;
  return {
    mode: value.mode === "fixo" ? "fixo" : "livre",
    embedded_percent: n(value.embedded_percent),
    embedded_amount: n(value.embedded_amount),
    own_amount: n(value.own_amount),
    total_amount: n(value.total_amount),
    total_percent: n(value.total_percent),
    net_credit: n(value.net_credit),
    contemplation_month: n(value.contemplation_month),
    installment_after_bid: n(value.installment_after_bid),
    remaining_months_after_bid: n(value.remaining_months_after_bid),
  };
}

function parsePlan(value: unknown, index: number): ProposalPlan | null {
  if (!isObj(value)) return null;
  return {
    label: s(value.label) ?? PROPOSAL_LABELS[index] ?? `Plano ${index + 1}`,
    administrator: s(value.administrator),
    plan_name: s(value.plan_name) ?? "Plano",
    asset_type: s(value.asset_type),
    credit: n(value.credit),
    term_months: n(value.term_months),
    admin_fee_percent: n(value.admin_fee_percent),
    reserve_fund_percent: n(value.reserve_fund_percent),
    insurance_monthly_percent: n(value.insurance_monthly_percent),
    adjustment_index: s(value.adjustment_index) ?? "nenhum",
    reduced_installment_percent: n(value.reduced_installment_percent),
    full_installment: n(value.full_installment),
    reduced_installment: nOrNull(value.reduced_installment),
    admin_fee_amount: n(value.admin_fee_amount),
    reserve_fund_amount: n(value.reserve_fund_amount),
    insurance_total: n(value.insurance_total),
    total_cost: n(value.total_cost),
    total_paid: n(value.total_paid),
    bid: parseBid(value.bid),
  };
}

/** Lê o JSON salvo; devolve null se não tiver ao menos um plano. */
export function parseProposalPayload(value: unknown): ProposalPayload | null {
  if (!isObj(value) || !Array.isArray(value.plans)) return null;
  const plans = value.plans.map(parsePlan).filter((plan): plan is ProposalPlan => plan !== null).slice(0, 2);
  if (plans.length === 0) return null;
  const name = (key: string) => (isObj(value[key]) ? s((value[key] as Obj).name) : null);
  const financing = isObj(value.financing)
    ? {
        monthly_rate_percent: n(value.financing.monthly_rate_percent),
        term_months: n(value.financing.term_months),
        installment: n(value.financing.installment),
        total_paid: n(value.financing.total_paid),
        total_interest: n(value.financing.total_interest),
      }
    : null;
  return {
    version: 1,
    organization: { name: name("organization") },
    seller: { name: name("seller") },
    client: { name: name("client") },
    asset_type: s(value.asset_type),
    credit: n(value.credit),
    plans,
    financing,
    disclaimer: s(value.disclaimer) ?? PROPOSAL_DISCLAIMER,
    created_at: s(value.created_at) ?? undefined,
    expires_at: s(value.expires_at) ?? undefined,
  };
}

/** Rótulo curto dos planos de uma proposta: "Embracon Imóvel · Porto Casa". */
export function proposalPlansSummary(payload: ProposalPayload | null): string {
  if (!payload) return "";
  return payload.plans
    .map((plan) => [plan.administrator, plan.plan_name].filter(Boolean).join(" "))
    .join(" · ");
}

export const proposalUrl = (origin: string, token: string) => `${origin.replace(/\/$/, "")}/proposta/${token}`;

/** Mensagem pronta para colar no WhatsApp do lead. */
export function proposalWhatsAppMessage(clientName: string | null | undefined, url: string, planCount: number): string {
  const firstName = (clientName ?? "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Olá, ${firstName}!` : "Olá!";
  const options = planCount > 1 ? `com ${planCount} opções de plano` : "com o plano que conversamos";
  return [
    `${greeting} Preparei a sua proposta de consórcio ${options}.`,
    `Veja parcelas, custo total e lance neste link: ${url}`,
    "Os valores são estimados e as condições finais são as da administradora. Qualquer dúvida, é só me chamar.",
  ].join("\n\n");
}
