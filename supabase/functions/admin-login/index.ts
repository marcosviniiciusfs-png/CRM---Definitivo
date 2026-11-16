/**
 * Edge Function: admin-login
 *
 * Login do painel /admin. Exige as duas coisas:
 *  1. sessão normal do CRM (JWT) de um usuário com super_admin em user_roles;
 *  2. e-mail e senha do painel (admin_credentials) com o MESMO e-mail da conta logada.
 * Limita tentativas por e-mail e por IP (admin_login_secure, no banco).
 * Devolve o token de sessão do painel usado por admin-panel-rpc e pelas funções safe_*.
 *
 * Deploy: verify_jwt = true. Não colocar em EDGE_JWT_EXEMPT_FUNCTIONS.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!jwt) return json({ error: "Entre no CRM com sua conta de super admin antes de abrir o painel." }, 401);

    const { data: authData, error: authError } = await adminClient.auth.getUser(jwt);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Sua sessão do CRM expirou. Entre de novo." }, 401);

    let body: { email?: unknown; password?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Pedido inválido." }, 400);
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password || email.length > 254 || password.length > 200) {
      return json({ error: "Preencha e-mail e senha do painel." }, 400);
    }

    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "desconhecido";

    const { data, error } = await adminClient.rpc("admin_login_secure", {
      p_user_id: user.id,
      p_email: email,
      p_password: password,
      p_ip: ip,
    });
    if (error) {
      console.error("[admin-login] erro ao validar o login:", error.message);
      return json({ error: "Não foi possível validar o acesso agora. Tente de novo." }, 500);
    }

    const result = (data ?? {}) as { token?: string; email?: string; error?: string };
    if (!result.token) return json({ success: false, error: result.error ?? "Acesso negado." }, 401);
    return json({ success: true, token: result.token, email: result.email ?? email });
  } catch (err) {
    console.error("[admin-login] falha inesperada:", err instanceof Error ? err.message : String(err));
    return json({ error: "Não foi possível validar o acesso agora. Tente de novo." }, 500);
  }
});
