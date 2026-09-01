import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import {
  getAllowedFrontendOrigin,
  verifyOAuthState,
} from "../_shared/oauth-state.ts";
import { getSupabasePublicUrl } from "../_shared/supabase-urls.ts";

interface GoogleTokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
}

serve(async (req) => {
  let redirectOrigin = getAllowedFrontendOrigin();

  try {
    if (req.method !== "GET") throw new Error("Método não permitido");

    const requestUrl = new URL(req.url);
    const state = requestUrl.searchParams.get("state");
    if (!state) throw new Error("State ausente");

    const stateData = await verifyOAuthState(state);
    redirectOrigin = stateData.origin;

    if (requestUrl.searchParams.get("error")) {
      return redirect(redirectOrigin, { error: "access_denied" });
    }

    const code = requestUrl.searchParams.get("code");
    if (!code) throw new Error("Código ausente");

    const redirectUri =
      `${getSupabasePublicUrl()}/functions/v1/google-sheets-oauth-callback`;
    if (stateData.redirect_uri !== redirectUri) {
      throw new Error("Redirect URI do state é inválida");
    }

    const supabase = createSupabaseAdmin();
    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("id")
      .eq("user_id", stateData.user_id)
      .eq("organization_id", stateData.organization_id)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError || !membership) {
      throw new Error("Membership OAuth inválido");
    }

    const googleClientId = requiredSecret("GOOGLE_CLIENT_ID");
    const googleClientSecret = requiredSecret("GOOGLE_CLIENT_SECRET");
    const encryptionKey = requiredEncryptionKey();

    const tokenResponse = await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!tokenResponse.ok) {
      await tokenResponse.body?.cancel();
      console.error(
        "[google-sheets-oauth-callback] token exchange failed",
        tokenResponse.status,
      );
      throw new Error("Falha na troca do código OAuth");
    }

    const tokens = await tokenResponse.json() as GoogleTokenResponse;
    const accessToken = typeof tokens.access_token === "string"
      ? tokens.access_token
      : "";
    const refreshToken = typeof tokens.refresh_token === "string"
      ? tokens.refresh_token
      : "";
    if (!accessToken || !refreshToken) {
      throw new Error("Resposta OAuth incompleta");
    }

    const expiresIn = Number(tokens.expires_in);
    const expiresAt = new Date(
      Date.now() +
        (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) *
          1000,
    ).toISOString();
    const googleEmail = await fetchGoogleEmail(accessToken);

    const { data: integration, error: insertError } = await supabase
      .from("google_sheets_integrations")
      .insert({
        organization_id: stateData.organization_id,
        user_id: stateData.user_id,
        google_email: googleEmail,
        token_expires_at: expiresAt,
        is_active: false,
        last_error: null,
      })
      .select("id")
      .single();

    if (insertError || !integration) {
      throw new Error("Falha ao criar integração Google Sheets");
    }

    const { error: tokenError } = await supabase
      .from("google_sheets_tokens")
      .upsert({
        integration_id: integration.id,
        encrypted_access_token: await encryptToken(
          accessToken,
          encryptionKey,
        ),
        encrypted_refresh_token: await encryptToken(
          refreshToken,
          encryptionKey,
        ),
        token_expires_at: expiresAt,
      }, { onConflict: "integration_id" });

    if (tokenError) {
      await supabase
        .from("google_sheets_integrations")
        .delete()
        .eq("id", integration.id);
      throw new Error("Falha ao armazenar tokens Google Sheets");
    }

    const { error: activateError } = await supabase
      .from("google_sheets_integrations")
      .update({ is_active: true })
      .eq("id", integration.id);
    if (activateError) {
      await cleanupIntegration(supabase, integration.id);
      throw new Error("Falha ao ativar integração Google Sheets");
    }

    const { error: deactivateError } = await supabase
      .from("google_sheets_integrations")
      .update({ is_active: false })
      .eq("user_id", stateData.user_id)
      .eq("organization_id", stateData.organization_id)
      .neq("id", integration.id);
    if (deactivateError) {
      await cleanupIntegration(supabase, integration.id);
      throw new Error("Falha ao substituir integração anterior");
    }

    return redirect(redirectOrigin, { success: "true" });
  } catch (error) {
    console.error("[google-sheets-oauth-callback] callback failed", error);
    return redirect(redirectOrigin, { error: "callback_failed" });
  }
});

async function encryptToken(
  plain: string,
  encryptionKey: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(encryptionKey),
  );
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoder.encode(plain),
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const body = await response.json();
    return typeof body?.email === "string"
      ? body.email.trim().toLowerCase().slice(0, 320)
      : null;
  } catch {
    return null;
  }
}

async function cleanupIntegration(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  integrationId: string,
): Promise<void> {
  await supabase
    .from("google_sheets_tokens")
    .delete()
    .eq("integration_id", integrationId);
  await supabase
    .from("google_sheets_integrations")
    .delete()
    .eq("id", integrationId);
}

function requiredSecret(name: string): string {
  const value = Deno.env.get(name)?.trim() ?? "";
  if (!value) throw new Error(`${name} não configurado`);
  return value;
}

function requiredEncryptionKey(): string {
  const key = requiredSecret("GOOGLE_SHEETS_ENCRYPTION_KEY");
  if (new TextEncoder().encode(key).length < 32) {
    throw new Error("GOOGLE_SHEETS_ENCRYPTION_KEY deve ter ao menos 32 bytes");
  }
  return key;
}

function redirect(
  origin: string,
  params: Record<string, string>,
): Response {
  const location = new URL("/integrations", getAllowedFrontendOrigin(origin));
  location.searchParams.set("integration", "google_sheets");
  for (const [key, value] of Object.entries(params)) {
    location.searchParams.set(key, value);
  }

  return new Response(null, {
    status: 302,
    headers: {
      "Location": location.toString(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
