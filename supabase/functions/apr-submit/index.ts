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
  requireSecretHeader,
} from "../_shared/request-security.ts";

interface AprPayload {
  event_only?: unknown;
  event_name?: unknown;
  event_id?: unknown;
  meta?: unknown;
  user_data?: unknown;
  custom_data?: unknown;
  quiz?: unknown;
  version?: unknown;
  procedure?: unknown;
  current_surgeries_month?: unknown;
  current_surgeries_label?: unknown;
  current_average_ticket?: unknown;
  current_ticket_label?: unknown;
  current_revenue?: unknown;
  desired_surgeries_month?: unknown;
  desired_surgeries_label?: unknown;
  desired_average_ticket?: unknown;
  desired_ticket_label?: unknown;
  goal_revenue?: unknown;
  growth_surgeries?: unknown;
  growth_revenue?: unknown;
  evaluations_month?: unknown;
  consultations_label?: unknown;
  estimated_conversion?: unknown;
  main_source?: unknown;
  first_contact_owner?: unknown;
  followup_process?: unknown;
  priority?: unknown;
  lead?: unknown;
  form_answers?: unknown;
  utm?: unknown;
  tracking?: unknown;
  event_source_url?: unknown;
  [key: string]: unknown;
}

interface NormalizedLead {
  nome: string;
  instagram: string;
  whatsapp: string;
  whatsapp_e164: string;
  procedure: string;
  current_surgeries_month: number;
  current_surgeries_label: string | null;
  current_average_ticket: number;
  current_ticket_label: string | null;
  current_revenue: number;
  desired_surgeries_month: number;
  desired_surgeries_label: string | null;
  desired_average_ticket: number;
  desired_ticket_label: string | null;
  goal_revenue: number;
  growth_surgeries: number;
  growth_revenue: number;
  evaluations_month: number;
  consultations_label: string | null;
  estimated_conversion: number;
  main_source: string | null;
  first_contact_owner: string | null;
  followup_process: string | null;
  priority: string | null;
  quiz_version: string | null;
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
  tracking: Record<string, unknown>;
}

