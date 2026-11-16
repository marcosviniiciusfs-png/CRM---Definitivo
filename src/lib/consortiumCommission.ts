// Comissões de consórcio (Fase 4 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md).
// Funções puras, espelho do que o banco faz em supabase/migrations/20261116210000_consortium_commissions.sql:
// casar a regra, gerar o cronograma, escolher a faixa do vendedor e calcular o estorno.
// As telas usam as mesmas funções para validar regras, montar a previsão e conciliar o extrato.

export type CommissionStatus = "prevista" | "recebida" | "paga_vendedor" | "cancelada" | "estorno";

export interface ChargebackTier {
  until_installment: number;
  percent: number;
}

export interface SellerTier {
  min_monthly_production: number;
  share_percent: number;
}

export interface CommissionRuleLike {
  id?: string;
  administrator_id: string | null;
  asset_type: string | null;
  commission_percent: number;
  installment_percents: number[];
  chargeback: ChargebackTier[];
  seller_share_percent: number;
  seller_tiers: SellerTier[] | null;
  is_active: boolean;
}

export const COMMISSION_STATUS: Record<CommissionStatus, { label: string; tone: string }> = {
  prevista: { label: "Prevista", tone: "bg-secondary text-muted-foreground" },
  recebida: { label: "Recebida", tone: "bg-info-tint text-info" },
  paga_vendedor: { label: "Paga ao vendedor", tone: "bg-success-tint text-success" },
  cancelada: { label: "Cancelada", tone: "bg-secondary text-muted-foreground line-through" },
  estorno: { label: "Estorno", tone: "bg-destructive-tint text-destructive" },
};

export const isCommissionStatus = (value: unknown): value is CommissionStatus =>
  typeof value === "string" && value in COMMISSION_STATUS;

const RECEIVED: CommissionStatus[] = ["recebida", "paga_vendedor"];
export const isReceived = (status: string) => (RECEIVED as string[]).includes(status);
export const canMarkReceived = (status: string) => status === "prevista";
export const canMarkPaid = (status: string) => status === "prevista" || status === "recebida";

// ------------------------------------------------------------
// Números
// ------------------------------------------------------------

/** Arredonda para centavos como o numeric do Postgres (meio para longe do zero). */
export function roundCents(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-7)) / 100;
}

