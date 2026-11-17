// Regras puras do Painel de acompanhamento (sem Deno nem rede), usadas por panel-meta-insights
// e testadas em tests/panel-metrics.test.ts. Fórmulas trazidas do Painel do Hurtz CRM.

export interface MetaAction {
  action_type: string;
  value: string | number;
}

export interface MetaInsightRow {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  objective?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string | number;
  reach?: string | number;
  impressions?: string | number;
  inline_link_clicks?: string | number;
  actions?: MetaAction[];
}

export const ACTION = {
  conversation: "onsite_conversion.messaging_conversation_started_7d",
  realConversation: "onsite_conversion.messaging_user_depth_2_message_send",
  lead: "lead",
  leadGrouped: "onsite_conversion.lead_grouped",
  videoView: "video_view",
} as const;

// Campanhas de tráfego, alcance e reconhecimento não entram no custo por conversa.
export const NON_CONVERSATION_OBJECTIVES = new Set([
  "LINK_CLICKS",
  "REACH",
  "BRAND_AWARENESS",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
]);

const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function actionValue(actions: MetaAction[] | undefined, type: string): number {
  return (actions ?? []).reduce((sum, action) => (action.action_type === type ? sum + num(action.value) : sum), 0);
}

export function leadsFrom(actions: MetaAction[] | undefined): number {
  return actionValue(actions, ACTION.lead) || actionValue(actions, ACTION.leadGrouped);
}

export interface PeriodTotals {
  spend: number;
  reach: number;
  impressions: number;
  linkClicks: number;
  conversations: number;
  realConversations: number;
  leads: number;
  videoViews: number;
}

/** Soma linhas de nível conta (uma por conta de anúncio). Alcance somado entre contas é aproximado. */
export function sumTotals(rows: MetaInsightRow[]): PeriodTotals {
  return rows.reduce<PeriodTotals>(
    (totals, row) => ({
      spend: totals.spend + num(row.spend),
      reach: totals.reach + num(row.reach),
      impressions: totals.impressions + num(row.impressions),
      linkClicks: totals.linkClicks + num(row.inline_link_clicks),
      conversations: totals.conversations + actionValue(row.actions, ACTION.conversation),
      realConversations: totals.realConversations + actionValue(row.actions, ACTION.realConversation),
      leads: totals.leads + leadsFrom(row.actions),
      videoViews: totals.videoViews + actionValue(row.actions, ACTION.videoView),
    }),
    { spend: 0, reach: 0, impressions: 0, linkClicks: 0, conversations: 0, realConversations: 0, leads: 0, videoViews: 0 },
  );
}

export function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

/** Custo por conversa: gasto só das campanhas de conversa ÷ conversas. */
export function costPerConversation(campaignRows: MetaInsightRow[]): {
  principalSpend: number;
  conversations: number;
  cost: number | null;
} {
  let principalSpend = 0;
  let conversations = 0;
  for (const row of campaignRows) {
    conversations += actionValue(row.actions, ACTION.conversation);
    if (!NON_CONVERSATION_OBJECTIVES.has(String(row.objective ?? "").toUpperCase())) {
      principalSpend += num(row.spend);
    }
  }
  return { principalSpend, conversations, cost: ratio(principalSpend, conversations) };
}

/** Custo por lead: gasto só das campanhas que geraram leads ÷ leads (formulário). */
export function costPerLead(campaignRows: MetaInsightRow[]): { leadSpend: number; leads: number; cost: number | null } {
  let leadSpend = 0;
  let leads = 0;
  for (const row of campaignRows) {
    const found = leadsFrom(row.actions);
    if (found > 0) {
      leads += found;
      leadSpend += num(row.spend);
    }
  }
  return { leadSpend, leads, cost: ratio(leadSpend, leads) };
}

export interface Indicators {
  reach: number;
  impressions: number;
  linkClicks: number;
  videoViews: number;
  ctr: number | null;
  frequency: number | null;
  cpm: number | null;
}

export function indicatorsFrom(totals: PeriodTotals): Indicators {
  return {
    reach: totals.reach,
    impressions: totals.impressions,
    linkClicks: totals.linkClicks,
    videoViews: totals.videoViews,
    ctr: ratio(totals.linkClicks, totals.impressions),
    frequency: ratio(totals.impressions, totals.reach),
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
  };
}

export interface DailyPoint {
  date: string;
  spend: number;
  conversations: number;
  realConversations: number;
  leads: number;
  costPerConversation: number | null;
  costPerLead: number | null;
}

