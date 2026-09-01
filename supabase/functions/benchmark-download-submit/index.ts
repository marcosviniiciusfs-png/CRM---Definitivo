import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  readJsonObject,
  rejectDisallowedOrigin,
  rejectRateLimited,
  requestValidationResponse,
} from "../_shared/request-security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ success: false, error: "Método não permitido." }, 405);
  }

  const originRejection = rejectDisallowedOrigin(request, corsHeaders);
  if (originRejection) return originRejection;
  const rateRejection = rejectRateLimited(
    request,
    "benchmark-download-submit",
    10,
    10 * 60_000,
    corsHeaders,
  );
  if (rateRejection) return rateRejection;

  let payload: Record<string, unknown>;
  try {
    payload = await readJsonObject(request, 24 * 1024);
  } catch (error) {
    return requestValidationResponse(error, corsHeaders) ??
      json({ success: false, error: "Payload inválido." }, 400);
  }

  // Campo invisível usado apenas como proteção simples contra bots.
  if (text(payload.website, 120)) return json({ success: true });

  const nome = text(payload.nome, 140);
  const email = text(payload.email, 180).toLowerCase();
  const telefone = text(payload.telefone, 40);
  const phoneDigits = telefone.replace(/\D/g, "");
  const assetSlug = text(payload.asset_slug, 120) ||
    "wow-document-harmonizacao-facial";

  if (nome.length < 2) {
    return json({ success: false, error: "Informe seu nome." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ success: false, error: "Informe um e-mail válido." }, 400);
  }
  if (phoneDigits.length < 10 || phoneDigits.length > 15) {
    return json({
      success: false,
      error: "Informe um telefone válido com DDD.",
    }, 400);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(assetSlug)) {
    return json({ success: false, error: "Material inválido." }, 400);
  }
  if (payload.consentimento_lgpd !== true) {
    return json({
      success: false,
      error: "Aceite o uso dos dados para continuar.",
    }, 400);
  }

  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("benchmark_download_leads")
    .insert({
      nome,
      email,
      telefone,
      asset_slug: assetSlug,
      consentimento_lgpd: true,
      utm_source: text(payload.utm_source, 160) || null,
      utm_medium: text(payload.utm_medium, 160) || null,
      utm_campaign: text(payload.utm_campaign, 160) || null,
      utm_content: text(payload.utm_content, 160) || null,
      utm_term: text(payload.utm_term, 160) || null,
      landing_url: text(payload.landing_url, 500) || null,
      referrer_url: text(payload.referrer_url, 500) || null,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) || null,
      raw_payload: {
        asset_slug: assetSlug,
        utm_source: text(payload.utm_source, 160) || null,
        utm_medium: text(payload.utm_medium, 160) || null,
        utm_campaign: text(payload.utm_campaign, 160) || null,
        utm_content: text(payload.utm_content, 160) || null,
        utm_term: text(payload.utm_term, 160) || null,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[benchmark-download-submit] insert failed", error);
    return json({
      success: false,
      error: "Não foi possível liberar o acesso agora.",
    }, 500);
  }

  return json({ success: true, submission_id: data.id });
});

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
