import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";

interface RequestBody {
  instance_name: string;
  group_id: string;
  query: string;
  limit?: number; // default 100, max 200
}

/**
 * Full-text search em mensagens_grupo (corpo_mensagem ILIKE %query%).
 * Retorna ate 100 matches mais recentes, em ordem cronologica decrescente
 * (mais novo primeiro) — UI tipicamente mostra os hits ordenados do mais
 * recente para o mais antigo.
 *
 * Usado pelo modo "buscar em todo o historico" da busca hibrida no
 * GroupConversationView. Busca em memoria continua sendo a primeira
 * camada e nao precisa desta funcao.
 *
 * Autorizacao: JWT do user precisa ser membro da org dona da instancia.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const supabase = createSupabaseAdmin();
    const userScopedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instance_name, group_id, query, limit } = (await req.json()) as RequestBody;
    if (!instance_name || !group_id || !query || query.trim().length < 2) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name, group_id and query (min 2 chars) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: user e membro da org da instancia
    const { data: instanceRow } = await supabase
      .from("whatsapp_instances")
      .select("id, organization_id")
      .eq("instance_name", instance_name)
      .maybeSingle();
    if (!instanceRow) {
      return new Response(
        JSON.stringify({ success: false, error: "Instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Defense-in-depth: verifica acesso granular ao canal antes de tocar a tabela de mensagens.
    const { data: channelOk } = await userScopedClient
      .rpc("user_can_access_channel", { p_channel_id: instanceRow.id });

    if (!channelOk) {
      return new Response(
        JSON.stringify({ success: false, error: "Sem acesso a este canal" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", instanceRow.organization_id)
      .maybeSingle();
    if (!membership) {
      return new Response(
        JSON.stringify({ success: false, error: "Not authorized for this instance" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const safeLimit = Math.min(Math.max(typeof limit === "number" ? limit : 100, 1), 200);
    // Escapar wildcards SQL no query (% e _) para nao virar match livre.
    const escaped = query.trim().replace(/[\\%_]/g, "\\$&");

    const { data, error: queryErr } = await supabase
      .from("mensagens_grupo")
      .select("id, evolution_message_id, sender_jid, sender_pushname, corpo_mensagem, direcao, data_hora, status_entrega, media_url, media_type, media_metadata, quoted_message_id, quoted_message")
      .eq("whatsapp_instance_id", instanceRow.id)
      .eq("group_id", group_id)
      .ilike("corpo_mensagem", `%${escaped}%`)
      .order("data_hora", { ascending: false })
      .limit(safeLimit);

    if (queryErr) {
      return new Response(
        JSON.stringify({ success: false, error: queryErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, matches: data || [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("search-group-messages error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
