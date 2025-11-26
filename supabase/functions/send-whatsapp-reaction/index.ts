import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

interface ReactionRequest {
  message_id: string;
  emoji: string;
  lead_id: string;
}

Deno.serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Verificar autenticação
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { message_id, emoji, lead_id }: ReactionRequest = await req.json();

    if (!message_id || !emoji || !lead_id) {
      throw new Error("Missing required fields: message_id, emoji, lead_id");
    }

    // Buscar a mensagem original
    const { data: message, error: messageError } = await supabase
      .from("mensagens_chat")
      .select("evolution_message_id, id_lead")
      .eq("id", message_id)
      .single();

    if (messageError || !message) {
      throw new Error("Message not found");
    }

    if (!message.evolution_message_id) {
      throw new Error("Message does not have an Evolution message ID");
    }

    // Buscar o lead para pegar o telefone
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("telefone_lead, organization_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      throw new Error("Lead not found");
    }

    // Buscar a instância do WhatsApp da organização
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("organization_id", lead.organization_id)
      .eq("status", "CONNECTED")
      .limit(1)
      .single();

    if (instanceError || !instance) {
      throw new Error("No connected WhatsApp instance found");
    }

    // Enviar reação via Evolution API
    const reactionPayload = {
      key: {
        remoteJid: `${lead.telefone_lead}@s.whatsapp.net`,
        id: message.evolution_message_id,
        fromMe: false, // A mensagem original pode ser do lead ou do CRM
      },
      reaction: {
        key: {
          remoteJid: `${lead.telefone_lead}@s.whatsapp.net`,
          id: message.evolution_message_id,
        },
        text: emoji,
      },
    };

    console.log("Sending reaction to Evolution API:", {
      instance: instance.instance_name,
      messageId: message.evolution_message_id,
      emoji: emoji,
    });

    const evolutionResponse = await fetch(
      `${EVOLUTION_API_URL}/message/sendReaction/${instance.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": EVOLUTION_API_KEY || "",
        },
        body: JSON.stringify(reactionPayload),
      }
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
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
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
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
