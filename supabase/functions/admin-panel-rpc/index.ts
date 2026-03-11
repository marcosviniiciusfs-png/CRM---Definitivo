/**
 * Edge Function: admin-panel-rpc
 *
 * Proxy para operações do painel admin que requerem service_role.
 * Aceita o token admin JWT (gerado por admin-auth) e executa
 * operações no banco com permissões de service_role.
 *
 * Isso garante que o painel admin funciona INDEPENDENTE de
 * o usuário estar logado no CRM via Supabase Auth.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type, x-admin-token",
};

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

async function verifyAdminToken(token: string): Promise<boolean> {
    try {
        const key = await getAdminSecret();
        await verify(token, key);
        return true;
    } catch {
        return false;
    }
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    const unauthorized = () =>
        new Response(JSON.stringify({ error: "Acesso não autorizado" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    try {
        const adminToken = req.headers.get("x-admin-token");
        if (!adminToken) return unauthorized();

        const isValid = await verifyAdminToken(adminToken);
        if (!isValid) return unauthorized();

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const body = await req.json();
        const { operation } = body;

        // ── list_all_users ───────────────────────────────────────────────
        if (operation === "list_all_users") {
            const { data, error } = await adminClient.rpc("list_all_users");
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── count_main_users ─────────────────────────────────────────────
        if (operation === "count_main_users") {
            const { data, error } = await adminClient.rpc("count_main_users");
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── admin_get_all_subscriptions ──────────────────────────────────
        if (operation === "admin_get_all_subscriptions") {
            const { data, error } = await adminClient.rpc("admin_get_all_subscriptions");
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── get_user_details ─────────────────────────────────────────────
        if (operation === "get_user_details") {
            const { user_id } = body;
            const { data, error } = await adminClient.rpc("get_user_details", {
                _target_user_id: user_id,
            });
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── get_organization_members ─────────────────────────────────────
        if (operation === "get_organization_members") {
            const { organization_id } = body;
            const { data, error } = await adminClient.rpc("get_organization_members", {
                _organization_id: organization_id,
            });
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── admin_get_user_subscription ──────────────────────────────────
        if (operation === "admin_get_user_subscription") {
            const { user_id } = body;
            const { data, error } = await adminClient.rpc("admin_get_user_subscription", {
                p_user_id: user_id,
            });
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── admin_manage_user_subscription ──────────────────────────────
        if (operation === "admin_manage_user_subscription") {
            const { user_id, plan_id, organization_id } = body;
            const { data, error } = await adminClient.rpc("admin_manage_user_subscription", {
                p_user_id: user_id,
                p_plan_id: plan_id,
                p_organization_id: organization_id || null,
            });
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── get_section_access ──────────────────────────────────────────
        if (operation === "get_section_access") {
            const { user_id } = body;
            const { data, error } = await adminClient
                .from("user_section_access")
                .select("section_key, is_enabled")
                .eq("user_id", user_id);
            if (error) throw error;
            return new Response(JSON.stringify({ data }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── upsert_section_access ────────────────────────────────────────
        if (operation === "upsert_section_access") {
            const { rows } = body;
            const { error } = await adminClient
                .from("user_section_access")
                .upsert(rows, { onConflict: "user_id,section_key" });
            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        // ── admin_delete_user (via admin.deleteUser) ─────────────────────
        if (operation === "admin_delete_user") {
            const { target_user_id } = body;
            const { error } = await adminClient.auth.admin.deleteUser(target_user_id);
            if (error) throw error;
            return new Response(JSON.stringify({ success: true }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ error: "Operação inválida" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("[admin-panel-rpc] Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
