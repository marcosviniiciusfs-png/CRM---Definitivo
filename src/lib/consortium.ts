// Regras e rótulos do modo consórcio (Fase 1 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md).
// Funções puras: as telas e os testes usam as mesmas regras do banco (consortium_sales_summary).

export type AssetType = "imovel" | "veiculo" | "moto" | "pesados" | "servicos";
export type PurchaseTimeframe = "imediato" | "ate_3_meses" | "ate_6_meses" | "ate_12_meses" | "sem_pressa";
export type ConsortiumSaleStatus = "aguardando_primeira_parcela" | "ativa" | "cancelada";
export type SaleCountsOn = "adesao" | "primeira_parcela";

export const ASSET_TYPES: Array<{ value: AssetType; label: string }> = [
  { value: "imovel", label: "Imóvel" },
  { value: "veiculo", label: "Veículo" },
  { value: "moto", label: "Moto" },
  { value: "pesados", label: "Pesados" },
  { value: "servicos", label: "Serviços" },
];

export const PURCHASE_TIMEFRAMES: Array<{ value: PurchaseTimeframe; label: string }> = [
  { value: "imediato", label: "Agora" },
  { value: "ate_3_meses", label: "Em até 3 meses" },
  { value: "ate_6_meses", label: "Em até 6 meses" },
  { value: "ate_12_meses", label: "Em até 1 ano" },
  { value: "sem_pressa", label: "Sem pressa" },
];

export const SALE_STATUS: Record<ConsortiumSaleStatus, { label: string; tone: "warning" | "success" | "muted" }> = {
  aguardando_primeira_parcela: { label: "Aguardando 1ª parcela", tone: "warning" },
  ativa: { label: "Ativa", tone: "success" },
  cancelada: { label: "Cancelada", tone: "muted" },
};

export const SALE_RULES: Array<{ value: SaleCountsOn; title: string; description: string }> = [
  {
    value: "adesao",
    title: "Na adesão",
    description: "A cota conta na produção e no ranking assim que é registrada. Se for cancelada, sai da conta.",
  },
  {
    value: "primeira_parcela",
    title: "Depois da 1ª parcela paga",
    description: "A cota só conta quando alguém confirma o pagamento da 1ª parcela.",
  },
];

/** Administradoras comuns, oferecidas como atalho no cadastro. */
export const ADMINISTRATOR_SUGGESTIONS = [
  "Embracon",
  "Porto Seguro",
  "Rodobens",
  "Ademicon",
  "Itaú",
  "Bradesco",
  "Santander",
  "Caixa",
  "Banco do Brasil",
  "Servopa",
  "Canopus",
  "HS Consórcios",
  "Mycon",
];

export const assetTypeLabel = (value: string | null | undefined) =>
  ASSET_TYPES.find((option) => option.value === value)?.label ?? null;

export const timeframeLabel = (value: string | null | undefined) =>
  PURCHASE_TIMEFRAMES.find((option) => option.value === value)?.label ?? null;

export const isSaleStatus = (value: unknown): value is ConsortiumSaleStatus =>
  value === "aguardando_primeira_parcela" || value === "ativa" || value === "cancelada";

/** A cota entra na produção? Mesma regra de consortium_sales_summary. */
export function saleCounts(status: ConsortiumSaleStatus, rule: SaleCountsOn): boolean {
  if (status === "cancelada") return false;
  return rule === "adesao" ? true : status === "ativa";
}

/** Data que posiciona a cota no período, conforme a regra (AAAA-MM-DD). */
export function saleCountDate(
  sale: { status: ConsortiumSaleStatus; adhesion_date: string; first_installment_paid_on: string | null },
  rule: SaleCountsOn,
): string | null {
  if (!saleCounts(sale.status, rule)) return null;
  return rule === "adesao" ? sale.adhesion_date : sale.first_installment_paid_on;
}

/**
 * Converte o que a pessoa digitou ("R$ 250.000,00", "250000", "1.500,5") em número.
 * Devolve null se não for um valor positivo.
 */
export function parseMoneyInput(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[R$\s]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/\.(?=\d{3}(\D|$))/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Inteiro positivo dentro do limite (prazo em meses), ou null. */
export function parseMonths(raw: string | null | undefined, max = 300): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/\D/g, ""));
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
}

/** Máscara de digitação de moeda: "250000" -> "R$ 250.000", "1500,5" -> "R$ 1.500,5". */
export function maskMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  if (!cleaned) return "";
  const [integers, ...rest] = cleaned.split(",");
  const decimals = rest.join("").slice(0, 2);
  const grouped = (integers || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return cleaned.includes(",") ? `R$ ${grouped},${decimals}` : `R$ ${grouped}`;
}

/** Valor do banco para o campo mascarado ("250000.5" -> "R$ 250.000,50"). */
export function moneyToInput(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  const [integers, decimals] = n.toFixed(2).split(".");
  const grouped = integers.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals === "00" ? `R$ ${grouped}` : `R$ ${grouped},${decimals}`;
}

/** Hoje no horário de Brasília (AAAA-MM-DD). */
export function todayInBrazil(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
