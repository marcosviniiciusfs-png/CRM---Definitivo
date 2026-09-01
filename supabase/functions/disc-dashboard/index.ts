import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  rejectRateLimited,
  requestValidationResponse,
  requireSecretHeader,
} from "../_shared/request-security.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: FUNCTION_CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return json({ success: false, error: "Método não permitido" }, 405);
  }

  const url = new URL(req.url);
  try {
    requireSecretHeader(req, "DISC_DASHBOARD_TOKEN", "x-dashboard-token");
  } catch (error) {
    return requestValidationResponse(error, FUNCTION_CORS_HEADERS) ??
      json({ success: false, error: "Não autorizado" }, 401);
  }
  const rateRejection = rejectRateLimited(
    req,
    "disc-dashboard",
    60,
    60_000,
    FUNCTION_CORS_HEADERS,
  );
  if (rateRejection) return rateRejection;

  const supabase = createSupabaseAdmin();
  let query = supabase
    .from("disc_internal_assessments")
    .select(
      "id, assessment_version, nome, email, answers, scores, profile_code, profile_label, report, consentimento_lgpd, source_url, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(
      Math.min(Math.max(Number(url.searchParams.get("limit") || 500), 1), 500),
    );

  const search = cleanText(url.searchParams.get("q"), 120).toLowerCase();
  const profile = cleanText(url.searchParams.get("profile"), 4).toUpperCase();
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"));
  if (search) {
    query = query.or(
      `nome.ilike.%${escapeFilter(search)}%,email.ilike.%${
        escapeFilter(search)
      }%`,
    );
  }
  if (/^[DISC]$/.test(profile)) query = query.eq("profile_code", profile);
  if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
  if (to) query = query.lt("created_at", `${nextDate(to)}T00:00:00.000Z`);

  const { data, error } = await query;
  if (error) {
    console.error("[disc-dashboard] query failed", error);
    return json(
      { success: false, error: "Não foi possível carregar o painel" },
      500,
    );
  }

  const rows = data || [];
  return json({
    success: true,
    generated_at: new Date().toISOString(),
    totals: {
      total: rows.length,
      profiles: rows.reduce((acc: Record<string, number>, row) => {
        acc[row.profile_code] = (acc[row.profile_code] || 0) + 1;
        return acc;
      }, {}),
    },
    rows,
  });
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanText(value: string | null, maxLength: number): string {
  return String(value || "").replace(/[\r\n]/g, " ").trim().slice(0, maxLength);
}

function escapeFilter(value: string): string {
  return value.replace(/[%,()]/g, "");
}

function parseDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
