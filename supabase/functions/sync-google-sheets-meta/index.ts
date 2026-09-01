// ============================================================
// sync-google-sheets-meta — helper backend para o dialog de
// "Conectar planilha". Recebe spreadsheet_id e devolve:
//   - title da planilha + lista de abas
//   - opcionalmente, preview de até N linhas de uma aba
//
// Autentica via Service Account (mesma SA do sync). Mantém token
// Google e private key fora do client.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  authorizationErrorResponse,
  requireOrganizationMember,
} from "../_shared/organization-auth.ts";
import {
  readJsonObject,
  rejectRateLimited,
  RequestValidationError,
  requestValidationResponse,
} from "../_shared/request-security.ts";

// Token cache local — recriado a cada cold-start, dura ~horas no warm.
let cachedToken: { token: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const b64 = typeof input === "string"
    ? btoa(input)
    : btoa(String.fromCharCode(...input));
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getServiceAccountAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const email = Deno.env.get("GOOGLE_SA_EMAIL");
  const privateKeyPem = Deno.env.get("GOOGLE_SA_PRIVATE_KEY");
  if (!email || !privateKeyPem) {
    throw new Error(
      "GOOGLE_SA_EMAIL ou GOOGLE_SA_PRIVATE_KEY não configurados",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encClaims}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sigBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sig = base64UrlEncode(new Uint8Array(sigBuffer));
  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(
      `Falha ao obter token SA: ${tokenRes.status} ${errText.slice(0, 200)}`,
    );
  }

  const data = await tokenRes.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  const rateRejection = rejectRateLimited(
    req,
    "sync-google-sheets-meta",
    30,
    60_000,
    corsHeaders,
  );
  if (rateRejection) return rateRejection;

  try {
    const body = await readJsonObject(req, 8 * 1024);
    const organizationId = uuid(body.organization_id, "organization_id");
    const spreadsheetId = spreadsheetIdentifier(body.spreadsheet_id);
    const sheetName = typeof body.sheet_name === "string"
      ? body.sheet_name.trim().slice(0, 200)
      : "";
    const preview = body.preview === true;
    const requestedHeaderRow = Number(body.header_row ?? 1);
    const headerRow = Number.isInteger(requestedHeaderRow)
      ? Math.min(Math.max(requestedHeaderRow, 1), 1000)
      : 1;

    if (preview && !sheetName) {
      throw new RequestValidationError(
        400,
        "sheet_name é obrigatório para preview",
      );
    }

    const supabase = createSupabaseAdmin();
    await requireOrganizationMember(req, supabase, organizationId);
    const accessToken = await getServiceAccountAccessToken();

    if (preview) {
      const range = `${encodeURIComponent(sheetName)}!A1:Z${headerRow + 5}`;
      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?majorDimension=ROWS`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        console.error(
          "[sync-google-sheets-meta] preview failed",
          response.status,
        );
        throw googleApiError(response.status);
      }

      const data = await response.json();
      const values = Array.isArray(data?.values)
        ? data.values.slice(0, 6).map((row: unknown) =>
          Array.isArray(row)
            ? row.slice(0, 26).map((cell) => String(cell).slice(0, 500))
            : []
        )
        : [];
      return json({ values });
    }

    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      console.error(
        "[sync-google-sheets-meta] metadata failed",
        response.status,
      );
      throw googleApiError(response.status);
    }

    const metadata = await response.json();
    const sheets = Array.isArray(metadata?.sheets)
      ? metadata.sheets.slice(0, 250).map((sheet: any) => ({
        sheetId: Number(sheet?.properties?.sheetId ?? 0),
        title: String(sheet?.properties?.title ?? "").slice(0, 200),
        rowCount: Math.max(
          0,
          Number(sheet?.properties?.gridProperties?.rowCount ?? 0),
        ),
      }))
      : [];

    return json({
      title: String(metadata?.properties?.title ?? "").slice(0, 200),
      sheets,
    });
  } catch (error) {
    const authResponse = authorizationErrorResponse(error, corsHeaders);
    if (authResponse) return authResponse;
    const validationResponse = requestValidationResponse(error, corsHeaders);
    if (validationResponse) return validationResponse;

    console.error("[sync-google-sheets-meta] request failed", error);
    return json({ error: "Não foi possível consultar a planilha" }, 502);
  }
});

function uuid(value: unknown, field: string): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(candidate)
  ) {
    throw new RequestValidationError(400, `${field} inválido`);
  }
  return candidate;
}

function spreadsheetIdentifier(value: unknown): string {
  const candidate = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(candidate)) {
    throw new RequestValidationError(400, "spreadsheet_id inválido");
  }
  return candidate;
}

function googleApiError(status: number): RequestValidationError {
  if (status === 403) {
    return new RequestValidationError(
      403,
      "Sem permissão para acessar a planilha",
    );
  }
  if (status === 404) {
    return new RequestValidationError(404, "Planilha não encontrada");
  }
  return new RequestValidationError(502, "Google Sheets indisponível");
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
