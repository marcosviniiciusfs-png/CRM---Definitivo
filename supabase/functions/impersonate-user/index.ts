// Entrar como usuário, para suporte (Fase 6 do plano 2026-11-16-kairoz-consorcio).
//
// POST { target_user_id, reason }
//   - exige o JWT de um usuário logado (não deve ficar em EDGE_JWT_EXEMPT_FUNCTIONS);
//   - quem chama precisa ter o papel super_admin em user_roles (o painel com senha própria não vale);
//   - o alvo precisa existir, ter e-mail confirmado e não ser super admin;
//   - registra o acesso em impersonation_logs e devolve só o token_hash de uso único de um magic link.
// Nunca devolve a URL do link nem outros segredos.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizationErrorResponse,
  requireSuperAdmin,
} from "../_shared/organization-auth.ts";
import {
  readJsonObject,
  rejectRateLimited,
  requestValidationResponse,
} from "../_shared/request-security.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fail = (status: number, error: string) => json({ error }, status);

interface Membership {
  organization_id: string;
  role: string;
  created_at: string | null;
  organizations: { name: string | null } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return fail(405, "Método não permitido.");

  const limited = rejectRateLimited(req, "impersonate-user", 10, 60_000, corsHeaders);
  if (limited) return limited;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[impersonate-user] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
    return fail(500, "Não foi possível entrar na conta. Tente novamente.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { user: actor } = await requireSuperAdmin(req, admin);
    const body = await readJsonObject(req, 8 * 1024);

    const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!UUID_RE.test(targetUserId)) return fail(400, "Usuário inválido. Abra a ficha do usuário de novo.");
    if (reason.length < 5) return fail(400, "Escreva o motivo do acesso, com pelo menos 5 letras.");
    if (reason.length > 500) return fail(400, "Encurte o motivo para até 500 caracteres.");
    if (targetUserId === actor.id) return fail(400, "Você já está na sua conta.");

    const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
    const target = targetData?.user;
    if (targetError || !target) return fail(404, "Usuário não encontrado.");
    if (!target.email) return fail(422, "Este usuário não tem e-mail. Não dá para entrar na conta dele.");
    if (!target.email_confirmed_at) {
      return fail(422, "Este usuário ainda não confirmou o e-mail. Não dá para entrar na conta dele.");
    }
    const bannedUntil = (target as { banned_until?: string | null }).banned_until;
    if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) {
      return fail(409, "Este usuário está bloqueado. Não dá para entrar na conta dele.");
    }

    const { data: targetRole, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (roleError) throw roleError;
    if (targetRole) return fail(403, "Não dá para entrar na conta de outro super admin.");

    // Mesma escolha do front (OrganizationContext): dono, depois admin, depois a mais antiga.
    const { data: memberships, error: membershipError } = await admin
      .from("organization_members")
      .select("organization_id, role, created_at, organizations(name)")
      .eq("user_id", targetUserId)
      .eq("is_active", true);
    if (membershipError) throw membershipError;

    const primary = ((memberships ?? []) as unknown as Membership[]).sort((a, b) => {
      const byRole = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      if (byRole !== 0) return byRole;
      const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (aTs !== bTs) return aTs - bTs;
      return a.organization_id.localeCompare(b.organization_id);
    })[0] ?? null;

    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("user_id", targetUserId)
      .maybeSingle();

    const metadataName = typeof target.user_metadata?.full_name === "string"
      ? target.user_metadata.full_name
      : null;
    const name = (profile?.full_name || metadataName || target.email).trim();

    const userAgent = (req.headers.get("user-agent") ?? "").slice(0, 500) || null;
    const { data: log, error: logError } = await admin
      .from("impersonation_logs")
      .insert({
        actor_user_id: actor.id,
        target_user_id: targetUserId,
        target_organization_id: primary?.organization_id ?? null,
        reason,
        user_agent: userAgent,
      })
      .select("id")
      .single();
    if (logError || !log) {
      console.error("[impersonate-user] falha ao registrar o acesso", logError);
      return fail(500, "Não foi possível registrar o acesso. Tente novamente.");
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
      console.error("[impersonate-user] falha ao gerar o link", linkError?.message);
      await admin.from("impersonation_logs").update({ ended_at: new Date().toISOString() }).eq("id", log.id);
      return fail(502, "Não foi possível entrar na conta. Tente novamente.");
    }

    console.log(`[impersonate-user] acesso ${log.id}: ${actor.id} -> ${targetUserId}`);

    return json({
      token_hash: tokenHash,
      log_id: log.id,
      target: {
        name,
        email: target.email,
        organization_name: primary?.organizations?.name ?? null,
      },
    });
  } catch (error) {
    const authResponse = authorizationErrorResponse(error, corsHeaders);
    if (authResponse) {
      // Mensagens do helper compartilhado traduzidas para o guia de escrita.
      if (authResponse.status === 403) return fail(403, "Só super admins podem entrar na conta de um usuário.");
      return fail(authResponse.status, "Sua sessão expirou. Entre de novo e tente outra vez.");
    }
    const validationResponse = requestValidationResponse(error, corsHeaders);
    if (validationResponse) return validationResponse;
    console.error("[impersonate-user] erro", error instanceof Error ? error.message : error);
    return fail(500, "Não foi possível entrar na conta. Tente novamente.");
  }
});
