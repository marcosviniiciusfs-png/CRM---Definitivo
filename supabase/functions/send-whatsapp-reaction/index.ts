import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getEvolutionApiUrl, getEvolutionApiKey, createSupabaseAdmin, formatPhoneToJid } from "../_shared/evolution-config.ts";

interface ReactionRequest {
  message_id: string;
  emoji: string;
  lead_id: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();

    // Verificar autenticação do usuário
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    // Validar o JWT do usuário
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error("Auth error:", authError);
      throw new Error("Unauthorized");
    }

    const { message_id, emoji, lead_id }: ReactionRequest = await req.json();

    if (!message_id || !emoji || !lead_id) {
      throw new Error("Missing required fields: message_id, emoji, lead_id");
    }

    // Buscar a mensagem original (usando service role, sem RLS bloqueando)
    const { data: message, error: messageError } = await supabase
      .from("mensagens_chat")
      .select("evolution_message_id, id_lead")
      .eq("id", message_id)
      .maybeSingle();

    if (messageError) {
      console.error("Error loading message:", messageError);
      throw new Error("Failed to load message");
    }

    if (!message) {
      throw new Error("Message not found");
    }

    if (!message.evolution_message_id) {
      throw new Error("Message does not have an Evolution message ID");
    }

    // Buscar o lead para pegar o telefone e organização
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("telefone_lead, organization_id")
      .eq("id", lead_id)
      .maybeSingle();

    if (leadError) {
      console.error("Error loading lead:", leadError);
      throw new Error("Failed to load lead");
    }

    if (!lead) {
      throw new Error("Lead not found");
    }

    if (!lead.telefone_lead) {
      throw new Error("Lead phone number is missing");
    }

    // Buscar a instância do WhatsApp da organização
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("organization_id", lead.organization_id)
      .eq("status", "CONNECTED")
      .maybeSingle();

    if (instanceError) {
      console.error("Error loading WhatsApp instance:", instanceError);
      throw new Error("Failed to load WhatsApp instance");
    }

    if (!instance) {
      throw new Error("No connected WhatsApp instance found");
    }

    // Normalizar número de telefone para JID do WhatsApp
    const cleanNumber = String(lead.telefone_lead).replace(/\D/g, "");
    const remoteJid = formatPhoneToJid(cleanNumber);

    // Preparar URL da Evolution API
    const baseUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    // Normalizar emoji - permitir apenas os emojis suportados
    const rawEmoji = (emoji || "").trim();
    const allowedReactions: Record<string, string> = {
      "👍": "👍",
      "❤️": "❤", // enviar coração simples (sem variation selector)
      "😂": "😂",
      "😮": "😮",
      "😢": "😢",
      "🙏": "🙏",
    };

    const cleanedEmoji = allowedReactions[rawEmoji];

    if (!cleanedEmoji) {
      throw new Error(`Invalid emoji for reaction: ${rawEmoji}`);
    }

    // Montar payload de reação
    const reactionPayload = {
      key: {
        remoteJid,
        id: message.evolution_message_id,
        fromMe: false,
      },
      reaction: cleanedEmoji, // Evolution API espera apenas a string do emoji
    };

    console.log("Sending reaction to Evolution API:", {
      instance: instance.instance_name,
      messageId: message.evolution_message_id,
      emoji,
      remoteJid,
    });

    const evolutionResponse = await fetch(
      `${baseUrl}/message/sendReaction/${instance.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evolutionApiKey,
        },
        body: JSON.stringify(reactionPayload),
      },
    );

    if (!evolutionResponse.ok) {
      const errorText = await evolutionResponse.text();
      console.error("Evolution API error:", errorText);
      throw new Error(`Failed to send reaction to WhatsApp: ${errorText}`);
    }

    const evolutionData = await evolutionResponse.json();
    console.log("Reaction sent successfully:", evolutionData);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reaction sent to WhatsApp successfully",
        data: evolutionData,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error sending WhatsApp reaction:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
