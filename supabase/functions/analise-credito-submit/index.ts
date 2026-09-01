import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  getEvolutionApiKey,
  getEvolutionApiUrl,
  normalizeUrl,
} from "../_shared/evolution-config.ts";
import {
  readJsonObject,
  rejectDisallowedOrigin,
  rejectRateLimited,
  requestValidationResponse,
} from "../_shared/request-security.ts";

type Temperatura = "quente" | "morno" | "frio";

interface AnalisePayload {
  nome?: unknown;
  whatsapp?: unknown;
  cidade?: unknown;
  tipo_bem?: unknown;
  valor_credito?: unknown;
  valor_entrada?: unknown;
  renda_mensal?: unknown;
  urgencia?: unknown;
  experiencia_consorcio?: unknown;
  consentimento_lgpd?: unknown;
  utm_source?: unknown;
  utm_campaign?: unknown;
  utm_medium?: unknown;
  utm_content?: unknown;
  utm_term?: unknown;
  client_slug?: unknown;
  tracking?: unknown;
  event_id?: unknown;
  event_source_url?: unknown;
  [key: string]: unknown;
}

interface NormalizedLead {
  nome: string;
  whatsapp: string;
  whatsapp_e164: string;
  cidade: string | null;
  tipo_bem: string | null;
  valor_credito: number;
  valor_entrada: number;
  renda_mensal: number;
  urgencia: string | null;
  experiencia_consorcio: string | null;
  consentimento_lgpd: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  utm_campaign_id: string | null;
  utm_adset: string | null;
  utm_adset_id: string | null;
  utm_ad: string | null;
  utm_ad_id: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  placement: string | null;
  site_source_name: string | null;
  fbclid: string | null;
  fbp: string | null;
  fbc: string | null;
  landing_url: string | null;
  referrer_url: string | null;
  event_source_url: string | null;
  meta_event_id: string;
  quiz_version: string | null;
  tracking: Record<string, unknown>;
  client_slug: string;
}

