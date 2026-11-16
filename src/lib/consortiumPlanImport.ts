// Importação de planos de consórcio por planilha (CSV ou XLSX). Funções puras: a tela lê o
// arquivo, transforma em linhas (cabeçalho -> valor) e usa parsePlanRows para validar.

import { parseMoneyInput, type AssetType } from "./consortium";
import { isAdjustmentIndex, parsePercent, parseTerms, type AdjustmentIndex } from "./consortiumSimulator";

export interface PlanDraft {
  administrator: string;
  name: string;
  asset_type: AssetType;
  credit_min: number;
  credit_max: number;
  terms: number[];
  admin_fee_percent: number;
  reserve_fund_percent: number;
  insurance_monthly_percent: number;
  adjustment_index: AdjustmentIndex;
  reduced_installment_percent: number;
  max_embedded_bid_percent: number;
  fixed_bid_percent: number | null;
  notes: string | null;
}

export interface PlanRowError {
  /** Linha da planilha (o cabeçalho é a linha 1). */
  line: number;
  message: string;
}

type Field = keyof PlanDraft;

/** Cabeçalhos aceitos (sem acento, minúsculos, só letras e números). */
const HEADERS: Record<string, Field> = {
  administradora: "administrator",
  plano: "name",
  nome: "name",
  nomedoplano: "name",
  tipodebem: "asset_type",
  bem: "asset_type",
  tipo: "asset_type",
  creditominimo: "credit_min",
  creditomin: "credit_min",
  creditomaximo: "credit_max",
  creditomax: "credit_max",
  prazos: "terms",
  prazo: "terms",
  prazosmeses: "terms",
  taxadeadministracao: "admin_fee_percent",
  taxaadm: "admin_fee_percent",
  taxa: "admin_fee_percent",
  fundodereserva: "reserve_fund_percent",
  fundo: "reserve_fund_percent",
  seguro: "insurance_monthly_percent",
  seguroaomes: "insurance_monthly_percent",
  indicedereajuste: "adjustment_index",
  reajuste: "adjustment_index",
  indice: "adjustment_index",
  redutor: "reduced_installment_percent",
  redutordeparcela: "reduced_installment_percent",
  lanceembutidomax: "max_embedded_bid_percent",
  lanceembutidomaximo: "max_embedded_bid_percent",
  lanceembutido: "max_embedded_bid_percent",
  lancefixo: "fixed_bid_percent",
  observacoes: "notes",
  observacao: "notes",
  notas: "notes",
};

export const normalizeKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Cabeçalho do modelo para download. */
export const PLAN_TEMPLATE_HEADERS = [
  "Administradora",
  "Plano",
  "Tipo de bem",
  "Crédito mínimo",
  "Crédito máximo",
  "Prazos",
  "Taxa de administração (%)",
  "Fundo de reserva (%)",
  "Seguro (% ao mês)",
  "Índice de reajuste",
  "Redutor (%)",
  "Lance embutido máx. (%)",
  "Lance fixo (%)",
  "Observações",
];

export const PLAN_TEMPLATE_EXAMPLE = [
  "Embracon",
  "Imóvel 200",
  "Imóvel",
  "100000",
  "500000",
  "150 180 200",
  "18",
  "2",
  "0,038",
  "INCC",
  "30",
  "30",
  "",
  "Exemplo: apague esta linha",
];

