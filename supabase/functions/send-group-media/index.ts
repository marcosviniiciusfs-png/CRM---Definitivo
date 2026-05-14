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
  group_id: string;        // "120363xxx@g.us"
  media_base64: string;    // pode vir com ou sem prefixo data:...;base64,
  media_type: "image" | "video" | "audio" | "document";
  file_name?: string;
  mime_type?: string;
  caption?: string;
  is_ptt?: boolean;
  mentions?: string[];
  quoted_message_id?: string | null;
}

/**
 * Envia midia (imagem/video/audio/documento) para um grupo via Evolution API.
 * Espelho de send-whatsapp-media (chat privado), adaptado para grupos:
 *   - `number` recebe o JID @g.us direto
 *   - persiste em mensagens_grupo (nao mensagens_chat)
 *   - upload para bucket chat-media na pasta `groups/<group_digits>/`
 *
 * Audio PTT usa endpoint dedicado /message/sendWhatsAppAudio (encoding server-side
 * via FFmpeg), garantindo formato OGG/Opus que toca como "voice note" no WhatsApp.
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

    const body = (await req.json()) as RequestBody;
    const { instance_name, group_id, media_base64, media_type, file_name, mime_type, caption, is_ptt, mentions, quoted_message_id } = body;

    if (!instance_name || !group_id || !media_base64 || !media_type) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name, group_id, media_base64, media_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!group_id.includes("@g.us")) {
      return new Response(
        JSON.stringify({ success: false, error: "group_id deve ser @g.us" }),
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
    const cleanApiUrl = normalizeUrl(evolutionApiUrl);

    // Sanitiza mentions
    const sanitizedMentions = Array.isArray(mentions)
      ? mentions.filter((m) => typeof m === "string" && /^[0-9]+@s\.whatsapp\.net$/.test(m))
      : [];

    // Resolve quoted_message_id -> snapshot + evolution id (mesmo padrao do send-group-message).
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

    const buildQuotedField = () => {
      if (!quotedEvolutionId) return undefined;
      return {
        key: {
          remoteJid: group_id,
          id: quotedEvolutionId,
          ...(quotedParticipant ? { participant: quotedParticipant } : {}),
        },
      };
    };

    // Strip data URL prefix se vier do frontend (espelho do chat privado).
    // Evolution espera base64 puro — se mandar "data:audio/...;base64,XYZ"
    // ela rejeita com 400 "Owned media must be a url, base64, or valid file...".
    // Regex anterior `^data:[^;]+;base64,` quebrava com data URLs de multiplos
    // parametros tipo "data:audio/webm;codecs=opus;base64,XYZ" — o [^;]+ so pega
    // ate o primeiro ';'. Agora usamos comma-based split, robusto para qualquer
    // formato RFC 2397.
    const cleanBase64 = media_base64.includes(",")
      ? media_base64.slice(media_base64.indexOf(",") + 1)
      : media_base64;

    // ============== AUDIO PTT (voice note) ==============
    if (media_type === "audio" && is_ptt) {
      const pttUrl = `${cleanApiUrl}/message/sendWhatsAppAudio/${encodeURIComponent(instance_name)}`;
      const pttPayload: Record<string, unknown> = {
        number: group_id,
        audio: cleanBase64,
        delay: 0,
        encoding: true,
      };
      const quoted = buildQuotedField();
      if (quoted) pttPayload.quoted = quoted;

      const pttResp = await fetch(pttUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
        body: JSON.stringify(pttPayload),
      });
      if (!pttResp.ok) {
        const errText = await pttResp.text().catch(() => "unknown");
        console.error(`Evolution sendWhatsAppAudio falhou:`, pttResp.status, errText);
        // Retorna 200 com success:false para o frontend conseguir ler a mensagem
        // de erro real no toast (supabase-js esconde o body de respostas non-2xx).
        return new Response(
          JSON.stringify({ success: false, error: `Evolution ${pttResp.status}: ${errText.slice(0, 300)}` }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const pttData = await pttResp.json().catch(() => ({}));
      const messageId: string | null = pttData?.key?.id || null;

      // Upload para Storage. Usa o mime REAL (vindo do frontend) para o player
      // do navegador conseguir decodificar — se gravamos WebM e rotularmos
      // como OGG, o player do chat nao toca direito.
      const actualMime = (mime_type && typeof mime_type === "string")
        ? mime_type
        : "audio/ogg; codecs=opus";
      const ext = actualMime.includes("webm") ? "webm" : "ogg";
      let storageUrl: string | null = null;
      try {
        const bin = atob(cleanBase64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const groupDigits = group_id.replace(/[^0-9]/g, "");
        const filePath = `groups/${groupDigits}/${messageId || `ptt-${Date.now()}`}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("chat-media")
          .upload(filePath, bytes, { contentType: actualMime.split(";")[0].trim(), upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(filePath);
          storageUrl = pub.publicUrl;
        }
      } catch (uploadErr) {
        console.warn("⚠️ Falha upload audio PTT grupo:", uploadErr);
      }

      try {
        await supabase.from("mensagens_grupo").insert({
          organization_id: instanceRow.organization_id,
          whatsapp_instance_id: instanceRow.id,
          group_id,
          evolution_message_id: messageId,
          sender_jid: null,
          sender_pushname: null,
          corpo_mensagem: "[Áudio]",
          direcao: "SAIDA",
          data_hora: new Date().toISOString(),
          status_entrega: "SENT",
          media_url: storageUrl,
          media_type: "audio",
          media_metadata: {
            mimetype: actualMime,
            ptt: true,
            ...(sanitizedMentions.length > 0 ? { mentionedJid: sanitizedMentions } : {}),
          },
          quoted_message_id: quoted_message_id || null,
          quoted_message: quotedSnapshot,
        });
      } catch (e) {
        console.warn("⚠️ Falha persistir SAIDA PTT:", e);
      }

      return new Response(
        JSON.stringify({ success: true, messageId, mediaUrl: storageUrl }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ============== IMAGEM / VIDEO / DOCUMENTO / AUDIO comum ==============
    let finalFileName = file_name;
    let finalMime = mime_type || "application/octet-stream";
    switch (media_type) {
      case "image":
        finalFileName = finalFileName || "image.jpg";
        if (!mime_type) finalMime = "image/jpeg";
        break;
      case "video":
        finalFileName = finalFileName || "video.mp4";
        if (!mime_type) finalMime = "video/mp4";
        break;
      case "audio":
        finalFileName = finalFileName || "audio.mp3";
        if (!mime_type) finalMime = "audio/mpeg";
        break;
      case "document":
      default:
        finalFileName = finalFileName || "document.pdf";
        break;
    }

    const sendUrl = `${cleanApiUrl}/message/sendMedia/${encodeURIComponent(instance_name)}`;
    const sendPayload: Record<string, unknown> = {
      number: group_id,
      mediatype: media_type,
      mimetype: finalMime,
      caption: caption || "",
      media: cleanBase64,
      fileName: finalFileName,
    };
    if (sanitizedMentions.length > 0) sendPayload.mentioned = sanitizedMentions;
    const quoted = buildQuotedField();
    if (quoted) sendPayload.quoted = quoted;

    const sendResp = await fetch(sendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionApiKey },
      body: JSON.stringify(sendPayload),
    });
    if (!sendResp.ok) {
      const errText = await sendResp.text().catch(() => "unknown");
      console.error(`Evolution sendMedia falhou:`, sendResp.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: `Evolution ${sendResp.status}: ${errText.slice(0, 300)}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const sendData = await sendResp.json().catch(() => ({}));
    const messageId: string | null = sendData?.key?.id || null;

    // Upload para Storage (URL permanente, similar ao chat privado).
    let storageUrl: string | null = null;
    try {
      const bin = atob(cleanBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const groupDigits = group_id.replace(/[^0-9]/g, "");
      const safeName = (finalFileName || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `groups/${groupDigits}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("chat-media")
        .upload(filePath, bytes, { contentType: finalMime, upsert: false });
      if (!upErr) {
        const { data: pub } = supabase.storage.from("chat-media").getPublicUrl(filePath);
        storageUrl = pub.publicUrl;
      }
    } catch (uploadErr) {
      console.warn("⚠️ Falha upload midia grupo:", uploadErr);
    }

    // Body da mensagem segue convencao do chat privado.
    let messageBody = "";
    if (media_type === "image") messageBody = caption || "[Imagem]";
    else if (media_type === "video") messageBody = caption || "[Vídeo]";
    else if (media_type === "audio") messageBody = "[Áudio]";
    else messageBody = caption || `[Documento] ${finalFileName || ""}`.trim();

    try {
      await supabase.from("mensagens_grupo").insert({
        organization_id: instanceRow.organization_id,
        whatsapp_instance_id: instanceRow.id,
        group_id,
        evolution_message_id: messageId,
        sender_jid: null,
        sender_pushname: null,
        corpo_mensagem: messageBody,
        direcao: "SAIDA",
        data_hora: new Date().toISOString(),
        status_entrega: "SENT",
        media_url: storageUrl,
        media_type,
        media_metadata: {
          fileName: finalFileName,
          mimetype: finalMime,
          ...(sanitizedMentions.length > 0 ? { mentionedJid: sanitizedMentions } : {}),
        },
        quoted_message_id: quoted_message_id || null,
        quoted_message: quotedSnapshot,
      });
    } catch (e) {
      console.warn("⚠️ Falha persistir SAIDA midia grupo:", e);
    }

    return new Response(
      JSON.stringify({ success: true, messageId, mediaUrl: storageUrl }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("send-group-media error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