/** "1,5" ou "1.5" ou "1,5%" -> 1.5. Devolve null se não for número >= 0. */
export function parsePercentInput(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw >= 0 ? raw : null;
  const cleaned = raw.replace(/[%\s]/g, "").replace(",", ".");
  if (!cleaned || !/^\d*\.?\d*$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

const percentFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
export const formatPercent = (value: number | null | undefined) => `${percentFormat.format(Number(value) || 0)}%`;

const brlCents = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
/** "R$ 1.250,00": financeiro mostra centavos (DESIGN.md). */
export const formatMoneyCents = (value: number | null | undefined) =>
  brlCents.format(Number(value) || 0).replace(/\s/g, " ");

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// ------------------------------------------------------------
// Meses (AAAA-MM-01)
// ------------------------------------------------------------
export const monthOf = (isoDate: string) => `${isoDate.slice(0, 7)}-01`;

export function addMonths(month: string, count: number): string {
  const [year, mon] = month.split("-").map(Number);
  const index = year * 12 + (mon - 1) + count;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function formatMonth(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return `${MONTHS[mon - 1]}/${year}`;
}

export function monthRange(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = monthOf(from); month <= monthOf(to) && months.length < 240; month = addMonths(month, 1)) {
    months.push(month);
  }
  return months;
}

// ------------------------------------------------------------
// Regras
// ------------------------------------------------------------

/** Pontuação de especificidade: administradora+bem (3) > administradora (2) > bem (1) > padrão (0). */
export const ruleSpecificity = (rule: Pick<CommissionRuleLike, "administrator_id" | "asset_type">) =>
  (rule.administrator_id ? 2 : 0) + (rule.asset_type ? 1 : 0);

/** Regra que vale para a cota: a ativa mais específica que casa. */
export function matchRule<R extends CommissionRuleLike>(
  rules: R[],
  sale: { administrator_id: string | null; asset_type: string | null },
): R | null {
  let best: R | null = null;
  for (const rule of rules) {
    if (!rule.is_active) continue;
    if (rule.administrator_id && rule.administrator_id !== sale.administrator_id) continue;
    if (rule.asset_type && rule.asset_type !== sale.asset_type) continue;
    if (!best || ruleSpecificity(rule) > ruleSpecificity(best)) best = rule;
  }
  return best;
}

/** Percentual devolvido se a cota cancela na parcela k: a primeira faixa (menor N) com k <= N. */
export function chargebackPercent(table: ChargebackTier[] | null | undefined, cancelAtInstallment: number | null | undefined): number {
  const k = cancelAtInstallment ?? 1;
  const tier = [...(table ?? [])]
    .sort((a, b) => a.until_installment - b.until_installment)
    .find((entry) => k <= entry.until_installment);
  return tier ? tier.percent : 0;
}

/** Parte do vendedor pela produção do mês: maior faixa com mínimo <= produção; sem faixa, a base. */
export function sellerSharePercent(
  rule: Pick<CommissionRuleLike, "seller_share_percent" | "seller_tiers">,
  monthlyProduction: number,
): number {
  const tier = [...(rule.seller_tiers ?? [])]
    .sort((a, b) => b.min_monthly_production - a.min_monthly_production)
    .find((entry) => entry.min_monthly_production <= monthlyProduction);
  return tier ? tier.share_percent : rule.seller_share_percent;
}

export interface ScheduleRow {
  n: number;
  due_month: string;
  amount: number;
}

/**
 * Cronograma da comissão: uma parcela por mês com percentual > 0, a 1ª no mês em que a venda conta.
 * A última parcela absorve o arredondamento para o total fechar com crédito × comissão.
 */
export function buildSchedule(
  creditAmount: number,
  rule: Pick<CommissionRuleLike, "commission_percent" | "installment_percents">,
  countDate: string,
): ScheduleRow[] {
  const month = monthOf(countDate);
  const total = roundCents((creditAmount * rule.commission_percent) / 100);
  const percents = rule.installment_percents;
  const last = percents.reduce((acc, value, index) => (value > 0 ? index : acc), -1);
  const rows: ScheduleRow[] = [];
  let accumulated = 0;
  percents.forEach((percent, index) => {
    if (!(percent > 0)) return;
    const amount = index === last
      ? Math.max(roundCents(total - accumulated), 0)
      : roundCents((creditAmount * percent) / 100);
    accumulated = roundCents(accumulated + amount);
    rows.push({ n: index + 1, due_month: addMonths(month, index), amount });
  });
  return rows;
}

/** Parte do vendedor numa parcela. */
export const sellerAmount = (amount: number, sharePercent: number) => roundCents((amount * sharePercent) / 100);

/** Estorno sobre o que já foi recebido (valores negativos; zero se não há o que devolver). */
export function computeChargeback(
  installments: Array<{ n: number; status: string; amount: number; seller_amount: number }>,
  table: ChargebackTier[] | null | undefined,
  cancelAtInstallment: number | null | undefined,
): { amount: number; seller_amount: number; percent: number } {
  const percent = chargebackPercent(table, cancelAtInstallment);
  const received = installments.filter((row) => row.n > 0 && isReceived(row.status));
  const amount = roundCents((sum(received.map((row) => Number(row.amount))) * percent) / 100);
  const seller = roundCents((sum(received.map((row) => Number(row.seller_amount))) * percent) / 100);
  return { amount: amount > 0 ? -amount : 0, seller_amount: amount > 0 ? -seller : 0, percent };
}

/** Parcelas que cancelam quando a cota cancela na parcela k: as previstas com n >= k. */
export function installmentsToCancel<T extends { n: number; status: string }>(rows: T[], cancelAtInstallment: number | null | undefined): T[] {
  const k = cancelAtInstallment ?? 1;
  return rows.filter((row) => row.n > 0 && row.n >= k && row.status === "prevista");
}

// ------------------------------------------------------------
// Validação da regra (mesmas regras do gatilho no banco)
// ------------------------------------------------------------
export function validateCommissionRule(rule: Pick<CommissionRuleLike,
  "commission_percent" | "installment_percents" | "chargeback" | "seller_share_percent" | "seller_tiers">): string[] {
  const errors: string[] = [];
  if (!(rule.commission_percent > 0) || rule.commission_percent > 100) {
    errors.push("Informe a comissão total entre 0 e 100%.");
  }
  const count = rule.installment_percents.length;
  if (count < 1 || count > 60) errors.push("A comissão é paga em 1 a 60 parcelas.");
  if (rule.installment_percents.some((value) => !Number.isFinite(value) || value < 0)) {
    errors.push("Preencha o percentual de cada parcela com 0 ou mais.");
  } else if (count > 0 && Math.abs(sum(rule.installment_percents) - rule.commission_percent) > 0.001) {
    errors.push(`A soma das parcelas (${formatPercent(roundPercent(sum(rule.installment_percents)))}) precisa ser igual à comissão total (${formatPercent(rule.commission_percent)}).`);
  }
  const untils = rule.chargeback.map((entry) => entry.until_installment);
  if (rule.chargeback.some((entry) => !Number.isInteger(entry.until_installment) || entry.until_installment < 1 || entry.until_installment > 300)) {
    errors.push("No estorno, a parcela vai de 1 a 300.");
  }
  if (rule.chargeback.some((entry) => !(entry.percent >= 0) || entry.percent > 100)) {
    errors.push("No estorno, o percentual vai de 0 a 100.");
  }
  if (new Set(untils).size !== untils.length) errors.push("Há duas faixas de estorno com a mesma parcela.");
  if (!(rule.seller_share_percent >= 0) || rule.seller_share_percent > 100) {
    errors.push("A parte do vendedor vai de 0 a 100%.");
  }
  const tiers = rule.seller_tiers ?? [];
  if (tiers.some((tier) => !(tier.min_monthly_production >= 0) || !(tier.share_percent >= 0) || tier.share_percent > 100)) {
    errors.push("Nas faixas do vendedor, a produção é 0 ou mais e o percentual vai de 0 a 100.");
  }
  const mins = tiers.map((tier) => tier.min_monthly_production);
  if (new Set(mins).size !== mins.length) errors.push("Há duas faixas do vendedor com a mesma produção mínima.");
  return errors;
}

const roundPercent = (value: number) => Math.round(value * 10000) / 10000;

/** Divide o total em n parcelas iguais; a última fica com a sobra do arredondamento. */
export function splitEvenly(total: number, count: number): number[] {
  if (count < 1) return [];
  const each = Math.floor((total / count) * 10000) / 10000;
  const values = Array.from({ length: count }, () => each);
  values[count - 1] = roundPercent(total - each * (count - 1));
  return values;
}

/** Lê o JSON do banco em faixas tipadas, ignorando o que não for número. */
export function parseChargeback(value: unknown): ChargebackTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({ until_installment: Number(entry?.until_installment), percent: Number(entry?.percent) }))
    .filter((entry) => Number.isFinite(entry.until_installment) && Number.isFinite(entry.percent))
    .sort((a, b) => a.until_installment - b.until_installment);
}

