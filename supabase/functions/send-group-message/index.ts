import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";

interface RequestBody {
  instance_name: string;
  group_id: string;       // formato Evolution: "120363xxxx@g.us"
  message_text: string;
  // JIDs mencionados (ex: ["5511999999999@s.whatsapp.net"]).
  // O frontend detecta @<digitos> no texto e converte para JID antes de enviar.
  // Evolution API espera no campo `mentioned` do payload de sendText.
  mentions?: string[];
  // Reply: id interno (UUID) da msg do nosso DB que esta sendo respondida.
  // Resolvemos para evolution_message_id antes de mandar pra Evolution.
  quoted_message_id?: string | null;
}

/**
 * Envia mensagem de texto para um grupo do WhatsApp via Evolution API.
 *
 * Diferente de `send-whatsapp-message`, esta funcao NAO normaliza o `to`
 * para `@s.whatsapp.net` — grupos usam `@g.us` e a Evolution API espera
 * o JID completo do grupo no campo `number` do payload.
 *
 * Mensagens de saida em grupo NAO sao persistidas em mensagens_chat hoje
 * (a tabela tem id_lead NOT NULL). Persistencia de historico em grupo e
 * uma feature posterior — esta funcao apenas envia.
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
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { instance_name, group_id, message_text, mentions, quoted_message_id } = (await req.json()) as RequestBody;
    if (!instance_name || !group_id || !message_text) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name, group_id and message_text are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitizar mentions: aceitar apenas strings JID validas terminando em @s.whatsapp.net
    const sanitizedMentions = Array.isArray(mentions)
      ? mentions.filter((m) => typeof m === "string" && /^[0-9]+@s\.whatsapp\.net$/.test(m))
      : [];

    // group_id valido: deve terminar em @g.us para o sandbox basico de seguranca.
    if (!group_id.includes("@g.us")) {
      return new Response(
        JSON.stringify({ success: false, error: "group_id deve ser um JID de grupo (terminado em @g.us)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authorization: instance pertence a uma org da qual o user e membro.
    const { data: instanceRow } = await supabase
      .from("whatsapp_instances")
      .select("id, organization_id, status")
      .eq("instance_name", instance_name)
      .maybeSingle();

    if (!instanceRow) {
      return new Response(
        JSON.stringify({ success: false, error: "Instance not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Cliente escopado ao usuário para o RPC de permissao — auth.uid() precisa
    // resolver para o JWT do caller, e nao para service_role.
    const userScopedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Spec channel-access-control: usuario so envia para canais aos quais
    // tem acesso atribuido (em whatsapp_channel_members) ou e owner.
    {
      const { data: channelOk, error: channelErr } = await userScopedClient
        .rpc("user_can_access_channel", { p_channel_id: instanceRow.id });
      if (channelErr) {
        console.error("user_can_access_channel RPC error:", channelErr);
        return new Response(
          JSON.stringify({ success: false, error: "Falha ao verificar permissao" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (!channelOk) {
        return new Response(
          JSON.stringify({ success: false, error: "Sem acesso a este canal" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (instanceRow.status !== "CONNECTED") {
      return new Response(
        JSON.stringify({ success: false, error: `Instance is ${instanceRow.status}` }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let evolutionApiUrl: string;
    let evolutionApiKey: string;
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch (e: any) {
      return new Response(
        JSON.stringify({ success: false, error: e.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Resolve quoted_message_id (UUID interno) -> snapshot da msg + evolution_message_id.
    // Snapshot usado para denormalizar em mensagens_grupo.quoted_message do INSERT da SAIDA.
    let quotedSnapshot: any = null;
    let quotedEvolutionId: string | null = null;
    let quotedParticipant: string | null = null;
    if (quoted_message_id) {
      const { data: qRow } = await supabase
        .from("mensagens_grupo")
        .select("id, evolution_message_id, sender_jid, sender_pushname, corpo_mensagem, direcao, media_type")
        .eq("id", quoted_message_id)
        .eq("whatsapp_instance_id", instanceRow.id)
        .eq("group_id", group_id)
        .maybeSingle();
      if (qRow) {
        quotedEvolutionId = qRow.evolution_message_id;
        quotedParticipant = qRow.sender_jid;
        quotedSnapshot = {
          evolution_message_id: qRow.evolution_message_id,
          participant: qRow.sender_jid,
          sender_pushname: qRow.sender_pushname,
          corpo_mensagem: qRow.corpo_mensagem,
          media_type: qRow.media_type,
          direcao: qRow.direcao,
        };
      }
    }

    const url = `${normalizeUrl(evolutionApiUrl)}/message/sendText/${encodeURIComponent(instance_name)}`;
    const sendBody: Record<string, unknown> = {
      number: group_id, // Evolution API aceita JID de grupo direto neste campo.
      text: message_text,
    };
    if (sanitizedMentions.length > 0) {
      // Evolution API v2: campo `mentioned` (array de JIDs).
      // O texto deve conter @<digitos> para o WhatsApp destacar visualmente —
      // o frontend ja envia o texto com @ no formato correto.
      sendBody.mentioned = sanitizedMentions;
    }
    if (quotedEvolutionId) {
      // Evolution API v2: payload de reply.
      sendBody.quoted = {
        key: {
          remoteJid: group_id,
          id: quotedEvolutionId,
          ...(quotedParticipant ? { participant: quotedParticipant } : {}),
        },
      };
    }

    const evoResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: evolutionApiKey,
      },
      body: JSON.stringify(sendBody),
    });

    if (!evoResp.ok) {
      const errText = await evoResp.text().catch(() => "unknown");
      return new Response(
        JSON.stringify({ success: false, error: `Evolution API ${evoResp.status}: ${errText.slice(0, 300)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const evoData = await evoResp.json().catch(() => ({}));
    const messageId: string | null = evoData?.key?.id || null;

    // Persiste a SAIDA em mensagens_grupo para refletir imediatamente na UI.
    // Em caso de duplicata (idempotencia por evolution_message_id), ignoramos.
    try {
      const persistedMetadata = sanitizedMentions.length > 0
        ? { mentionedJid: sanitizedMentions }
        : null;

      const { error: insertError } = await supabase.from("mensagens_grupo").insert({
        organization_id: instanceRow.organization_id,
        whatsapp_instance_id: instanceRow.id,
        group_id,
        evolution_message_id: messageId,
        sender_jid: null, // saida pelo CRM — quem mandou e o proprio canal
        sender_pushname: null,
        corpo_mensagem: message_text,
        direcao: "SAIDA",
        data_hora: new Date().toISOString(),
        status_entrega: "SENT",
        media_metadata: persistedMetadata,
        quoted_message_id: quoted_message_id || null,
        quoted_message: quotedSnapshot,
      });
      if (insertError) {
        const code = (insertError as any)?.code;
        if (code !== "23505") {
          console.warn("⚠️ Erro ao persistir SAIDA em mensagens_grupo:", insertError);
        }
      }
    } catch (persistErr) {
      console.warn("⚠️ Excecao ao persistir SAIDA em mensagens_grupo:", persistErr);
    }

    return new Response(
      JSON.stringify({ success: true, messageId, evolutionData: evoData }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-group-message error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