/** Modelo em CSV com ponto e vírgula (abre direto no Excel em português). */
export function planTemplateCsv(): string {
  const escape = (cell: string) => (/[;"\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
  return [PLAN_TEMPLATE_HEADERS, PLAN_TEMPLATE_EXAMPLE].map((row) => row.map(escape).join(";")).join("\r\n");
}

/** Lê um CSV (vírgula ou ponto e vírgula, aspas opcionais) em linhas cabeçalho -> valor. */
export function parseDelimited(text: string): Array<Record<string, string>> {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (quoted) {
      if (char === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((cells) => cells.some((value) => value.trim() !== ""))
    .map((cells) => Object.fromEntries(header.map((key, index) => [key.trim(), (cells[index] ?? "").trim()])));
}

const ASSET_ALIASES: Record<string, AssetType> = {
  imovel: "imovel",
  imoveis: "imovel",
  casa: "imovel",
  veiculo: "veiculo",
  veiculos: "veiculo",
  carro: "veiculo",
  auto: "veiculo",
  automovel: "veiculo",
  moto: "moto",
  motos: "moto",
  pesados: "pesados",
  pesado: "pesados",
  caminhao: "pesados",
  servicos: "servicos",
  servico: "servicos",
};

const parseAsset = (raw: string): AssetType | null => ASSET_ALIASES[normalizeKey(raw)] ?? null;

function parseIndex(raw: string): AdjustmentIndex | null {
  const key = normalizeKey(raw);
  if (!key || key === "nenhum" || key === "sem" || key === "semreajuste" || key === "nao") return "nenhum";
  if (key === "igpm") return "IGP-M";
  const upper = key.toUpperCase();
  return isAdjustmentIndex(upper) ? upper : null;
}

const text = (value: unknown) => (value == null ? "" : String(value).trim());

function money(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  return parseMoneyInput(text(value));
}

function percent(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parsePercent(text(value));
}

/**
 * Valida as linhas da planilha. Cada linha vira um plano ou um erro com o número da linha
 * (cabeçalho = linha 1) e o que corrigir.
 */
export function parsePlanRows(rows: Array<Record<string, unknown>>): { plans: PlanDraft[]; errors: PlanRowError[] } {
  const plans: PlanDraft[] = [];
  const errors: PlanRowError[] = [];

  rows.forEach((source, index) => {
    const line = index + 2;
    const row: Partial<Record<Field, unknown>> = {};
    for (const [key, value] of Object.entries(source)) {
      const field = HEADERS[normalizeKey(key)];
      if (field && row[field] === undefined) row[field] = value;
    }

    const fail = (message: string) => errors.push({ line, message });
    const administrator = text(row.administrator);
    const name = text(row.name);
    if (!administrator) return fail("Preencha a administradora.");
    if (!name) return fail("Preencha o nome do plano.");
    if (administrator.length > 80 || name.length > 80) return fail("Use até 80 caracteres na administradora e no plano.");

    const assetType = parseAsset(text(row.asset_type));
    if (!assetType) return fail("Use um destes tipos de bem: Imóvel, Veículo, Moto, Pesados ou Serviços.");

    const creditMin = money(row.credit_min);
    const creditMax = money(row.credit_max);
    if (!creditMin || !creditMax) return fail("Preencha o crédito mínimo e o máximo, como 100000.");
    if (creditMax < creditMin) return fail("O crédito máximo precisa ser maior ou igual ao mínimo.");

    const terms = parseTerms(text(row.terms));
    if (!terms) return fail("Preencha os prazos em meses, de 1 a 300, como 150 180 200.");

    const adminFee = percent(row.admin_fee_percent);
    if (adminFee == null || adminFee < 0 || adminFee > 100) return fail("Preencha a taxa de administração em %, como 18.");

    const reserve = text(row.reserve_fund_percent) ? percent(row.reserve_fund_percent) : 0;
    if (reserve == null || reserve < 0 || reserve > 100) return fail("O fundo de reserva vai de 0 a 100%.");

    const insurance = text(row.insurance_monthly_percent) ? percent(row.insurance_monthly_percent) : 0;
    if (insurance == null || insurance < 0 || insurance > 5) return fail("O seguro vai de 0 a 5% ao mês, como 0,038.");

    const adjustment = parseIndex(text(row.adjustment_index));
    if (!adjustment) return fail("Use um destes índices: INCC, IPCA, INPC, IGP-M ou deixe vazio.");

    const reduced = text(row.reduced_installment_percent) ? percent(row.reduced_installment_percent) : 0;
    if (reduced == null || reduced < 0 || reduced > 60) return fail("O redutor vai de 0 a 60%.");

    const embedded = text(row.max_embedded_bid_percent) ? percent(row.max_embedded_bid_percent) : 0;
    if (embedded == null || embedded < 0 || embedded > 100) return fail("O lance embutido vai de 0 a 100%.");

    const fixed = text(row.fixed_bid_percent) ? percent(row.fixed_bid_percent) : null;
    if (fixed != null && (fixed <= 0 || fixed > 100)) return fail("O lance fixo vai de 0 a 100% ou fica vazio.");

    const notes = text(row.notes).slice(0, 500) || null;

    plans.push({
      administrator,
      name,
      asset_type: assetType,
      credit_min: creditMin,
      credit_max: creditMax,
      terms,
      admin_fee_percent: adminFee,
      reserve_fund_percent: reserve,
      insurance_monthly_percent: insurance,
      adjustment_index: adjustment,
      reduced_installment_percent: reduced,
      max_embedded_bid_percent: embedded,
      fixed_bid_percent: fixed,
      notes,
    });
  });

  return { plans, errors };
}
