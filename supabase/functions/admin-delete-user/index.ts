/**
 * Edge Function: admin-delete-user
 *
 * Exclui permanentemente um usuário do CRM e todos os dados associados:
 * - Organização e membros
 * - Leads, funis, configurações
 * - Conta no Supabase Auth
 *
 * Requer: admin_token válido + admin_password para confirmação.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-admin-token",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const errorResp = (msg: string, status = 400) =>
        new Response(JSON.stringify({ error: msg }), {
            status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const body = await req.json();
        const { target_user_id, admin_token, admin_password } = body;

        if (!target_user_id) return errorResp("target_user_id é obrigatório");
        if (!admin_token) return errorResp("admin_token é obrigatório", 401);

        // 1. Validar token admin
        const { data: isValid, error: tokenError } = await adminClient.rpc(
            "validate_admin_token",
            { p_token: admin_token }
        );
        if (tokenError || !isValid) {
            return errorResp("Token admin inválido ou expirado", 401);
        }

        // 2. Validar senha admin (se fornecida) via RPC
        if (admin_password) {
            const { data: session } = await adminClient
                .from("admin_sessions")
                .select("admin_email")
                .eq("token", admin_token)
                .gt("expires_at", new Date().toISOString())
                .maybeSingle();

            if (session?.admin_email) {
                const { data: pwValid } = await adminClient.rpc(
                    "admin_verify_password",
                    {
                        p_email: session.admin_email,
                        p_password: admin_password,
                    }
                );
                if (!pwValid) {
                    return errorResp("Senha de administrador incorreta", 401);
                }
            }
        }

        // 3. Buscar organização do usuário
        const { data: profile } = await adminClient
            .from("profiles")
            .select("organization_id")
            .eq("id", target_user_id)
            .maybeSingle();

        const orgId = profile?.organization_id;

        let deletedUsers = 0;

        if (orgId) {
            // 4a. Buscar todos os membros da organização
            const { data: members } = await adminClient
                .from("organization_members")
                .select("user_id")
                .eq("organization_id", orgId);

            const memberUserIds: string[] = (members || [])
                .map((m: any) => m.user_id)
                .filter(Boolean);

            // 4b. Deletar dados da organização em cascata com service_role
            await adminClient.from("leads").delete().eq("organization_id", orgId);
            await adminClient.from("funnels").delete().eq("organization_id", orgId);
            await adminClient.from("agent_distribution_settings").delete().eq("organization_id", orgId);
            await adminClient.from("lead_distribution_configs").delete().eq("organization_id", orgId);
            await adminClient.from("facebook_integrations").delete().eq("organization_id", orgId);
            await adminClient.from("organization_members").delete().eq("organization_id", orgId);

            // Limpar dados dos membros
            for (const uid of memberUserIds) {
                await adminClient.from("profiles").delete().eq("id", uid);
                await adminClient.from("subscriptions").delete().eq("user_id", uid);
                await adminClient.from("user_section_access").delete().eq("user_id", uid);
            }

            // Deletar a organização
            await adminClient.from("organizations").delete().eq("id", orgId);

            // 4c. Deletar contas auth dos membros (exceto o target principal)
            for (const uid of memberUserIds) {
                if (uid !== target_user_id) {
                    try {
                        await adminClient.auth.admin.deleteUser(uid);
                        deletedUsers++;
                    } catch (_) {
                        // continuar mesmo se falhar
                    }
                }
            }
        } else {
            // Sem organização: limpar apenas dados do próprio usuário
            await adminClient.from("profiles").delete().eq("id", target_user_id);
            await adminClient.from("subscriptions").delete().eq("user_id", target_user_id);
            await adminClient.from("user_section_access").delete().eq("user_id", target_user_id);
        }

        // 5. Deletar o usuário principal do Auth
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(target_user_id);
        if (deleteAuthError) throw deleteAuthError;
        deletedUsers++;

        return new Response(
            JSON.stringify({
                success: true,
                deleted_users: deletedUsers,
                message: `${deletedUsers} usuário(s) excluído(s) com sucesso`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error: any) {
        console.error("[admin-delete-user] Error:", error);
        return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