export function parseSellerTiers(value: unknown): SellerTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => ({ min_monthly_production: Number(entry?.min_monthly_production), share_percent: Number(entry?.share_percent) }))
    .filter((entry) => Number.isFinite(entry.min_monthly_production) && Number.isFinite(entry.share_percent))
    .sort((a, b) => a.min_monthly_production - b.min_monthly_production);
}

// ------------------------------------------------------------
// Previsão mês a mês
// ------------------------------------------------------------
export interface ForecastRowInput {
  due_month: string;
  status: string;
  amount: number;
  seller_amount: number;
}

export interface ForecastMonth {
  month: string;
  /** Previsto e ainda não recebido das administradoras. */
  toReceive: number;
  /** Já recebido das administradoras (recebida ou paga ao vendedor). */
  received: number;
  /** Parte dos vendedores ainda não paga (prevista ou recebida). */
  toPaySellers: number;
  /** Parte dos vendedores já paga. */
  paidSellers: number;
  /** Estornos da corretora (negativo). */
  chargebacks: number;
  /** Estornos da parte dos vendedores (negativo). */
  sellerChargebacks: number;
}

const emptyMonth = (month: string): ForecastMonth => ({
  month, toReceive: 0, received: 0, toPaySellers: 0, paidSellers: 0, chargebacks: 0, sellerChargebacks: 0,
});

