import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
    const remoteJid = `${cleanNumber}@s.whatsapp.net`;

    // Preparar URL da Evolution API
    let evolutionApiUrl = EVOLUTION_API_URL || "";
    if (!evolutionApiUrl || !/^https?:\/\//.test(evolutionApiUrl)) {
      console.log("⚠️ EVOLUTION_API_URL inválida. Usando URL padrão.");
      evolutionApiUrl = "https://evolution01.kairozspace.com.br";
    }

    // Montar payload de reação
    const reactionPayload = {
      key: {
        remoteJid,
        id: message.evolution_message_id,
        fromMe: false,
      },
      reaction: {
        key: {
          remoteJid,
          id: message.evolution_message_id,
        },
        text: emoji,
      },
    };

    console.log("Sending reaction to Evolution API:", {
      instance: instance.instance_name,
      messageId: message.evolution_message_id,
      emoji,
      remoteJid,
    });

    const evolutionResponse = await fetch(
      `${evolutionApiUrl.replace(/\/+$/, "")}/message/sendReaction/${instance.instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: EVOLUTION_API_KEY || "",
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