const FUNCTION_CORS_HEADERS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${
    corsHeaders["Access-Control-Allow-Headers"]
  }, x-dashboard-token`,
};
const JSON_HEADERS = {
  ...FUNCTION_CORS_HEADERS,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const DEFAULT_META_PIXEL_ID = "";
const DEFAULT_SHEET_ID = "";
const DEFAULT_SHEET_TAB = "Simulador APR";
const SESSION_STRATEGIC_SHEET_TAB = "Sessão Estratégica";
const DEFAULT_NOTIFY_WHATSAPP = "";
const ALLOWED_PUBLIC_META_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Lead",
  "CompleteRegistration",
]);
const SHEET_HEADERS = [
  "Recebido em",
  "Nome",
  "Instagram",
  "WhatsApp",
  "Procedimento",
  "Cirurgias hoje",
  "Ticket hoje",
  "Faturamento hoje",
  "Cirurgias meta",
  "Ticket meta",
  "Faturamento meta",
  "Crescimento cirurgias",
  "Crescimento receita",
  "Consultas/mês",
  "Conversão estimada",
  "Origem principal",
  "Responsável contato",
  "Follow-up",
  "Prioridade",
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
  "Landing URL",
  "Referrer",
  "Submission ID",
  "Quiz Version",
];
const SESSION_STRATEGIC_SHEET_HEADERS = [
  "Recebido em",
  "Nome",
  "E-mail",
  "Instagram",
  "WhatsApp",
  "Clínica própria",
  "Faturamento médio mensal",
  "Faturamento valor",
  "Cirurgias vendidas/mês",
  "Meta cirurgias/mês",
  "Procedimento",
  "Origem principal",
  "Responsável contato",
  "Follow-up",
  "Prioridade",
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
  "Landing URL",
  "Referrer",
  "Submission ID",
  "Quiz Version",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: FUNCTION_CORS_HEADERS });
  }

  if (req.method === "GET") {
    return handleDashboard(req);
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  const originRejection = rejectDisallowedOrigin(req, FUNCTION_CORS_HEADERS);
  if (originRejection) return originRejection;
  const rateRejection = rejectRateLimited(
    req,
    "apr-submit",
    12,
    10 * 60_000,
    FUNCTION_CORS_HEADERS,
  );
  if (rateRejection) return rateRejection;

  let payload: AprPayload;
  try {
    payload = await readJsonObject(req) as AprPayload;
  } catch (error) {
    return requestValidationResponse(error, FUNCTION_CORS_HEADERS) ??
      json({ success: false, error: "Payload inválido" }, 400);
  }

  if (cleanText(payload.website, 120)) return json({ success: true });

  if (payload.event_only === true) {
    const eventName = cleanText(payload.event_name, 80) || "PageView";
    if (!ALLOWED_PUBLIC_META_EVENTS.has(eventName)) {
      return json({ success: false, error: "Evento não permitido" }, 400);
    }
    const metaResult = await sendMetaPublicEvent(req, payload);
    return json({
      success: metaResult.status !== "error",
      meta_status: metaResult.status,
      event_name: metaResult.event_name,
      event_id: metaResult.event_id,
      events_received: metaResult.events_received ?? null,
      error: metaResult.error ?? null,
    }, metaResult.status === "error" ? 502 : 200);
  }

  const parsed = normalizePayload(payload);
  if ("error" in parsed) {
    return json({ success: false, error: parsed.error }, 400);
  }

  const lead = parsed.lead;
  const supabase = createSupabaseAdmin();
  const { data: submission, error: insertError } = await supabase
    .from("apr_lead_submissions")
    .insert({
      ...lead,
      raw_payload: payload,
      sheet_status: "pending",
      whatsapp_status: "pending",
    })
    .select("id, created_at")
    .single();

  if (insertError || !submission) {
    console.error("[apr-submit] insert failed", insertError);
    return json(
      { success: false, error: "Não foi possível salvar o lead" },
      500,
    );
  }

  syncCentralCapture(
    supabase,
    lead,
    payload,
    submission.id,
    String(submission.created_at || ""),
  )
    .catch((error) =>
      console.error("[apr-submit] central capture sync failed", error)
    );

  const [sheetResult, whatsappResult, metaResult] = await Promise.all([
    appendLeadToSheet(
      lead,
      submission.id,
      String(submission.created_at || ""),
      payload,
    ),
    notifyInternal(lead, submission.id),
    sendMetaLeadEvent(
      req,
      payload,
      lead,
      submission.id,
      String(submission.created_at || ""),
    ),
  ]);

  await supabase
    .from("apr_lead_submissions")
    .update({
      sheet_status: sheetResult.status,
      sheet_error: sheetResult.error ?? null,
      sheet_row_range: sheetResult.row_range ?? null,
      whatsapp_status: whatsappResult.status,
      whatsapp_error: whatsappResult.error ?? null,
      notify_whatsapp: whatsappResult.notify_whatsapp ?? null,
    })
    .eq("id", submission.id);

  return json({
    success: true,
    submission_id: submission.id,
    sheet_status: sheetResult.status,
    whatsapp_status: whatsappResult.status,
    meta_status: metaResult.status,
  });
});

async function handleDashboard(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("dashboard") !== "1") {
    return json({ success: false, error: "Endpoint não encontrado" }, 404);
  }

  try {
    requireSecretHeader(req, "APR_DASHBOARD_TOKEN", "x-dashboard-token");
  } catch (error) {
    return requestValidationResponse(error, FUNCTION_CORS_HEADERS) ??
      json({ success: false, error: "Não autorizado" }, 401);
  }

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("apr_lead_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  const since = parseDateParam(url.searchParams.get("since"));
  const until = parseDateParam(url.searchParams.get("until"));
  const procedure = cleanText(url.searchParams.get("procedure"), 120);
  const source = cleanText(url.searchParams.get("source"), 120);
  const priority = cleanText(url.searchParams.get("priority"), 180);
  const sessionStrategic = url.searchParams.get("session_strategic") === "1";

  if (since) query = query.gte("created_at", `${since}T00:00:00.000Z`);
  if (until) query = query.lt("created_at", nextDateIso(until));
  if (sessionStrategic) {
    query = query.or(
      "procedure.ilike.%Sessão Estratégica%,main_source.ilike.%Sessão Estratégica%,priority.ilike.%Sessão Estratégica%,utm_campaign.ilike.%Sessão Estratégica%",
    );
  }
  if (procedure) query = query.eq("procedure", procedure);
  if (source) query = query.eq("main_source", source);
  if (priority) query = query.eq("priority", priority);

  const { data, error } = await query;
  if (error) {
    console.error("[apr-submit] dashboard query failed", error);
    return json(
      { success: false, error: "Não foi possível carregar o painel" },
      500,
    );
  }

  const rows = (data || []).map(normalizeDashboardRow);
  return json({
    success: true,
    generated_at: new Date().toISOString(),
    totals: buildTotals(rows),
    breakdowns: {
      procedures: countBy(rows, "procedure"),
      sources: countBy(rows, "main_source"),
      priorities: countBy(rows, "priority"),
    },
    rows,
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizePayload(
  payload: AprPayload,
): { lead: NormalizedLead } | { error: string } {
  const rawLead = payload.lead && typeof payload.lead === "object"
    ? payload.lead as Record<string, unknown>
    : {};
  const tracking = normalizeTracking(payload);
  const nome = cleanText(rawLead.name ?? rawLead.nome, 140);
  const instagram = normalizeInstagram(rawLead.instagram);
  const whatsapp = cleanText(rawLead.whatsapp, 40);
  const phone = normalizeBrazilPhone(whatsapp);
  const procedure = cleanText(payload.procedure, 120);
  const currentSurgeries = parseInteger(payload.current_surgeries_month);
  const currentTicket = parseMoney(payload.current_average_ticket);
  const desiredSurgeries = parseInteger(payload.desired_surgeries_month);
  const desiredTicket = parseMoney(payload.desired_average_ticket);

  if (!nome || nome.length < 2) return { error: "Informe o nome." };
  if (!instagram) return { error: "Informe o Instagram da clínica." };
  if (!phone) return { error: "Informe um WhatsApp válido com DDD." };
  if (!procedure) return { error: "Informe o procedimento prioritário." };
  if (currentSurgeries < 0 || desiredSurgeries < 0) {
    return { error: "Informe uma quantidade válida de cirurgias." };
  }
  if (currentTicket <= 0 || desiredTicket <= 0) {
    return { error: "Informe tickets válidos." };
  }

  return {
    lead: {
      nome,
      instagram,
      whatsapp,
      whatsapp_e164: phone,
      procedure,
      current_surgeries_month: currentSurgeries,
      current_surgeries_label: cleanText(payload.current_surgeries_label, 80) ||
        null,
      current_average_ticket: currentTicket,
      current_ticket_label: cleanText(payload.current_ticket_label, 80) || null,
      current_revenue: parseMoney(payload.current_revenue) ||
        currentSurgeries * currentTicket,
      desired_surgeries_month: desiredSurgeries,
      desired_surgeries_label: cleanText(payload.desired_surgeries_label, 80) ||
        null,
      desired_average_ticket: desiredTicket,
      desired_ticket_label: cleanText(payload.desired_ticket_label, 80) || null,
      goal_revenue: parseMoney(payload.goal_revenue) ||
        desiredSurgeries * desiredTicket,
      growth_surgeries: parseInteger(payload.growth_surgeries),
      growth_revenue: parseMoney(payload.growth_revenue),
      evaluations_month: parseInteger(payload.evaluations_month),
      consultations_label: cleanText(payload.consultations_label, 80) || null,
      estimated_conversion: parsePercent(payload.estimated_conversion),
      main_source: cleanText(payload.main_source, 120) || null,
      first_contact_owner: cleanText(payload.first_contact_owner, 120) || null,
      followup_process: cleanText(payload.followup_process, 120) || null,
      priority: cleanText(payload.priority, 180) || null,
      quiz_version: cleanText(payload.version ?? payload.quiz_version, 80) ||
        cleanText(tracking.quiz_version, 80) || null,
      utm_source: cleanText(tracking.utm_source, 160) || null,
      utm_medium: cleanText(tracking.utm_medium, 160) || null,
      utm_campaign: cleanText(tracking.utm_campaign, 200) || null,
      utm_content: cleanText(tracking.utm_content, 200) || null,
      utm_term: cleanText(tracking.utm_term, 200) || null,
      utm_campaign_id: cleanText(tracking.utm_campaign_id, 160) ||
        cleanText(tracking.campaign_id, 160) || null,
      utm_adset: cleanText(tracking.utm_adset, 200) || null,
      utm_adset_id: cleanText(tracking.utm_adset_id, 160) ||
        cleanText(tracking.adset_id, 160) || null,
      utm_ad: cleanText(tracking.utm_ad, 200) || null,
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
      fbp: cleanText(tracking.fbp, 180) || null,
      fbc: cleanText(tracking.fbc, 500) || null,
      landing_url: cleanText(tracking.landing_url, 600) || null,
      referrer_url: cleanText(tracking.referrer_url, 600) || null,
      event_source_url: cleanText(payload.event_source_url, 600) ||
        cleanText(tracking.event_source_url, 600) || null,
      tracking,
    },
  };
}

function normalizeTracking(payload: AprPayload): Record<string, unknown> {
  const rawUtm = payload.utm && typeof payload.utm === "object"
    ? payload.utm as Record<string, unknown>
    : {};
  const rawTracking = payload.tracking && typeof payload.tracking === "object"
    ? payload.tracking as Record<string, unknown>
    : {};
  const merged = { ...rawUtm, ...rawTracking };
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(merged)) {
    const cleaned = cleanText(value, 600);
    if (cleaned) normalized[key] = cleaned;
  }
  return normalized;
}

async function syncCentralCapture(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  lead: NormalizedLead,
  payload: AprPayload,
  submissionId: string,
  createdAt: string,
) {
  const rawLead = payload.lead && typeof payload.lead === "object"
    ? payload.lead as Record<string, unknown>
    : {};
  const answers =
    payload.form_answers && typeof payload.form_answers === "object"
      ? payload.form_answers as Record<string, unknown>
      : {};
  const sourceSlug =
    lead.priority?.toLowerCase().includes("sessão estratégica") ||
      Object.keys(answers).length > 0
      ? "hurtz-sessao-estrategica"
      : "apr-submit";

  const { error } = await supabase
    .from("lead_capture_submissions")
    .upsert({
      source_type: "landing_page",
      source_slug: sourceSlug,
      source_record_id: submissionId,
      nome: lead.nome,
      email: cleanText(rawLead.email ?? answers.email, 180) || null,
      telefone: lead.whatsapp_e164,
      instagram: lead.instagram,
      landing_url: lead.landing_url,
      utm_source: lead.utm_source,
      utm_medium: lead.utm_medium,
      utm_campaign: lead.utm_campaign,
      utm_content: lead.utm_content,
      utm_term: lead.utm_term,
      answers: {
        procedimento: lead.procedure,
        clinica_propria: cleanText(answers.clinica_propria, 80) || null,
        faturamento_medio_mensal:
          cleanText(answers.faturamento_medio_mensal, 120) || null,
        faturamento_medio_mensal_valor:
          cleanText(answers.faturamento_medio_mensal_valor, 80) || null,
        cirurgias_mes: lead.current_surgeries_label ||
          lead.current_surgeries_month,
        meta_cirurgias_mes: lead.desired_surgeries_label ||
          lead.desired_surgeries_month,
        origem_principal: lead.main_source,
        prioridade: lead.priority,
      },
      raw_payload: payload,
      created_at: createdAt || new Date().toISOString(),
    }, {
      onConflict: "source_type,source_slug,source_record_id",
    });

  if (error) throw error;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeInstagram(value: unknown): string {
  const handle = cleanText(value, 120)
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .replace(/[^a-z0-9._]/gi, "")
    .slice(0, 30);
  return handle ? `@${handle}` : "";
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

function parseInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function parsePercent(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(parsed, 1));
}

function normalizeBrazilPhone(value: string): string | null {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (digits.length < 10 || digits.length > 13) return null;
  return digits;
}

async function sendMetaPublicEvent(req: Request, payload: AprPayload) {
  const tracking = normalizeTracking(payload);
  const rawUserData = payload.user_data && typeof payload.user_data === "object"
    ? payload.user_data as Record<string, unknown>
    : {};
  const rawCustomData =
    payload.custom_data && typeof payload.custom_data === "object"
      ? payload.custom_data as Record<string, unknown>
      : {};
  const eventName = cleanText(payload.event_name, 80) || "PageView";
  const eventId = cleanText(payload.event_id, 120) ||
    `${eventName.toLowerCase()}_${Date.now()}`;

  return sendMetaEvent({
    pixel_id: getPayloadPixelId(payload),
    event_name: eventName,
    event_id: eventId,
    event_time: unixTime(),
    event_source_url: cleanText(payload.event_source_url, 600) ||
      cleanText(tracking.event_source_url, 600) ||
      cleanText(tracking.landing_url, 600),
    user_data: await buildMetaUserData(req, {
      email: cleanText(rawUserData.email, 180),
      phone: cleanText(rawUserData.phone ?? rawUserData.whatsapp, 40),
      name: cleanText(rawUserData.name ?? rawUserData.nome, 140),
      externalId: eventId,
      tracking,
    }),
    custom_data: sanitizeMetaCustomData(rawCustomData),
  });
}

async function sendMetaLeadEvent(
  req: Request,
  payload: AprPayload,
  lead: NormalizedLead,
  submissionId: string,
  createdAt: string,
) {
  const rawLead = payload.lead && typeof payload.lead === "object"
    ? payload.lead as Record<string, unknown>
    : {};
  const rawMeta = payload.meta && typeof payload.meta === "object"
    ? payload.meta as Record<string, unknown>
    : {};
  const eventId = cleanText(rawMeta.lead_event_id, 120) ||
    cleanText(lead.tracking.meta_event_id_lead, 120) ||
    `lead_${submissionId}`;
  const eventTime = createdAt
    ? Math.floor(new Date(createdAt).getTime() / 1000)
    : unixTime();
  const currentRevenue = Number.isFinite(lead.current_revenue)
    ? lead.current_revenue
    : 0;
  const customData: Record<string, unknown> = {
    content_name: "Sessão Estratégica Gratuita",
    content_category: "Lead",
    instagram: lead.instagram,
    procedure: lead.procedure,
    current_surgeries_month: lead.current_surgeries_month,
  };
  if (currentRevenue > 0) {
    customData.currency = "BRL";
    customData.value = currentRevenue;
    customData.predicted_ltv = currentRevenue;
  }

  return sendMetaEvent({
    pixel_id: getPayloadPixelId(payload),
    event_name: "Lead",
    event_id: eventId,
    event_time: Number.isFinite(eventTime) ? eventTime : unixTime(),
    event_source_url: lead.event_source_url || lead.landing_url || "",
    user_data: await buildMetaUserData(req, {
      email: cleanText(rawLead.email, 180),
      phone: lead.whatsapp_e164,
      name: lead.nome,
      externalId: submissionId,
      tracking: lead.tracking,
    }),
    custom_data: customData,
  });
}

async function sendMetaEvent(event: {
  pixel_id: string;
  event_name: string;
  event_id: string;
  event_time: number;
  event_source_url: string;
  user_data: Record<string, unknown>;
  custom_data: Record<string, unknown>;
}) {
  const pixelId = cleanText(event.pixel_id, 80) || DEFAULT_META_PIXEL_ID;
  const config = await resolveMetaConfig(pixelId);
  if (!config.accessToken) {
    return {
      status: "not_configured",
      event_name: event.event_name,
      event_id: event.event_id,
    };
  }

  try {
    const graphVersion = cleanText(Deno.env.get("META_GRAPH_VERSION"), 20) ||
      "v23.0";
    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [{
            event_name: event.event_name,
            event_time: event.event_time,
            event_id: event.event_id,
            action_source: "website",
            event_source_url: event.event_source_url,
            user_data: event.user_data,
            custom_data: event.custom_data,
          }],
          access_token: config.accessToken,
        }),
      },
    );
    const body = await readJson(response);
    if (!response.ok) throw new Error(apiError("meta-capi", response, body));
    return {
      status: "sent",
      event_name: event.event_name,
      event_id: event.event_id,
      events_received: Number(body?.events_received || 0),
    };
  } catch (error) {
    console.error("[apr-submit] Meta CAPI failed", error);
    return {
      status: "error",
      event_name: event.event_name,
      event_id: event.event_id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getPayloadPixelId(payload: AprPayload) {
  return cleanText(Deno.env.get("APR_META_PIXEL_ID"), 80) ||
    cleanText(Deno.env.get("META_PIXEL_ID"), 80) ||
    DEFAULT_META_PIXEL_ID;
}

async function resolveMetaConfig(pixelId: string) {
  const accessToken = cleanText(Deno.env.get("APR_META_ACCESS_TOKEN"), 2000) ||
    cleanText(Deno.env.get("META_CAPI_ACCESS_TOKEN"), 2000) ||
    cleanText(Deno.env.get("META_PIXEL_ACCESS_TOKEN"), 2000) ||
    cleanText(Deno.env.get("META_ACCESS_TOKEN"), 2000);
  if (accessToken) return { accessToken };

  try {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("meta_pixel_integrations")
      .select("access_token")
      .eq("pixel_id", pixelId)
      .eq("is_active", true)
      .maybeSingle();
    return { accessToken: cleanText(data?.access_token, 2000) };
  } catch (error) {
    console.warn("[apr-submit] Meta config lookup skipped", error);
    return { accessToken: "" };
  }
}

async function buildMetaUserData(req: Request, input: {
  email?: string;
  phone?: string;
  name?: string;
  externalId?: string;
  tracking?: Record<string, unknown>;
}) {
  const tracking = input.tracking || {};
  const normalizedPhone = normalizeBrazilPhone(String(input.phone || "")) ||
    String(input.phone || "").replace(/\D/g, "");
  const nameParts = cleanText(input.name, 140).split(" ").filter(Boolean);
  const firstName = nameParts[0] || "";
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const userData: Record<string, unknown> = {
    client_ip_address: getClientIp(req),
    client_user_agent: req.headers.get("user-agent") || "",
  };

  const emailHash = await hashMetaValue(input.email || "");
  const phoneHash = await hashMetaValue(normalizedPhone);
  const firstNameHash = await hashMetaValue(firstName);
  const lastNameHash = await hashMetaValue(lastName);
  const externalIdHash = await hashMetaValue(input.externalId || "");

  if (emailHash) userData.em = [emailHash];
  if (phoneHash) userData.ph = [phoneHash];
  if (firstNameHash) userData.fn = [firstNameHash];
  if (lastNameHash) userData.ln = [lastNameHash];
  if (externalIdHash) userData.external_id = [externalIdHash];

  const fbp = cleanText(tracking.fbp, 180);
  const fbc = cleanText(tracking.fbc, 500);
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  return userData;
}

function getClientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for") || "";
  return req.headers.get("cf-connecting-ip") ||
    forwarded.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";
}

async function hashMetaValue(value: string) {
  const normalized = cleanText(value, 500).toLowerCase();
  if (!normalized) return "";
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sanitizeMetaCustomData(raw: Record<string, unknown>) {
  const customData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") customData[key] = cleanText(value, 600);
    if (typeof value === "number" && Number.isFinite(value)) {
      customData[key] = value;
    }
    if (typeof value === "boolean") customData[key] = value;
  }
  return customData;
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

async function appendLeadToSheet(
  lead: NormalizedLead,
  submissionId: string,
  createdAt: string,
  payload: AprPayload,
) {
  const destination = getSheetDestination(
    lead,
    payload,
    submissionId,
    createdAt,
  );
  const { spreadsheetId, tabName, headers, row } = destination;

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
    await ensureSheetHeaders(spreadsheetId, tabName, accessToken, headers);
    const appendResponse = await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
        encodeURIComponent(`${tabName}!A1`)
      }:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          values: [row],
        }),
      },
    );

    return {
      status: "sent",
      row_range: String(appendResponse?.updates?.updatedRange || ""),
    };
  } catch (error) {
    console.error("[apr-submit] Sheets failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function getSheetDestination(
  lead: NormalizedLead,
  payload: AprPayload,
  submissionId: string,
  createdAt: string,
) {
  if (isSessionStrategicLead(lead, payload)) {
    return {
      spreadsheetId: Deno.env.get("APR_SESSAO_ESTRATEGICA_SHEET_ID") ||
        Deno.env.get("APR_SESSION_STRATEGIC_SHEET_ID") ||
        Deno.env.get("APR_SHEET_ID") ||
        DEFAULT_SHEET_ID,
      tabName: Deno.env.get("APR_SESSAO_ESTRATEGICA_SHEET_TAB") ||
        Deno.env.get("APR_SESSION_STRATEGIC_SHEET_TAB") ||
        SESSION_STRATEGIC_SHEET_TAB,
      headers: SESSION_STRATEGIC_SHEET_HEADERS,
      row: buildSessionStrategicSheetRow(
        lead,
        payload,
        submissionId,
        createdAt,
      ),
    };
  }

  return {
    spreadsheetId: Deno.env.get("APR_SHEET_ID") || DEFAULT_SHEET_ID,
    tabName: Deno.env.get("APR_SHEET_TAB") || DEFAULT_SHEET_TAB,
    headers: SHEET_HEADERS,
    row: buildDefaultSheetRow(lead, submissionId, createdAt),
  };
}

function isSessionStrategicLead(lead: NormalizedLead, payload: AprPayload) {
  const haystack = [
    cleanText(payload.quiz, 100),
    lead.quiz_version || "",
    lead.procedure,
    lead.main_source || "",
    lead.landing_url || "",
    lead.event_source_url || "",
  ].join(" ").toLowerCase();

  return haystack.includes("sessao_estrategica") ||
    haystack.includes("sessão estratégica") ||
    haystack.includes("/sessao-estrategica");
}

function buildDefaultSheetRow(
  lead: NormalizedLead,
  submissionId: string,
  createdAt: string,
) {
  return [
    createdAt || new Date().toISOString(),
    lead.nome,
    lead.instagram,
    `+${lead.whatsapp_e164}`,
    lead.procedure,
    lead.current_surgeries_label || lead.current_surgeries_month,
    lead.current_ticket_label || lead.current_average_ticket,
    lead.current_revenue,
    lead.desired_surgeries_label || lead.desired_surgeries_month,
    lead.desired_ticket_label || lead.desired_average_ticket,
    lead.goal_revenue,
    lead.growth_surgeries,
    lead.growth_revenue,
    lead.consultations_label || lead.evaluations_month,
    lead.estimated_conversion,
    lead.main_source || "",
    lead.first_contact_owner || "",
    lead.followup_process || "",
    lead.priority || "",
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
    lead.landing_url || "",
    lead.referrer_url || "",
    submissionId,
    lead.quiz_version || "",
  ];
}

function buildSessionStrategicSheetRow(
  lead: NormalizedLead,
  payload: AprPayload,
  submissionId: string,
  createdAt: string,
) {
  const rawLead = payload.lead && typeof payload.lead === "object"
    ? payload.lead as Record<string, unknown>
    : {};
  const answers =
    payload.form_answers && typeof payload.form_answers === "object"
      ? payload.form_answers as Record<string, unknown>
      : {};

  return [
    createdAt || new Date().toISOString(),
    lead.nome,
    cleanText(rawLead.email ?? answers.email, 180),
    lead.instagram,
    `+${lead.whatsapp_e164}`,
    cleanText(answers.clinica_propria, 80),
    cleanText(answers.faturamento_medio_mensal, 120),
    cleanText(answers.faturamento_medio_mensal_valor, 80),
    lead.current_surgeries_label || lead.current_surgeries_month,
    lead.desired_surgeries_label || lead.desired_surgeries_month,
    lead.procedure,
    lead.main_source || "",
    lead.first_contact_owner || "",
    lead.followup_process || "",
    lead.priority || "",
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
    lead.landing_url || "",
    lead.referrer_url || "",
    submissionId,
    lead.quiz_version || "",
  ];
}

async function notifyInternal(lead: NormalizedLead, submissionId: string) {
  const notifyWhatsapp = Deno.env.get("APR_NOTIFY_WHATSAPP") ||
    DEFAULT_NOTIFY_WHATSAPP;
  const instance = Deno.env.get("APR_NOTIFY_EVOLUTION_INSTANCE") ||
    Deno.env.get("EVOLUTION_INSTANCE") || "";

  if (!notifyWhatsapp || !instance) {
    return {
      status: "not_configured",
      notify_whatsapp: notifyWhatsapp || null,
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
        number: notifyWhatsapp.includes("@")
          ? notifyWhatsapp
          : notifyWhatsapp.replace(/\D/g, ""),
        text: buildNotificationCard(lead, submissionId),
        delay: 1000,
        linkPreview: false,
      }),
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(apiError("evolution", response, body));
    return { status: "sent", notify_whatsapp: notifyWhatsapp };
  } catch (error) {
    console.error("[apr-submit] Evolution failed", error);
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      notify_whatsapp: notifyWhatsapp,
    };
  }
}

function buildNotificationCard(lead: NormalizedLead, submissionId: string) {
  return [
    "Novo lead no Simulador APR",
    "",
    `Nome: ${lead.nome}`,
    `Instagram: ${lead.instagram}`,
    `WhatsApp: +${lead.whatsapp_e164}`,
    `Procedimento: ${lead.procedure}`,
    `Hoje: ${
      lead.current_surgeries_label || lead.current_surgeries_month
    } cirurgias | R$ ${lead.current_revenue.toLocaleString("pt-BR")}/mês`,
    `Meta: ${
      lead.desired_surgeries_label || lead.desired_surgeries_month
    } cirurgias | R$ ${lead.goal_revenue.toLocaleString("pt-BR")}/mês`,
    `Potencial: +R$ ${lead.growth_revenue.toLocaleString("pt-BR")}/mês`,
    `Origem: ${lead.main_source || "Não informado"}`,
    `Prioridade: ${lead.priority || "Não calculada"}`,
    "",
    `ID: ${submissionId.slice(0, 8).toUpperCase()}`,
  ].join("\n");
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
  expectedHeaders: string[],
) {
  const lastColumn = columnName(expectedHeaders.length);
  const range = encodeURIComponent(`${tabName}!A1:${lastColumn}1`);
  const current = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
    accessToken,
  ).catch(() => null);
  const headers = current?.values?.[0] || [];
  if (headers.join("|") === expectedHeaders.join("|")) return;

  await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    accessToken,
    {
      method: "PUT",
      body: JSON.stringify({ values: [expectedHeaders] }),
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

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function apiError(service: string, response: Response, body: unknown) {
  const detail = typeof body === "string" ? body : JSON.stringify(body);
  return `${service} ${response.status}: ${detail}`;
}

function columnName(index: number) {
  let name = "";
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function parseDateParam(value: string | null) {
  const cleaned = cleanText(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : "";
}

function nextDateIso(date: string) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function normalizeDashboardRow(row: Record<string, unknown>) {
  const rawPayload = isRecord(row.raw_payload) ? row.raw_payload : {};
  const rawLead = isRecord(rawPayload.lead) ? rawPayload.lead : {};
  const answers = isRecord(rawPayload.form_answers)
    ? rawPayload.form_answers
    : {};

  return {
    id: row.id,
    created_at: row.created_at,
    nome: row.nome,
    email: cleanText(rawLead.email ?? answers.email, 240),
    instagram: row.instagram,
    whatsapp: row.whatsapp,
    whatsapp_e164: row.whatsapp_e164,
    procedure: row.procedure,
    clinic_owner: cleanText(
      answers.clinica_propria ?? answers.clinic_owner,
      80,
    ),
    monthly_revenue_label: cleanText(answers.faturamento_medio_mensal, 120) ||
      cleanText(row.current_ticket_label, 120),
    monthly_revenue_value: cleanText(
      answers.faturamento_medio_mensal_valor,
      120,
    ),
    surgeries_sold_label: cleanText(answers.cirurgias_vendidas_por_mes, 80) ||
      cleanText(row.current_surgeries_label, 80),
    current_surgeries_label: row.current_surgeries_label,
    current_surgeries_month: Number(row.current_surgeries_month || 0),
    current_average_ticket: Number(row.current_average_ticket || 0),
    current_revenue: Number(row.current_revenue || 0),
    desired_surgeries_label: row.desired_surgeries_label,
    desired_surgeries_month: Number(row.desired_surgeries_month || 0),
    desired_average_ticket: Number(row.desired_average_ticket || 0),
    goal_revenue: Number(row.goal_revenue || 0),
    growth_surgeries: Number(row.growth_surgeries || 0),
    growth_revenue: Number(row.growth_revenue || 0),
    evaluations_month: Number(row.evaluations_month || 0),
    estimated_conversion: Number(row.estimated_conversion || 0),
    main_source: row.main_source || "",
    first_contact_owner: row.first_contact_owner || "",
    followup_process: row.followup_process || "",
    priority: row.priority || "",
    utm_source: row.utm_source || "",
    utm_medium: row.utm_medium || "",
    utm_campaign: row.utm_campaign || "",
    sheet_status: row.sheet_status || "",
    whatsapp_status: row.whatsapp_status || "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildTotals(rows: ReturnType<typeof normalizeDashboardRow>[]) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if (String(row.created_at || "").slice(0, 10) === today) acc.today += 1;
    acc.current_revenue += row.current_revenue;
    acc.goal_revenue += row.goal_revenue;
    acc.growth_revenue += row.growth_revenue;
    acc.growth_surgeries += row.growth_surgeries;
    return acc;
  }, {
    total: 0,
    today: 0,
    current_revenue: 0,
    goal_revenue: 0,
    growth_revenue: 0,
    growth_surgeries: 0,
  });
}

function countBy(
  rows: ReturnType<typeof normalizeDashboardRow>[],
  key: "procedure" | "main_source" | "priority",
) {
  const counts: Record<string, number> = {};
  rows.forEach((row) => {
    const value = String(row[key] || "Não informado");
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