/** Linhas diárias (time_increment=1) de várias contas somadas por dia. */
export function buildDaily(rows: MetaInsightRow[]): DailyPoint[] {
  const byDay = new Map<string, DailyPoint>();
  for (const row of rows) {
    const date = row.date_start ?? "";
    if (!date) continue;
    const point = byDay.get(date) ?? { date, spend: 0, conversations: 0, realConversations: 0, leads: 0, costPerConversation: null, costPerLead: null };
    point.spend += num(row.spend);
    point.conversations += actionValue(row.actions, ACTION.conversation);
    point.realConversations += actionValue(row.actions, ACTION.realConversation);
    point.leads += leadsFrom(row.actions);
    byDay.set(date, point);
  }
  return [...byDay.values()]
    .map((point) => ({
      ...point,
      costPerConversation: ratio(point.spend, point.conversations),
      costPerLead: ratio(point.spend, point.leads),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type CreativeVerdict = "best" | "review" | null;

export interface CreativeRow {
  adId: string;
  name: string;
  campaignName: string;
  spend: number;
  conversations: number;
  realConversations: number;
  cost: number | null;
  continuedRate: number | null;
  verdict: CreativeVerdict;
  leads: number;
  costPerLead: number | null;
  leadVerdict: CreativeVerdict;
}

/**
 * "Melhor": ≥ 5 conversas, custo ≤ média e ≥ 50% continuaram a conversa.
 * "Revisar": custo > 1,25× a média, ou < 30% continuaram com ≥ 5 conversas.
 * Média = gasto ÷ conversas dos criativos que tiveram conversa.
 */
export function classifyCreatives(adRows: MetaInsightRow[]): CreativeRow[] {
  const rows = adRows.map((row) => {
    const spend = num(row.spend);
    const conversations = actionValue(row.actions, ACTION.conversation);
    const realConversations = actionValue(row.actions, ACTION.realConversation);
    return {
      adId: String(row.ad_id ?? ""),
      name: String(row.ad_name ?? "Anúncio sem nome"),
      campaignName: String(row.campaign_name ?? ""),
      spend,
      conversations,
      realConversations,
      cost: ratio(spend, conversations),
      continuedRate: ratio(realConversations, conversations),
      verdict: null as CreativeVerdict,
      leads: leadsFrom(row.actions),
      costPerLead: ratio(spend, leadsFrom(row.actions)),
      leadVerdict: null as CreativeVerdict,
    };
  });

  const withConversations = rows.filter((row) => row.conversations > 0);
  const average = ratio(
    withConversations.reduce((sum, row) => sum + row.spend, 0),
    withConversations.reduce((sum, row) => sum + row.conversations, 0),
  );

  for (const row of rows) {
    if (average === null || row.cost === null) continue;
    const continued = row.continuedRate ?? 0;
    if (row.conversations >= 5 && row.cost <= average && continued >= 0.5) row.verdict = "best";
    else if (row.cost > average * 1.25 || (row.conversations >= 5 && continued < 0.3)) row.verdict = "review";
  }

  // Negócio de formulário: mesma régua, em leads. Melhor: 5 leads ou mais e custo até a média; Revisar: custo 25% acima da média.
  const withLeads = rows.filter((row) => row.leads > 0);
  const leadAverage = ratio(
    withLeads.reduce((sum, row) => sum + row.spend, 0),
    withLeads.reduce((sum, row) => sum + row.leads, 0),
  );
  for (const row of rows) {
    if (leadAverage === null || row.costPerLead === null) continue;
    if (row.leads >= 5 && row.costPerLead <= leadAverage) row.leadVerdict = "best";
    else if (row.costPerLead > leadAverage * 1.25) row.leadVerdict = "review";
  }

  return rows
    .filter((row) => row.spend > 0 || row.conversations > 0 || row.leads > 0)
    .sort((a, b) => b.conversations - a.conversations || b.spend - a.spend);
}

/** Variação contra o período anterior. Abaixo de 0,5% conta como "igual" (0). Sem base, null. */
export function percentDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  const delta = (current - previous) / previous;
  return Math.abs(delta) < 0.005 ? 0 : delta;
}

const DAY_MS = 86_400_000;
const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);

/** Período anterior de mesmo tamanho, terminando no dia antes do início. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = toDate(from).getTime();
  const end = toDate(to).getTime();
  const length = Math.round((end - start) / DAY_MS) + 1;
  return { from: toIso(new Date(start - length * DAY_MS)), to: toIso(new Date(start - DAY_MS)) };
}

/** Cache: 5 min se o período chega a ontem ou hoje (Brasília); 1 h nos outros casos. */
export function cacheTtlMs(to: string, todayBrt: string): number {
  const yesterday = toIso(new Date(toDate(todayBrt).getTime() - DAY_MS));
  return to >= yesterday ? 5 * 60_000 : 60 * 60_000;
}

export function isValidIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toDate(value).getTime());
}

export function normalizeAdAccountId(value: string): string | null {
  const digits = String(value ?? "").trim().replace(/^act_/i, "");
  return /^\d{5,25}$/.test(digits) ? `act_${digits}` : null;
}

// ------------------------------------------------------------------
// Conexão da conta de anúncios (token de usuário do sistema)
// ------------------------------------------------------------------
export interface AdAccountOption {
  /** act_123456789 */
  id: string;
  name: string;
  /** account_status 1 = ativa. */
  active: boolean;
  currency: string | null;
  business: string | null;
}

/** Interpreta a resposta de /me/adaccounts. Ignora linhas sem id válido e repetidas. */
export function parseAdAccounts(rows: unknown): AdAccountOption[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: AdAccountOption[] = [];
  for (const raw of rows) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const id = normalizeAdAccountId(String(row.account_id ?? row.id ?? ""));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : id;
    out.push({
      id,
      name,
      active: Number(row.account_status) === 1,
      currency: typeof row.currency === "string" ? row.currency : null,
      business: typeof row.business_name === "string" && row.business_name.trim() ? row.business_name.trim() : null,
    });
  }
  return out.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "pt-BR"));
}

/** Mensagem em português para um erro da Graph API. */
export function describeMetaError(code: number | null, message: string): string {
  if (code === 190) return "O token é inválido ou expirou. Gere um novo token e tente de novo.";
  if (code === 10 || code === 200 || code === 299) {
    return "O token não tem permissão para ler anúncios. Gere o token com a permissão ads_read e dê acesso à conta de anúncios ao usuário do sistema.";
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) return "A Meta limitou as consultas por agora. Espere alguns minutos e tente de novo.";
  if (code === 100) return "A Meta recusou o pedido. Confira se o token foi gerado para um usuário do sistema com acesso à conta de anúncios.";
  return message ? `A Meta respondeu: ${message}` : "Não foi possível falar com a Meta agora. Tente de novo.";
}
