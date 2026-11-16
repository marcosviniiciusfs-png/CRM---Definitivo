export type OrganizationSegment = "generico" | "consorcio";

export interface SegmentTerms {
  /** Rótulo curto do valor do lead: "Valor" / "Crédito". */
  value: string;
  /** Título do bloco de valor no detalhe do lead. */
  dealValue: string;
  /** Uma venda. */
  sale: string;
  /** Várias vendas. */
  sales: string;
  /** Soma do valor ganho no período. */
  revenue: string;
  /** Valor médio por venda. */
  averageSale: string;
  /** Complemento do total no cabeçalho do funil ("R$ 247 mil no funil"). */
  pipelineTotalSuffix: string;
}

const TERMS: Record<OrganizationSegment, SegmentTerms> = {
  generico: {
    value: "Valor",
    dealValue: "Valor do negócio",
    sale: "venda",
    sales: "Vendas",
    revenue: "Receita ganha",
    averageSale: "Ticket médio",
    pipelineTotalSuffix: "no funil",
  },
  consorcio: {
    value: "Crédito",
    dealValue: "Crédito da carta",
    sale: "cota vendida",
    sales: "Cotas vendidas",
    revenue: "Produção",
    averageSale: "Crédito médio",
    pipelineTotalSuffix: "em crédito no funil",
  },
};

export const getSegmentTerms = (segment: OrganizationSegment): SegmentTerms => TERMS[segment] ?? TERMS.generico;

export const isOrganizationSegment = (value: unknown): value is OrganizationSegment =>
  value === "generico" || value === "consorcio";