interface ScoreResult {
  score: number;
  temperatura: Temperatura;
  action_recommendation: string;
}

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const DEFAULT_SHEET_ID = "";
const DEFAULT_SHEET_TAB = "Pré-análise Hurtz";
const SHEET_HEADERS = [
  "Recebido em",
  "Nome",
  "WhatsApp",
  "Cidade",
  "Tipo de bem",
  "Valor desejado",
  "Entrada",
  "Renda",
  "Prazo",
  "Temperatura",
  "Score",
  "Status CRM",
  "URL CRM",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Campaign ID",
  "UTM Content",
  "UTM Term",
  "Adset",
  "Adset ID",
  "Ad",
  "Ad ID",
  "Placement",
  "Site Source",
  "FBCLID",
  "FBP",
  "FBC",
  "Event ID",
  "Landing URL",
  "Referrer",
  "Submission ID",
  "Client Slug",
  "Quiz Version",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const originRejection = rejectDisallowedOrigin(req, corsHeaders);
  if (originRejection) return originRejection;

  if (req.method === "GET") {
    const rateRejection = rejectRateLimited(
      req,
      "analise-credito-config",
      30,
      60_000,
      corsHeaders,
    );
    if (rateRejection) return rateRejection;

    const url = new URL(req.url);
    if (url.searchParams.get("config") === "1") {
      return json({
        success: true,
        client_slug: slugify(url.searchParams.get("client_slug") || "default"),
        meta_pixel_id: Deno.env.get("META_PIXEL_ID") || null,
      });
    }
    return json({ success: false, error: "Configuração não encontrada" }, 404);
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  const rateRejection = rejectRateLimited(
    req,
    "analise-credito-submit",
    8,
    10 * 60_000,
    corsHeaders,
  );
  if (rateRejection) return rateRejection;

  let payload: AnalisePayload;
  try {
    payload = await readJsonObject(req) as AnalisePayload;
  } catch (error) {
    return requestValidationResponse(error, corsHeaders) ??
      json({ success: false, error: "Payload inválido" }, 400);
  }

  if (cleanText(payload.website, 120)) return json({ success: true });

  const parsed = normalizePayload(payload);
  if ("error" in parsed) {
    return json({ success: false, error: parsed.error }, 400);
  }

  const lead = parsed.lead;
  const scoreResult = scoreLead(lead);
  const supabase = createSupabaseAdmin();

  const { data: submission, error: insertError } = await supabase
    .from("credito_lead_submissions")
    .insert({
      ...lead,
      raw_payload: payload,
      score: scoreResult.score,
      temperatura: scoreResult.temperatura,
      public_result: "aprovado_reuniao",
      action_recommendation: scoreResult.action_recommendation,
      crm_status: "pending",
      whatsapp_status: "pending",
      sheet_status: "pending",
      meta_event_name: "Lead",
      meta_event_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !submission) {
    console.error("[analise-credito-submit] insert failed", insertError);
    return json(
      { success: false, error: "Não foi possível salvar a análise" },
      500,
    );
  }

  const [crmResult, metaResult] = await Promise.all([
    sendToChatwoot(lead, scoreResult, submission.id),
    shouldSendMetaLead(scoreResult)
      ? sendMetaLeadEvent(lead, scoreResult, submission.id, req)
      : {
        status: "skipped_low_quality",
        error: null,
        events_received: null,
        response_payload: null,
      },
  ]);

  const [whatsappResult, sheetResult] = await Promise.all([
    notifySeller(lead, scoreResult, submission.id, crmResult.crm_url),
    appendLeadToSheet(lead, scoreResult, submission.id, crmResult),
  ]);

  await supabase
    .from("credito_lead_submissions")
    .update({
      crm_status: crmResult.status,
      crm_error: crmResult.error ?? null,
      crm_contact_id: crmResult.contact_id ?? null,
      crm_conversation_id: crmResult.conversation_id ?? null,
      crm_url: crmResult.crm_url ?? null,
      whatsapp_status: whatsappResult.status,
      whatsapp_error: whatsappResult.error ?? null,
      seller_whatsapp: whatsappResult.seller_whatsapp ?? null,
      sheet_status: sheetResult.status,
      sheet_error: sheetResult.error ?? null,
      sheet_row_range: sheetResult.row_range ?? null,
      meta_event_status: metaResult.status,
      meta_event_error: metaResult.error ?? null,
      meta_events_received: metaResult.events_received ?? null,
      meta_response: metaResult.response_payload ?? null,
    })
    .eq("id", submission.id);

  return json({
    success: true,
    submission_id: submission.id,
    score: scoreResult.score,
    temperatura: scoreResult.temperatura,
    public_result: "aprovado_reuniao",
    event_id: lead.meta_event_id,
  });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizePayload(
  payload: AnalisePayload,
): { lead: NormalizedLead } | { error: string } {
  const tracking = normalizeTracking(payload);
  const nome = cleanText(payload.nome, 120);
  const whatsapp = cleanText(payload.whatsapp, 40);
  const phone = normalizeBrazilPhone(whatsapp);
  const consentimento = parseBoolean(payload.consentimento_lgpd);
  const valorCredito = parseMoney(payload.valor_credito);
  const valorEntrada = parseMoney(payload.valor_entrada);
  const rendaMensal = parseMoney(payload.renda_mensal);
  const metaEventId = cleanText(payload.event_id, 120) ||
    cleanText(tracking.event_id, 120) ||
    crypto.randomUUID();
  const eventSourceUrl = cleanText(payload.event_source_url, 500) ||
    cleanText(tracking.event_source_url, 500) ||
    cleanText(tracking.landing_url, 500) ||
    null;

  if (!nome || nome.length < 2) return { error: "Informe seu nome completo." };
  if (!phone) return { error: "Informe um WhatsApp válido com DDD." };
  if (!consentimento) {
    return {
      error: "É necessário aceitar o uso dos dados para a pré-análise.",
    };
  }
  if (valorCredito <= 0) {
    return { error: "Informe o valor de crédito desejado." };
  }
  if (valorEntrada < 0) return { error: "Informe um valor de entrada válido." };
  if (rendaMensal <= 0) return { error: "Informe sua renda mensal." };
  if (valorEntrada > valorCredito) {
    return { error: "A entrada não pode ser maior que o valor desejado." };
  }

  return {
    lead: {
      nome,
      whatsapp,
      whatsapp_e164: phone,
      cidade: cleanText(payload.cidade, 80) || null,
      tipo_bem: cleanText(payload.tipo_bem, 80) || null,
      valor_credito: valorCredito,
      valor_entrada: valorEntrada,
      renda_mensal: rendaMensal,
      urgencia: cleanText(payload.urgencia, 80) || null,
      experiencia_consorcio: cleanText(payload.experiencia_consorcio, 80) ||
        null,
      consentimento_lgpd: consentimento,
      utm_source: cleanText(payload.utm_source, 120) ||
        cleanText(tracking.utm_source, 120) || null,
      utm_medium: cleanText(payload.utm_medium, 120) ||
        cleanText(tracking.utm_medium, 120) || null,
      utm_campaign: cleanText(payload.utm_campaign, 160) ||
        cleanText(tracking.utm_campaign, 160) || null,
      utm_content: cleanText(payload.utm_content, 160) ||
        cleanText(tracking.utm_content, 160) || null,
      utm_term: cleanText(payload.utm_term, 160) ||
        cleanText(tracking.utm_term, 160) || null,
      utm_campaign_id: cleanText(tracking.utm_campaign_id, 160) ||
        cleanText(tracking.campaign_id, 160) || null,
      utm_adset: cleanText(tracking.utm_adset, 160) || null,
      utm_adset_id: cleanText(tracking.utm_adset_id, 160) ||
        cleanText(tracking.adset_id, 160) || null,
      utm_ad: cleanText(tracking.utm_ad, 160) || null,
      utm_ad_id: cleanText(tracking.utm_ad_id, 160) ||
        cleanText(tracking.ad_id, 160) || null,
      campaign_id: cleanText(tracking.campaign_id, 160) ||
        cleanText(tracking.utm_campaign_id, 160) || null,
      adset_id: cleanText(tracking.adset_id, 160) ||
        cleanText(tracking.utm_adset_id, 160) || null,
      ad_id: cleanText(tracking.ad_id, 160) ||
        cleanText(tracking.utm_ad_id, 160) || null,
      placement: cleanText(tracking.placement, 160) || null,
      site_source_name: cleanText(tracking.site_source_name, 160) || null,
      fbclid: cleanText(tracking.fbclid, 500) || null,
      fbp: cleanText(tracking.fbp, 160) || null,
      fbc: cleanText(tracking.fbc, 500) || null,
      landing_url: cleanText(tracking.landing_url, 500) || eventSourceUrl,
      referrer_url: cleanText(tracking.referrer_url, 500) || null,
      event_source_url: eventSourceUrl,
      meta_event_id: metaEventId,
      quiz_version: cleanText(payload.quiz_version, 120) ||
        cleanText(tracking.quiz_version, 120) || null,
      tracking,
      client_slug: slugify(cleanText(payload.client_slug, 80) || "default"),
    },
  };
}

function normalizeTracking(payload: AnalisePayload): Record<string, unknown> {
  const rawTracking = payload.tracking && typeof payload.tracking === "object"
    ? payload.tracking as Record<string, unknown>
    : {};
  const aliases: Record<string, string[]> = {
    utm_source: ["utm_source"],
    utm_medium: ["utm_medium"],
    utm_campaign: ["utm_campaign"],
    utm_content: ["utm_content"],
    utm_term: ["utm_term"],
    utm_campaign_id: ["utm_campaign_id", "campaign_id"],
    utm_adset: ["utm_adset", "adset_name"],
    utm_adset_id: ["utm_adset_id", "adset_id"],
    utm_ad: ["utm_ad", "ad_name"],
    utm_ad_id: ["utm_ad_id", "ad_id"],
    campaign_id: ["campaign_id", "utm_campaign_id"],
    adset_id: ["adset_id", "utm_adset_id"],
    ad_id: ["ad_id", "utm_ad_id"],
    placement: ["placement"],
    site_source_name: ["site_source_name"],
    fbclid: ["fbclid"],
    fbp: ["fbp", "_fbp"],
    fbc: ["fbc", "_fbc"],
    landing_url: ["landing_url"],
    referrer_url: ["referrer_url"],
    event_source_url: ["event_source_url"],
    page_path: ["page_path"],
    quiz_version: ["quiz_version"],
    event_id: ["event_id"],
  };
  const normalized: Record<string, unknown> = {};

  for (const [target, keys] of Object.entries(aliases)) {
    for (const key of keys) {
      const value = cleanText(rawTracking[key] ?? payload[key], 500);
      if (value) {
        normalized[target] = value;
        break;
      }
    }
  }

  for (const [key, value] of Object.entries(rawTracking)) {
    if (!key.startsWith("utm_")) continue;
    const cleaned = cleanText(value, 500);
    if (cleaned && !(key in normalized)) normalized[key] = cleaned;
  }

  return normalized;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["true", "1", "sim", "yes", "on", "aceito"].includes(normalized);
}

function parseMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeBrazilPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 8 || digits.length > 13) return null;
  return digits;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "default";
}

function scoreLead(lead: NormalizedLead): ScoreResult {
  const hasAvailableInstallment = lead.renda_mensal > 0;
  const score = hasAvailableInstallment ? 100 : 0;
  const temperatura: Temperatura = hasAvailableInstallment ? "quente" : "frio";

  const actionByTemperature: Record<Temperatura, string> = {
    quente: "Ligar em até 30 minutos e puxar para reunião presencial.",
    morno: "Chamar no WhatsApp hoje e conduzir para reunião presencial.",
    frio:
      "Chamar com abordagem consultiva e confirmar intenção antes de agendar.",
  };

  return {
    score,
    temperatura,
    action_recommendation: actionByTemperature[temperatura],
  };
}

function shouldSendMetaLead(score: ScoreResult): boolean {
  return score.temperatura === "quente";
}

async function sendToChatwoot(
  lead: NormalizedLead,
  score: ScoreResult,
  submissionId: string,
) {
  const baseUrl = Deno.env.get("CHATWOOT_BASE_URL")?.replace(/\/+$/, "");
  const accountId = Deno.env.get("CHATWOOT_ACCOUNT_ID");
  const apiToken = Deno.env.get("CHATWOOT_API_TOKEN");
  const inboxId = Deno.env.get("CHATWOOT_INBOX_ID");

  if (!baseUrl || !accountId || !apiToken || !inboxId) {
    return { status: "not_configured" };
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      api_access_token: apiToken,
    };
    const customAttributes = buildCustomAttributes(lead, score, submissionId);

    let contactId: string | null = null;
    const searchResponse = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${
        encodeURIComponent(lead.whatsapp_e164)
      }`,
      { headers },
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      contactId = String(
        searchData?.payload?.[0]?.id ?? searchData?.contacts?.[0]?.id ?? "",
      );
    }

    if (!contactId) {
      const createContactResponse = await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/contacts`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            inbox_id: Number(inboxId),
            name: lead.nome,
            phone_number: `+${lead.whatsapp_e164}`,
            custom_attributes: customAttributes,
          }),
        },
      );
      const contactData = await readJson(createContactResponse);
      if (!createContactResponse.ok) {
        throw new Error(
          apiError("contact", createContactResponse, contactData),
        );
      }
      contactId = String(
        contactData?.payload?.contact?.id ?? contactData?.payload?.id ??
          contactData?.id ?? "",
      );
    }

    if (!contactId) {
      throw new Error("Contato criado sem ID retornado pelo Chatwoot");
    }

    await updateChatwootContactAttributes(
      baseUrl,
      accountId,
      contactId,
      headers,
      customAttributes,
    );

    const sourceId = `analise-credito-${submissionId}`;
    const conversationResponse = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/conversations`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          source_id: sourceId,
          inbox_id: Number(inboxId),
          contact_id: Number(contactId),
          custom_attributes: customAttributes,
        }),
      },
    );
    const conversationData = await readJson(conversationResponse);
    if (!conversationResponse.ok) {
      throw new Error(
        apiError("conversation", conversationResponse, conversationData),
      );
    }

    const conversationId = String(
      conversationData?.id ?? conversationData?.payload?.id ?? "",
    );
    const crmUrl = conversationId
      ? `${baseUrl}/app/accounts/${accountId}/conversations/${conversationId}`
      : `${baseUrl}/app/accounts/${accountId}/contacts/${contactId}`;

    if (conversationId) {
      await updateChatwootConversationAttributes(
        baseUrl,
        accountId,
        conversationId,
        headers,
        customAttributes,
      );

      await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            labels: [
              "analise-credito",
              "aprovado-reuniao",
              `temp-${score.temperatura}`,
              `bem-${slugify(lead.tipo_bem || "nao-informado")}`,
            ],
          }),
        },
      ).catch((error) =>
        console.warn("[analise-credito-submit] label error", error)
      );

      await fetch(
        `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            content: buildLeadCard(lead, score, crmUrl),
            message_type: "outgoing",
            private: true,
          }),
        },
      ).catch((error) =>
        console.warn("[analise-credito-submit] note error", error)
      );
    }

    return {
      status: "sent",
      contact_id: contactId,
      conversation_id: conversationId || null,
      crm_url: crmUrl,
    };
  } catch (error) {
    console.error("[analise-credito-submit] Chatwoot failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function updateChatwootContactAttributes(
  baseUrl: string,
  accountId: string,
  contactId: string,
  headers: Record<string, string>,
  customAttributes: Record<string, unknown>,
) {
  const response = await fetch(
    `${baseUrl}/api/v1/accounts/${accountId}/contacts/${contactId}`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ custom_attributes: customAttributes }),
    },
  );
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(apiError("contact-attributes", response, data));
  }
}

