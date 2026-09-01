import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";

type Payload = Record<string, unknown>;

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };
const SOURCE_SLUG = "link-bio-marcos";
const DEFAULT_SHEET_ID = "1KRIErZDbVQ8k9HvFJoTu2ydTqpLnR9amyFK0qV6eyIk";
const DEFAULT_SHEET_TAB = "Link Bio Marcos";
const SHEET_HEADERS = [
  "Recebido em",
  "Nome",
  "E-mail",
  "Telefone",
  "Cargo",
  "Segmento",
  "Faturamento",
  "Origem",
  "UTM Source",
  "UTM Medium",
  "UTM Campaign",
  "UTM Content",
  "UTM Term",
  "Landing URL",
  "Referrer",
  "Submission ID",
];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  let payload: Payload;
  try {
    payload = await request.json();
  } catch {
    return json({ success: false, error: "Payload inválido." }, 400);
  }

  if (cleanText(payload.website, 120)) return json({ success: true });

  const lead = normalizeLead(payload);
  const validationError = validateLead(lead);
  if (validationError) return json({ success: false, error: validationError }, 400);

  const submissionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("lead_capture_submissions")
    .insert({
      source_type: "landing_page",
      source_slug: SOURCE_SLUG,
      source_record_id: submissionId,
      nome: lead.nome,
      email: lead.email,
      telefone: lead.telefone,
      landing_url: lead.landing_url || null,
      utm_source: lead.utm_source || null,
      utm_medium: lead.utm_medium || null,
      utm_campaign: lead.utm_campaign || null,
      utm_content: lead.utm_content || null,
      utm_term: lead.utm_term || null,
      answers: {
        cargo: lead.cargo || null,
        segmento: lead.segmento || null,
        faturamento: lead.faturamento || null,
        origem: lead.origem || null,
        referrer_url: lead.referrer_url || null,
      },
      raw_payload: {
        ...payload,
        user_agent: request.headers.get("user-agent"),
        received_at: createdAt,
      },
      created_at: createdAt,
    })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[link-bio-marcos-submit] lead insert failed", error);
    return json({ success: false, error: "Não foi possível salvar o lead agora." }, 500);
  }

  const sheet = await appendLeadToSheet(lead, String(data.id), String(data.created_at || createdAt));

  return json({
    success: true,
    submission_id: data.id,
    sheet_status: sheet.status,
    sheet_row_range: sheet.row_range || "",
  });
});

function normalizeLead(payload: Payload) {
  const tracking = isRecord(payload.tracking) ? payload.tracking : {};
  const telefone = normalizePhone(
    cleanText(payload.telefone_e164, 40) ||
      cleanText(payload.telefone, 40),
  );

  return {
    nome: cleanText(payload.nome, 140),
    email: cleanText(payload.email, 180).toLowerCase(),
    telefone,
    cargo: cleanText(payload.cargo, 120),
    segmento: cleanText(payload.segmento, 120),
    faturamento: cleanText(payload.faturamento, 120),
    origem: cleanText(payload.origem, 120) || cleanText(tracking.origem, 120) || SOURCE_SLUG,
    landing_url: cleanText(payload.landing_url, 500),
    referrer_url: cleanText(payload.referrer_url, 500),
    utm_source: cleanText(payload.utm_source, 160) || cleanText(tracking.utm_source, 160),
    utm_medium: cleanText(payload.utm_medium, 160) || cleanText(tracking.utm_medium, 160),
    utm_campaign: cleanText(payload.utm_campaign, 160) || cleanText(tracking.utm_campaign, 160),
    utm_content: cleanText(payload.utm_content, 160) || cleanText(tracking.utm_content, 160),
    utm_term: cleanText(payload.utm_term, 160) || cleanText(tracking.utm_term, 160),
  };
}

function validateLead(lead: ReturnType<typeof normalizeLead>) {
  const phoneDigits = lead.telefone.replace(/\D/g, "");
  if (lead.nome.length < 2) return "Informe seu nome.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lead.email)) return "Informe um e-mail válido.";
  if (phoneDigits.length < 10 || phoneDigits.length > 15) return "Informe um telefone válido com DDD.";
  return "";
}

async function appendLeadToSheet(
  lead: ReturnType<typeof normalizeLead>,
  submissionId: string,
  createdAt: string,
) {
  const spreadsheetId = Deno.env.get("LINK_BIO_MARCOS_SHEET_ID") ||
    Deno.env.get("PUBLIC_LEADS_SHEET_ID") ||
    Deno.env.get("LEADS_SHEET_ID") ||
    Deno.env.get("APR_SHEET_ID") ||
    DEFAULT_SHEET_ID;
  const tabName = Deno.env.get("LINK_BIO_MARCOS_SHEET_TAB") || DEFAULT_SHEET_TAB;

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
    await ensureSheetHeaders(spreadsheetId, tabName, accessToken, SHEET_HEADERS);
    const appendResponse = await googleSheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${
        encodeURIComponent(`${tabName}!A1`)
      }:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          values: [[
            createdAt || new Date().toISOString(),
            lead.nome,
            lead.email,
            lead.telefone,
            lead.cargo,
            lead.segmento,
            lead.faturamento,
            lead.origem,
            lead.utm_source,
            lead.utm_medium,
            lead.utm_campaign,
            lead.utm_content,
            lead.utm_term,
            lead.landing_url,
            lead.referrer_url,
            submissionId,
          ]],
        }),
      },
    );

    return {
      status: "sent",
      row_range: String(appendResponse?.updates?.updatedRange || ""),
    };
  } catch (error) {
    console.error("[link-bio-marcos-submit] Sheets failed", error);
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

async function ensureSheetTab(spreadsheetId: string, tabName: string, accessToken: string) {
  const metadata = await googleSheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title)`,
    accessToken,
  );
  const exists = metadata?.sheets?.some((sheet: Record<string, unknown>) =>
    isRecord(sheet.properties) && sheet.properties.title === tabName
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

async function ensureSheetHeaders(spreadsheetId: string, tabName: string, accessToken: string, expectedHeaders: string[]) {
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

async function googleSheetsFetch(url: string, accessToken: string, options: RequestInit = {}) {
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

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.replace(/\D/g, "")}`;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function apiError(service: string, response: Response, body: unknown) {
  const detail = typeof body === "string" ? body : JSON.stringify(body);
  return `${service} ${response.status}: ${detail}`;
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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
