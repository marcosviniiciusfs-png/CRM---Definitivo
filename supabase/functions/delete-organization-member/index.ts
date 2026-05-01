import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // 1. Validar JWT do caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(jwt);
    if (authErr || !caller) {
      return new Response(JSON.stringify({ error: "JWT inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Parse body
    const { member_id, organization_id } = await req.json();
    if (!member_id || !organization_id) {
      return new Response(JSON.stringify({ error: "member_id e organization_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Caller é owner da org?
    const { data: callerMember } = await adminClient
      .from("organization_members")
      .select("role")
      .eq("user_id", caller.id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!callerMember || callerMember.role !== "owner") {
      return new Response(JSON.stringify({ error: "Apenas o owner pode excluir colaboradores" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Buscar membro alvo
    const { data: target } = await adminClient
      .from("organization_members")
      .select("id, user_id, role")
      .eq("id", member_id)
      .eq("organization_id", organization_id)
      .maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ error: "Membro não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.role === "owner") {
      return new Response(JSON.stringify({ error: "Não é permitido excluir o proprietário" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (target.user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Não é permitido excluir a si mesmo" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TODO: Steps 1-6 da cascata serão implementados em tarefas seguintes
    return new Response(JSON.stringify({ error: "Cascata ainda não implementada" }), {
      status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[delete-organization-member] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
