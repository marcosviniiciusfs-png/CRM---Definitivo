import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizationErrorResponse,
  requireOrganizationMember,
} from "../_shared/organization-auth.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  readJsonObject,
  requestValidationResponse,
} from "../_shared/request-security.ts";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  try {
    const body = await readJsonObject(req, 32 * 1024);
    const organizationId = cleanUuid(body.organization_id);
    if (!organizationId) {
      return json({ error: "organization_id inválido" }, 400);
    }

    const supabase = createSupabaseAdmin();
    await requireOrganizationMember(req, supabase, organizationId);

    const webhookUrl = getWebhookUrl();
    const webhookToken = Deno.env.get("CONVEX_WEBHOOK_TOKEN")?.trim();
    if (!webhookToken) {
      throw new Error("CONVEX_WEBHOOK_TOKEN não configurado");
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${webhookToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      console.error("[convex-proxy] upstream request failed", response.status);
      return json({ error: "Integração externa indisponível" }, 502);
    }

    await response.body?.cancel();
    return json({ success: true });
  } catch (error) {
    const authResponse = authorizationErrorResponse(error, corsHeaders);
    if (authResponse) return authResponse;

    const validationResponse = requestValidationResponse(error, corsHeaders);
    if (validationResponse) return validationResponse;

    console.error("[convex-proxy] request failed", error);
    return json({ error: "Não foi possível concluir a integração" }, 500);
  }
});

function cleanUuid(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(candidate)
    ? candidate
    : "";
}

function getWebhookUrl(): URL {
  const configured = Deno.env.get("CONVEX_WEBHOOK_URL")?.trim();
  if (!configured) throw new Error("CONVEX_WEBHOOK_URL não configurada");

  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("CONVEX_WEBHOOK_URL inválida");
  }
  return url;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}