/** Soma as parcelas por mês de vencimento. Meses sem parcela entram zerados quando estão em `months`. */
export function buildForecast(rows: ForecastRowInput[], months: string[] = []): ForecastMonth[] {
  const byMonth = new Map<string, ForecastMonth>(months.map((month) => [month, emptyMonth(month)]));
  for (const row of rows) {
    const month = monthOf(row.due_month);
    if (months.length > 0 && !byMonth.has(month)) continue;
    const entry = byMonth.get(month) ?? emptyMonth(month);
    const amount = Number(row.amount) || 0;
    const seller = Number(row.seller_amount) || 0;
    switch (row.status) {
      case "prevista":
        entry.toReceive += amount;
        entry.toPaySellers += seller;
        break;
      case "recebida":
        entry.received += amount;
        entry.toPaySellers += seller;
        break;
      case "paga_vendedor":
        entry.received += amount;
        entry.paidSellers += seller;
        break;
      case "estorno":
        entry.chargebacks += amount;
        entry.sellerChargebacks += seller;
        break;
      default:
        break;
    }
    byMonth.set(month, entry);
  }
  return [...byMonth.values()]
    .map((entry) => ({
      ...entry,
      toReceive: roundCents(entry.toReceive),
      received: roundCents(entry.received),
      toPaySellers: roundCents(entry.toPaySellers),
      paidSellers: roundCents(entry.paidSellers),
      chargebacks: roundCents(entry.chargebacks),
      sellerChargebacks: roundCents(entry.sellerChargebacks),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

// ------------------------------------------------------------
// Extrato da administradora
// ------------------------------------------------------------

/** Chave de comparação: só letras e números, maiúsculas, sem zeros à esquerda. */
export function normalizeKey(value: unknown): string {
  const text = String(value ?? "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (!text) return "";
  return text.replace(/^0+(?=.)/, "");
}

/** "3", "03", "3/6", "Parcela 3" -> 3. */
export function parseInstallmentNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 1 && value <= 300 ? value : null;
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return n >= 1 && n <= 300 ? n : null;
}

/** Valor do extrato: número da planilha ou texto "R$ 1.234,56" / "1234.56". */
export function parseStatementValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? roundCents(value) : null;
  const text = String(value ?? "").replace(/[R$\s]/g, "");
  if (!text) return null;
  const negative = text.startsWith("-") || /^\(.*\)$/.test(text);
  const digits = text.replace(/[-()]/g, "");
  const normalized = digits.includes(",")
    ? digits.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(digits) ? digits.replace(/\./g, "") : digits;
  const number = Number(normalized);
  if (!Number.isFinite(number)) return null;
  return roundCents(negative ? -number : number);
}

export type StatementColumn = "contract" | "group" | "quota" | "installment" | "value";

export const STATEMENT_COLUMNS: Array<{ key: StatementColumn; label: string; hints: string[] }> = [
  { key: "contract", label: "Contrato ou proposta", hints: ["contrato", "proposta"] },
  { key: "group", label: "Grupo", hints: ["grupo"] },
  { key: "quota", label: "Cota", hints: ["cota"] },
  { key: "installment", label: "Nº da parcela", hints: ["parcela", "parc"] },
  { key: "value", label: "Valor", hints: ["valor", "comissao", "comissão", "credito pago"] },
];

/** Sugere a coluna da planilha para cada campo pelo nome do cabeçalho. */
export function guessStatementColumns(headers: string[]): Partial<Record<StatementColumn, number>> {
  const normalized = headers.map((header) =>
    String(header ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim());
  const used = new Set<number>();
  const result: Partial<Record<StatementColumn, number>> = {};
  for (const column of STATEMENT_COLUMNS) {
    const hints = column.hints.map((hint) => hint.normalize("NFD").replace(/[̀-ͯ]/g, ""));
    const index = normalized.findIndex((header, i) => !used.has(i) && hints.some((hint) => header.includes(hint)));
    if (index >= 0) {
      result[column.key] = index;
      used.add(index);
    }
  }
  return result;
}

export interface StatementSale {
  id: string;
  contract_number: string | null;
  group_code: string | null;
  quota_number: string | null;
  label?: string;
}

export interface StatementInstallment {
  id: string;
  sale_id: string;
  n: number;
  status: string;
  amount: number;
}

export type StatementMatchStatus =
  | "ok"
  | "ja_recebida"
  | "cancelada"
  | "sem_cota"
  | "cota_repetida"
  | "sem_parcela"
  | "parcela_invalida"
  | "linha_repetida";

export const STATEMENT_MATCH_LABEL: Record<StatementMatchStatus, string> = {
  ok: "Encontrada",
  ja_recebida: "Já recebida",
  cancelada: "Parcela cancelada",
  sem_cota: "Cota não encontrada",
  cota_repetida: "Mais de uma cota com este número",
  sem_parcela: "Parcela não encontrada",
  parcela_invalida: "Nº da parcela inválido",
  linha_repetida: "Linha repetida no arquivo",
};

export interface StatementMatch {
  row: number;
  reference: string;
  n: number | null;
  value: number | null;
  status: StatementMatchStatus;
  saleId?: string;
  installmentId?: string;
  expected?: number;
  /** Valor do extrato diferente do previsto (mais de 1 centavo). */
  valueDiffers?: boolean;
}

/**
 * Casa as linhas do extrato com as parcelas: pelo contrato e, se não achar, por grupo + cota.
 * Só parcelas 'prevista' entram como "ok" (serão marcadas como recebidas).
 */
export function matchStatement(
  rows: unknown[][],
  columns: Partial<Record<StatementColumn, number>>,
  sales: StatementSale[],
  installments: StatementInstallment[],
): StatementMatch[] {
  const byContract = new Map<string, StatementSale[]>();
  const byGroupQuota = new Map<string, StatementSale[]>();
  for (const sale of sales) {
    const contract = normalizeKey(sale.contract_number);
    if (contract) byContract.set(contract, [...(byContract.get(contract) ?? []), sale]);
    const group = normalizeKey(sale.group_code);
    const quota = normalizeKey(sale.quota_number);
    if (group && quota) {
      const key = `${group}|${quota}`;
      byGroupQuota.set(key, [...(byGroupQuota.get(key) ?? []), sale]);
    }
  }
  const installmentByKey = new Map(installments.filter((row) => row.n > 0).map((row) => [`${row.sale_id}|${row.n}`, row]));
  const seen = new Set<string>();
  const cell = (row: unknown[], column: StatementColumn) => {
    const index = columns[column];
    return index === undefined ? undefined : row[index];
  };

  const results: StatementMatch[] = [];
  rows.forEach((row, index) => {
    const contract = normalizeKey(cell(row, "contract"));
    const group = normalizeKey(cell(row, "group"));
    const quota = normalizeKey(cell(row, "quota"));
    if (!contract && !(group && quota)) return; // linha vazia, total ou cabeçalho repetido
    const reference = contract
      ? String(cell(row, "contract") ?? "").trim()
      : `Grupo ${String(cell(row, "group") ?? "").trim()} · cota ${String(cell(row, "quota") ?? "").trim()}`;
    const n = parseInstallmentNumber(cell(row, "installment"));
    const value = columns.value === undefined ? null : parseStatementValue(cell(row, "value"));
    const base = { row: index, reference, n, value };

    let candidates = contract ? byContract.get(contract) ?? [] : [];
    if (candidates.length === 0 && group && quota) candidates = byGroupQuota.get(`${group}|${quota}`) ?? [];
    if (candidates.length === 0) return void results.push({ ...base, status: "sem_cota" });
    if (candidates.length > 1) return void results.push({ ...base, status: "cota_repetida" });
    const sale = candidates[0];
    if (n === null) return void results.push({ ...base, status: "parcela_invalida", saleId: sale.id });

    const installment = installmentByKey.get(`${sale.id}|${n}`);
    if (!installment) return void results.push({ ...base, status: "sem_parcela", saleId: sale.id });

    const expected = Number(installment.amount);
    const extra = {
      saleId: sale.id,
      installmentId: installment.id,
      expected,
      valueDiffers: value !== null && Math.abs(Math.abs(value) - expected) > 0.01,
    };
    if (seen.has(installment.id)) return void results.push({ ...base, ...extra, status: "linha_repetida" });
    seen.add(installment.id);
    if (installment.status === "prevista") return void results.push({ ...base, ...extra, status: "ok" });
    if (isReceived(installment.status)) return void results.push({ ...base, ...extra, status: "ja_recebida" });
    results.push({ ...base, ...extra, status: "cancelada" });
  });
  return results;
}
