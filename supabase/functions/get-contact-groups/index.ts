import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  createSupabaseAdmin,
  extractPhoneNumber,
} from "../_shared/evolution-config.ts";

interface RequestBody {
  instance_name: string;
  // Quando informado, filtra apenas grupos onde esse contato participa.
  // Quando ausente, retorna TODOS os grupos do canal — usado pela aba
  // "Grupos" no painel esquerdo do Chat.
  phone_number?: string | null;
}

interface EvolutionParticipant {
  id: string;
  admin?: string | null;
}

interface EvolutionGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl?: string | null;
  participants?: EvolutionParticipant[];
}

interface ContactGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  // Preview da ultima msg (para a lista, estilo WhatsApp Web).
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "ENTRADA" | "SAIDA" | null;
  lastMessageSender: string | null; // pushname ou null se SAIDA pelo CRM
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1) Auth
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

    // 2) Parse body
    const { instance_name, phone_number } = (await req.json()) as RequestBody;
    if (!instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3) Authorization: confirma que o user pertence a uma org que e dona desta instancia.
    // Sem essa checagem, qualquer user logado poderia consultar grupos de qualquer canal.
    const { data: instanceRow, error: instErr } = await supabase
      .from("whatsapp_instances")
      .select("id, organization_id")
      .eq("instance_name", instance_name)
      .maybeSingle();

    if (instErr || !instanceRow) {
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

    // 4) Evolution credentials (env vars com fallback para app_config — mesmo padrao
    //    de create-whatsapp-instance, garantindo que a chave NUNCA vai pro frontend).
    let evolutionApiUrl: string | undefined;
    let evolutionApiKey: string | undefined;
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch {
      const { data: cfg } = await supabase
        .from("app_config")
        .select("config_key, config_value")
        .in("config_key", ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"]);
      cfg?.forEach((row: any) => {
        const v = row.config_value?.trim();
        if (!v) return;
        if (row.config_key === "EVOLUTION_API_URL") evolutionApiUrl = v;
        if (row.config_key === "EVOLUTION_API_KEY") evolutionApiKey = v;
      });
    }

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Evolution API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5) Fetch all groups from Evolution (com participants para filtragem).
    const fetchUrl = `${evolutionApiUrl}/group/fetchAllGroups/${encodeURIComponent(instance_name)}?getParticipants=true`;
    const resp = await fetch(fetchUrl, {
      method: "GET",
      headers: { apikey: evolutionApiKey, "Content-Type": "application/json" },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      return new Response(
        JSON.stringify({ success: false, error: `Evolution API ${resp.status}: ${errText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allGroups = (await resp.json()) as EvolutionGroup[] | { error?: string };
    if (!Array.isArray(allGroups)) {
      return new Response(
        JSON.stringify({ success: true, groups: [], note: "Evolution returned non-array (no groups?)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6) Normaliza phone do contato (se houver) e filtra grupos.
    //    Sem phone_number, retorna TODOS os grupos do canal.
    const normalizedPhone = phone_number ? extractPhoneNumber(phone_number) : null;

    const matched: ContactGroup[] = [];
    for (const grp of allGroups) {
      if (!grp) continue;
      const participants = Array.isArray(grp.participants) ? grp.participants : [];

      let participant: EvolutionParticipant | undefined;
      if (normalizedPhone) {
        // Modo filtro por contato: so retorna grupos onde o contato participa.
        participant = participants.find((p) => {
          if (!p?.id) return false;
          return extractPhoneNumber(p.id) === normalizedPhone;
        });
        if (!participant) continue;
      }

      matched.push({
        id: grp.id,
        subject: grp.subject || "Grupo sem nome",
        size: typeof grp.size === "number" ? grp.size : participants.length,
        pictureUrl: grp.pictureUrl || null,
        isAdmin: participant ? (participant.admin === "admin" || participant.admin === "superadmin") : false,
        isSuperAdmin: participant ? participant.admin === "superadmin" : false,
        lastMessageAt: null,
        lastMessagePreview: null,
        lastMessageDirection: null,
        lastMessageSender: null,
      });
    }

    // 7) Anexar preview da ultima mensagem por grupo (para a lista estilo WhatsApp Web).
    // Estrategia: 1 query so, ordenada desc, agrupada por group_id no cliente (rapido
    // ate 100s de grupos). Para volumes maiores, criar uma view materializada.
    if (matched.length > 0) {
      const groupIds = matched.map((g) => g.id);
      const { data: lastMsgs } = await supabase
        .from("mensagens_grupo")
        .select("group_id, corpo_mensagem, data_hora, direcao, sender_pushname, media_type")
        .eq("whatsapp_instance_id", instanceRow.id)
        .in("group_id", groupIds)
        .order("data_hora", { ascending: false })
        .limit(2000); // cap defensivo: 2k linhas mais recentes cobrem ~100 grupos com 20 msgs cada

      if (lastMsgs && lastMsgs.length > 0) {
        // Para cada grupo, pega a primeira (mais recente) ocorrencia.
        const seenGroup = new Set<string>();
        for (const row of lastMsgs) {
          if (seenGroup.has(row.group_id)) continue;
          seenGroup.add(row.group_id);
          const target = matched.find((g) => g.id === row.group_id);
          if (!target) continue;
          target.lastMessageAt = row.data_hora;
          target.lastMessagePreview = row.corpo_mensagem || (
            row.media_type === "image" ? "[Imagem]" :
            row.media_type === "video" ? "[Vídeo]" :
            row.media_type === "audio" ? "[Áudio]" :
            row.media_type === "document" ? "[Documento]" :
            row.media_type === "sticker" ? "[Figurinha]" :
            ""
          );
          target.lastMessageDirection = row.direcao as "ENTRADA" | "SAIDA";
          target.lastMessageSender = row.direcao === "ENTRADA" ? (row.sender_pushname || null) : null;
        }
      }
    }

    // 8) Ordena por ultima atividade (desc); grupos sem mensagens vao pro fim.
    matched.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return a.subject.localeCompare(b.subject);
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return new Response(
      JSON.stringify({ success: true, groups: matched }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("get-contact-groups error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message || "Unexpected error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
