import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizationErrorResponse,
  requireInternalServiceRole,
} from "../_shared/organization-auth.ts";

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/**
 * Intentionally unavailable during migration.
 *
 * The legacy backfill reinjected Graph payloads into the hardened Meta
 * webhook without an authentic provider signature. Re-enabling it requires
 * a dedicated internal ingestion path, idempotency review, and explicit
 * operational approval. The target runtime also blocks this function.
 */
Deno.serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  try {
    requireInternalServiceRole(req);
  } catch (error) {
    return authorizationErrorResponse(error, corsHeaders) ??
      json({ error: "Não autorizado" }, 401);
  }

  return json(
    {
      error: "Backfill desativado durante a migração",
      code: "BACKFILL_DISABLED",
    },
    503,
  );
});

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}