async function updateChatwootConversationAttributes(
  baseUrl: string,
  accountId: string,
  conversationId: string,
  headers: Record<string, string>,
  customAttributes: Record<string, unknown>,
) {
  const response = await fetch(
    `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/custom_attributes`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ custom_attributes: customAttributes }),
    },
  );
  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(apiError("conversation-attributes", response, data));
  }
}

function buildCustomAttributes(
  lead: NormalizedLead,
  score: ScoreResult,
  submissionId: string,
) {
  return {
    origem_lead: "analise-credito-reuniao",
    submission_id: submissionId,
    cidade: lead.cidade,
    tipo_bem: lead.tipo_bem,
    valor_credito: lead.valor_credito,
    valor_entrada: lead.valor_entrada,
    renda_mensal: lead.renda_mensal,
    urgencia: lead.urgencia,
    experiencia_consorcio: lead.experiencia_consorcio,
    score_pre_analise: score.score,
    temperatura: score.temperatura,
    resultado_publico: "aprovado_reuniao",
    client_slug: lead.client_slug,
    utm_source: lead.utm_source,
    utm_medium: lead.utm_medium,
    utm_campaign: lead.utm_campaign,
    utm_content: lead.utm_content,
    utm_term: lead.utm_term,
    utm_campaign_id: lead.utm_campaign_id,
    utm_adset: lead.utm_adset,
    utm_adset_id: lead.utm_adset_id,
    utm_ad: lead.utm_ad,
    utm_ad_id: lead.utm_ad_id,
    meta_campaign_id: lead.campaign_id,
    meta_adset_id: lead.adset_id,
    meta_ad_id: lead.ad_id,
    placement: lead.placement,
    site_source_name: lead.site_source_name,
    fbclid: lead.fbclid,
    fbp: lead.fbp,
    fbc: lead.fbc,
    landing_url: lead.landing_url,
    referrer_url: lead.referrer_url,
    event_source_url: lead.event_source_url,
    meta_event_id: lead.meta_event_id,
    quiz_version: lead.quiz_version,
  };
}

