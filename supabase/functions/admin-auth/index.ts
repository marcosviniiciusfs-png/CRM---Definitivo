import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token",
};

// Segredo para assinar JWTs admin (deve ser configurado como secret no Supabase)
async function getAdminSecret(): Promise<CryptoKey> {
  const secret = Deno.env.get("ADMIN_JWT_SECRET") || "kairoz-admin-secret-key-2026-change-me";
  const encoder = new TextEncoder();
  return await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    // ── ACTION: login ────────────────────────────────────────────────
    if (action === "login") {
      const { email, password } = body;

      if (!email || !password) {
        return new Response(
          JSON.stringify({ error: "Email e senha são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Verificar credenciais via função SQL (bcrypt)
      const { data: isValid, error: verifyError } = await adminClient.rpc(
        "verify_admin_credentials",
        { p_email: email, p_password: password }
      );

      if (verifyError) {
        console.error("[admin-auth] verify error:", verifyError);
        return new Response(
          JSON.stringify({ error: "Erro interno ao verificar credenciais" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: "Email ou senha incorretos" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Gerar token JWT admin com expiração de 8 horas
      const key = await getAdminSecret();
      const now = Math.floor(Date.now() / 1000);
      const token = await create(
        { alg: "HS256", typ: "JWT" },
        {
          sub: email.toLowerCase().trim(),
          iat: now,
          exp: now + 8 * 60 * 60, // 8h
          role: "admin",
        },
        key
      );

      return new Response(
        JSON.stringify({ success: true, token, email: email.toLowerCase().trim() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: verify ───────────────────────────────────────────────
    // Verifica se um token admin é válido
    if (action === "verify") {
      const { token } = body;
      if (!token) {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const key = await getAdminSecret();
        const payload = await verify(token, key);
        return new Response(
          JSON.stringify({ valid: true, email: payload.sub }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ valid: false }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── ACTION: create ───────────────────────────────────────────────
    // Cria/atualiza credencial admin. Requer token admin válido no header.
    if (action === "create") {
      // Verificar autenticação do chamador (deve ser admin logado)
      const adminToken = req.headers.get("x-admin-token");
      if (!adminToken) {
        return new Response(
          JSON.stringify({ error: "Token admin necessário" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const key = await getAdminSecret();
        await verify(adminToken, key);
      } catch {
        return new Response(
          JSON.stringify({ error: "Token admin inválido ou expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { email: newEmail, password: newPassword } = body;
      if (!newEmail || !newPassword) {
        return new Response(
          JSON.stringify({ error: "Email e senha são obrigatórios" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (newPassword.length < 8) {
        return new Response(
          JSON.stringify({ error: "Senha deve ter pelo menos 8 caracteres" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await adminClient.rpc("upsert_admin_credential", {
        p_email: newEmail,
        p_password: newPassword,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error || "Erro ao criar admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "Admin criado/atualizado com sucesso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: list ─────────────────────────────────────────────────
    if (action === "list") {
      const adminToken = req.headers.get("x-admin-token");
      if (!adminToken) {
        return new Response(
          JSON.stringify({ error: "Token admin necessário" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      try {
        const key = await getAdminSecret();
        await verify(adminToken, key);
      } catch {
        return new Response(
          JSON.stringify({ error: "Token admin inválido ou expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await adminClient.rpc("list_admin_credentials");
      if (error) throw error;

      return new Response(
        JSON.stringify({ admins: data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── ACTION: delete ───────────────────────────────────────────────
    if (action === "delete") {
      const adminToken = req.headers.get("x-admin-token");
      if (!adminToken) {
        return new Response(
          JSON.stringify({ error: "Token admin necessário" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let callerEmail: string;
      try {
        const key = await getAdminSecret();
        const payload = await verify(adminToken, key);
        callerEmail = payload.sub as string;
      } catch {
        return new Response(
          JSON.stringify({ error: "Token admin inválido ou expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { email: targetEmail } = body;
      if (!targetEmail) {
        return new Response(
          JSON.stringify({ error: "Email do admin a remover é obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Impedir auto-remoção
      if (targetEmail.toLowerCase().trim() === callerEmail.toLowerCase().trim()) {
        return new Response(
          JSON.stringify({ error: "Você não pode remover sua própria conta admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data, error } = await adminClient.rpc("delete_admin_credential", {
        p_email: targetEmail,
      });
      if (error) throw error;

      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        return new Response(
          JSON.stringify({ error: result.error || "Erro ao remover admin" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[admin-auth] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
