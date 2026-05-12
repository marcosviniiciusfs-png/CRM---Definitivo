import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";

interface RequestBody {
  instance_name: string;
  group_id: string;
  // Modo "dia":
  //   day = "YYYY-MM-DD" — devolve msgs daquele dia especifico
  //   day = null/ausente — devolve msgs do dia mais recente que tem msgs (default)
  day?: string | null;
  // Modo "incremento" (usado pelo polling):
  //   since_data_hora = ISO timestamp — devolve msgs com data_hora > since
  //   limit interno menor para reduzir trafego
  since_data_hora?: string | null;
  limit?: number; // override opcional
}

/**
 * Le mensagens de grupo agrupadas por dia.
 *
 * Modos de uso:
 *  1. **Default (sem `day` nem `since_data_hora`)**: retorna o dia MAIS RECENTE
 *     que tenha mensagens. Useful para o "primeiro carregamento" da UI.
 *  2. **`day` informado**: retorna todas as mensagens daquele dia exato (sob
 *     limite). Useful para o botao "carregar dia anterior".
 *  3. **`since_data_hora` informado**: retorna mensagens com `data_hora > since`,
 *     ate o limite. Useful para polling incremental sem refetch completo.
 *
 * Em todos os modos, calcula `previousDayWithMessages`: a proxima data anterior
 * onde existem mensagens. UI usa para decidir se mostra botao "Carregar mais".
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

    const { instance_name, group_id, day, since_data_hora, limit } = (await req.json()) as RequestBody;
    if (!instance_name || !group_id) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name and group_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization
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

    const safeLimit = Math.min(Math.max(typeof limit === "number" ? limit : 500, 1), 1000);
    const baseSelect = "id, evolution_message_id, sender_jid, sender_pushname, corpo_mensagem, direcao, data_hora, status_entrega, media_url, media_type, media_metadata, quoted_message_id, quoted_message";

    // ----- Modo: incremento (polling) -----
    if (since_data_hora) {
      const { data, error: queryErr } = await supabase
        .from("mensagens_grupo")
        .select(baseSelect)
        .eq("whatsapp_instance_id", instanceRow.id)
        .eq("group_id", group_id)
        .gt("data_hora", since_data_hora)
        .order("data_hora", { ascending: true })
        .limit(safeLimit);
      if (queryErr) {
        return new Response(
          JSON.stringify({ success: false, error: queryErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, mode: "incremental", messages: data || [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ----- Modo: por dia -----
    // 1) Resolver o dia alvo (UTC). Se nao informado, descobrir o dia mais recente com msgs.
    let targetDay = day;
    if (!targetDay) {
      const { data: latestRow } = await supabase
        .from("mensagens_grupo")
        .select("data_hora")
        .eq("whatsapp_instance_id", instanceRow.id)
        .eq("group_id", group_id)
        .order("data_hora", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latestRow?.data_hora) {
        // Grupo sem msgs ainda
        return new Response(
          JSON.stringify({
            success: true,
            mode: "day",
            messages: [],
            currentDay: null,
            previousDayWithMessages: null,
            hasMore: false,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      targetDay = latestRow.data_hora.slice(0, 10);
    }

    // 2) Buscar mensagens do targetDay (UTC). Janela: [targetDay 00:00, targetDay+1 00:00).
    const dayStart = `${targetDay}T00:00:00.000Z`;
    const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

    const { data: dayMsgs, error: dayErr } = await supabase
      .from("mensagens_grupo")
      .select(baseSelect)
      .eq("whatsapp_instance_id", instanceRow.id)
      .eq("group_id", group_id)
      .gte("data_hora", dayStart)
      .lt("data_hora", dayEnd)
      .order("data_hora", { ascending: true })
      .limit(safeLimit);

    if (dayErr) {
      return new Response(
        JSON.stringify({ success: false, error: dayErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Calcular `previousDayWithMessages`: a maior data_hora < dayStart, depois extrair YYYY-MM-DD.
    const { data: prevRow } = await supabase
      .from("mensagens_grupo")
      .select("data_hora")
      .eq("whatsapp_instance_id", instanceRow.id)
      .eq("group_id", group_id)
      .lt("data_hora", dayStart)
      .order("data_hora", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousDayWithMessages = prevRow?.data_hora ? prevRow.data_hora.slice(0, 10) : null;
    const hasMore = (dayMsgs?.length ?? 0) >= safeLimit;

    return new Response(
      JSON.stringify({
        success: true,
        mode: "day",
        messages: dayMsgs || [],
        currentDay: targetDay,
        previousDayWithMessages,
        hasMore,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("get-group-messages error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