async function notifySeller(
  lead: NormalizedLead,
  score: ScoreResult,
  submissionId: string,
  crmUrl?: string | null,
) {
  const sellerWhatsapp = Deno.env.get("SELLER_WHATSAPP") ||
    Deno.env.get("EVOLUTION_GROUP_OPERACIONAL") || "";
  const instance = Deno.env.get("EVOLUTION_INSTANCE") || "";

  if (!sellerWhatsapp || !instance) {
    return {
      status: "not_configured",
      seller_whatsapp: sellerWhatsapp || null,
    };
  }

  try {
    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();
    const sendUrl = `${
      normalizeUrl(evolutionApiUrl)
    }/message/sendText/${instance}`;
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify({
        number: sellerWhatsapp.includes("@")
          ? sellerWhatsapp
          : sellerWhatsapp.replace(/\D/g, ""),
        text: buildLeadCard(lead, score, crmUrl, submissionId),
        delay: 1000,
        linkPreview: false,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(apiError("evolution", response, body));
    return { status: "sent", seller_whatsapp: sellerWhatsapp };
  } catch (error) {
    console.error("[analise-credito-submit] Evolution failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      seller_whatsapp: sellerWhatsapp,
    };
  }
}

async function appendLeadToSheet(
  lead: NormalizedLead,
  score: ScoreResult,
  submissionId: string,
  crmResult?: { status?: string; crm_url?: string | null },
) {
  const spreadsheetId = Deno.env.get("ANALISE_CREDITO_SHEET_ID") ||
    DEFAULT_SHEET_ID;
  const tabName = Deno.env.get("ANALISE_CREDITO_SHEET_TAB") ||
    DEFAULT_SHEET_TAB;

  if (
    !spreadsheetId || !Deno.env.get("GOOGLE_CLIENT_ID") ||
    !Deno.env.get("GOOGLE_CLIENT_SECRET") ||
    !Deno.env.get("GOOGLE_REFRESH_TOKEN")
  ) {
    return { status: "not_configured" };
  }

  try {
    const accessToken = await getGoogleAccessToken();
    await ensureSheetTab(spreadsheetId, tabName, accessToken);
    await ensureSheetHeaders(spreadsheetId, tabName, accessToken);

    const appendResponse = await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
        encodeURIComponent(`${tabName}!A1`)
      }:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          values: [[
            new Date().toISOString(),
            lead.nome,
            `+${lead.whatsapp_e164}`,
            lead.cidade || "",
            lead.tipo_bem || "",
            lead.valor_credito,
            lead.valor_entrada,
            lead.renda_mensal,
            lead.urgencia || "",
            score.temperatura,
            score.score,
            crmResult?.status || "",
            crmResult?.crm_url || "",
            lead.utm_source || "",
            lead.utm_medium || "",
            lead.utm_campaign || "",
            lead.utm_campaign_id || "",
            lead.utm_content || "",
            lead.utm_term || "",
            lead.utm_adset || "",
            lead.utm_adset_id || "",
            lead.utm_ad || "",
            lead.utm_ad_id || "",
            lead.placement || "",
            lead.site_source_name || "",
            lead.fbclid || "",
            lead.fbp || "",
            lead.fbc || "",
            lead.meta_event_id,
            lead.landing_url || "",
            lead.referrer_url || "",
            submissionId,
            lead.client_slug,
            lead.quiz_version || "",
          ]],
        }),
      },
    );

    return {
      status: "sent",
      row_range: String(appendResponse?.updates?.updatedRange || ""),
    };
  } catch (error) {
    console.error("[analise-credito-submit] Sheets failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getGoogleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await readJson(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(apiError("google-oauth", response, data));
  }
  return String(data.access_token);
}

