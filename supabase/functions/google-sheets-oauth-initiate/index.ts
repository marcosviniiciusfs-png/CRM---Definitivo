import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  createOAuthState,
  getAllowedFrontendOrigin,
} from "../_shared/oauth-state.ts";
import { getSupabasePublicUrl } from "../_shared/supabase-urls.ts";
import {
  readJsonObject,
  rejectRateLimited,
  RequestValidationError,
  requestValidationResponse,
} from "../_shared/request-security.ts";

const JSON_HEADERS = { ...corsHeaders, "Content-Type": "application/json" };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método não permitido" }, 405);
  }

  const rateRejection = rejectRateLimited(
    req,
    "google-sheets-oauth-initiate",
    20,
    60_000,
    corsHeaders,
  );
  if (rateRejection) return rateRejection;

  try {
    const body = await readJsonObject(req, 8 * 1024);
    const supabase = createSupabaseAdmin();
    const token = bearerToken(req);
    const { data: authData, error: authError } = await supabase.auth.getUser(
      token,
    );
    const user = authData?.user;
    if (authError || !user) {
      throw new RequestValidationError(401, "Token inválido ou expirado");
    }

    const { data: activeOrg } = await supabase
      .from("user_active_org")
      .select("active_organization_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: memberships, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(100);

    if (membershipError || !memberships?.length) {
      throw new RequestValidationError(
        403,
        "Usuário sem organização ativa",
      );
    }

    const activeOrganizationId = activeOrg?.active_organization_id;
    const organizationId = memberships.find((membership) =>
      membership.organization_id === activeOrganizationId
    )?.organization_id ?? memberships[0].organization_id;

    const googleClientId = requiredSecret("GOOGLE_CLIENT_ID");
    requiredSecret("GOOGLE_CLIENT_SECRET");
    if (!googleClientId.endsWith(".apps.googleusercontent.com")) {
      throw new Error("GOOGLE_CLIENT_ID possui formato inválido");
    }

    const redirectUri =
      `${getSupabasePublicUrl()}/functions/v1/google-sheets-oauth-callback`;
    const origin = getAllowedFrontendOrigin(
      typeof body.origin === "string" ? body.origin : undefined,
    );
    const state = await createOAuthState({
      user_id: user.id,
      organization_id: organizationId,
      origin,
      redirect_uri: redirectUri,
    });

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets.readonly",
        "https://www.googleapis.com/auth/drive.readonly",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
    }).toString();

    return json({ authUrl: authUrl.toString() });
  } catch (error) {
    const validationResponse = requestValidationResponse(error, corsHeaders);
    if (validationResponse) return validationResponse;

    console.error("[google-sheets-oauth-initiate] request failed", error);
    return json(
      { error: "Não foi possível iniciar a conexão com o Google" },
      500,
    );
  }
});

function bearerToken(req: Request): string {
  const [scheme, token, extra] =
    (req.headers.get("authorization")?.trim() ?? "").split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw new RequestValidationError(401, "Não autorizado");
  }
  return token;
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}