async function ensureSheetTab(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
) {
  const metadata = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title)`,
    accessToken,
  );
  const exists = metadata?.sheets?.some((sheet: Record<string, unknown>) =>
    sheet?.properties &&
    (sheet.properties as Record<string, unknown>).title === tabName
  );
  if (exists) return;

  await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tabName } } }],
      }),
    },
  );
}

async function ensureSheetHeaders(
  spreadsheetId: string,
  tabName: string,
  accessToken: string,
) {
  const range = encodeURIComponent(`${tabName}!A1:AH1`);
  const current = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    accessToken,
  ).catch(() => null);
  const headers = current?.values?.[0] || [];
  if (headers.join("|") === SHEET_HEADERS.join("|")) return;

  await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: [SHEET_HEADERS] }),
    },
  );
}

async function googleSheetsFetch(
  url: string,
  accessToken: string,
  options: RequestInit = {},
) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(apiError("google-sheets", response, body));
  return body;
}

async function sendMetaLeadEvent(
  lead: NormalizedLead,
  score: ScoreResult,
  submissionId: string,
  req: Request,
) {
  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CAPI_ACCESS_TOKEN");
  if (!pixelId || !accessToken) {
    return { status: "not_configured" };
  }

  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
  const eventSourceUrl = lead.event_source_url || lead.landing_url ||
    "https://pages.hurtzcompany.com.br/analise-credito-reuniao/";
  const userData = await buildMetaUserData(lead, submissionId, req);
  const eventData = {
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: lead.meta_event_id,
    action_source: "website",
    event_source_url: eventSourceUrl,
    user_data: userData,
    custom_data: {
      content_name: "Pré-análise Hurtz",
      content_category: "Consórcio",
      currency: "BRL",
      value: 0,
      lead_type: lead.tipo_bem || "",
      temperatura: score.temperatura,
      score: score.score,
      submission_id: submissionId,
      client_slug: lead.client_slug,
      utm_source: lead.utm_source || "",
      utm_campaign: lead.utm_campaign || "",
      utm_campaign_id: lead.utm_campaign_id || "",
      adset_id: lead.adset_id || "",
      ad_id: lead.ad_id || "",
      placement: lead.placement || "",
    },
  };
  const requestPayload: Record<string, unknown> = {
    data: [eventData],
    access_token: accessToken,
  };
  const testEventCode = Deno.env.get("META_TEST_EVENT_CODE");
  if (testEventCode) requestPayload.test_event_code = testEventCode;

  try {
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      },
    );
    const body = await readJson(response);
    if (!response.ok) throw new Error(apiError("meta-capi", response, body));
    return {
      status: "sent",
      events_received: Number(body?.events_received || 0) || null,
      response_payload: body,
    };
  } catch (error) {
    console.error("[analise-credito-submit] Meta CAPI failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildMetaUserData(
  lead: NormalizedLead,
  submissionId: string,
  req: Request,
) {
  const userData: Record<string, unknown> = {
    ph: [await sha256Hash(lead.whatsapp_e164)],
    external_id: [await sha256Hash(submissionId)],
  };
  const { firstName, lastName } = splitName(lead.nome);
  if (firstName) userData.fn = [await sha256Hash(firstName)];
  if (lastName) userData.ln = [await sha256Hash(lastName)];
  if (lead.fbp) userData.fbp = lead.fbp;
  if (lead.fbc) userData.fbc = lead.fbc;

  const userAgent = req.headers.get("user-agent");
  const ip = getClientIp(req);
  if (userAgent) userData.client_user_agent = userAgent;
  if (ip) userData.client_ip_address = ip;
  return userData;
}

async function sha256Hash(value: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "",
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function getClientIp(req: Request) {
  const header = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") || "";
  return header.split(",")[0].trim();
}

function buildLeadCard(
  lead: NormalizedLead,
  score: ScoreResult,
  crmUrl?: string | null,
  submissionId?: string,
) {
  const lines = [
    "Novo lead de pré-análise",
    "",
    `Nome: ${lead.nome}`,
    `WhatsApp: +${lead.whatsapp_e164}`,
    `Cidade: ${lead.cidade || "Não informada"}`,
    `Tipo de bem: ${lead.tipo_bem || "Não informado"}`,
    `Valor desejado: ${formatCurrency(lead.valor_credito)}`,
    `Entrada: ${formatCurrency(lead.valor_entrada)}`,
    `Renda: ${formatCurrency(lead.renda_mensal)}`,
    `Urgência: ${lead.urgencia || "Não informada"}`,
    `Experiência: ${lead.experiencia_consorcio || "Não informada"}`,
    "",
    `Temperatura: ${score.temperatura.toUpperCase()} (${score.score}/100)`,
    `Ação: ${score.action_recommendation}`,
    "",
    `Origem: ${lead.utm_source || "Não informada"}`,
    `Campanha: ${lead.utm_campaign || lead.utm_campaign_id || "Não informada"}`,
    `Conjunto: ${lead.utm_adset || lead.utm_adset_id || "Não informado"}`,
    `Anúncio: ${lead.utm_ad || lead.utm_ad_id || "Não informado"}`,
    `Placement: ${lead.placement || lead.site_source_name || "Não informado"}`,
    `Event ID: ${lead.meta_event_id}`,
  ];
  if (crmUrl) lines.push("", `CRM: ${crmUrl}`);
  if (submissionId) lines.push(`ID: ${submissionId}`);
  return lines.join("\n");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiError(label: string, response: Response, body: unknown) {
  const bodyMessage = typeof body === "string" ? body : JSON.stringify(body);
  return `${label} HTTP ${response.status}: ${bodyMessage.slice(0, 500)}`;
}
