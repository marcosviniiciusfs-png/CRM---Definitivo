import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  normalizeUrl,
  createSupabaseAdmin,
  formatPhoneToJid,
} from "../_shared/evolution-config.ts";

interface SendBroadcastRequest {
  broadcast_id: string;
  batch_size?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { broadcast_id, batch_size = 50 }: SendBroadcastRequest = await req.json();

    if (!broadcast_id) {
      return new Response(
        JSON.stringify({ success: false, error: "broadcast_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Fetch broadcast
    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcasts")
      .select("id, organization_id, message_text, delay_seconds, status, sent_count, error_count")
      .eq("id", broadcast_id)
      .maybeSingle();

    if (broadcastError || !broadcast) {
      return new Response(
        JSON.stringify({ success: false, error: "Transmissão não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (broadcast.status === "cancelled" || broadcast.status === "completed") {
      return new Response(
        JSON.stringify({ success: false, error: `Transmissão já ${broadcast.status === 'cancelled' ? 'cancelada' : 'concluída'}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get connected WhatsApp instance
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("organization_id", broadcast.organization_id)
      .eq("status", "CONNECTED")
      .maybeSingle();

    if (instanceError || !instance) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp conectada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get Evolution API credentials
    let evolutionApiUrl: string;
    let evolutionApiKey: string;
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch (configError: any) {
      return new Response(
        JSON.stringify({ success: false, error: configError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    const cleanBaseUrl = normalizeUrl(evolutionApiUrl);

    // Fetch pending contacts batch
    const { data: contacts, error: contactsError } = await supabase
      .from("broadcast_contacts")
      .select("id, phone, name")
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(batch_size);

    if (contactsError) {
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar contatos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, has_more: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Process each contact
    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Replace template variables
      const messageText = broadcast.message_text
        .replace(/\{\{nome\}\}/g, contact.name)
        .replace(/\{\{telefone\}\}/g, contact.phone);

      // Format phone to JID
      let jid: string;
      try {
        jid = formatPhoneToJid(contact.phone);
      } catch {
        await supabase
          .from("broadcast_contacts")
          .update({ status: "error", error_message: "Número de telefone inválido" })
          .eq("id", contact.id);
        errorCount++;
        await supabase
          .from("broadcasts")
          .update({
            error_count: broadcast.error_count + errorCount,
            updated_at: new Date().toISOString(),
          })
          .eq("id", broadcast_id);
        continue;
      }

      try {
        const sendUrl = `${cleanBaseUrl}/message/sendText/${instance.instance_name}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evolutionApiKey,
          },
          body: JSON.stringify({
            number: jid,
            text: messageText,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          await supabase
            .from("broadcast_contacts")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", contact.id);
          sentCount++;
        } else {
          const errorBody = await response.text().catch(() => "Unknown error");
          await supabase
            .from("broadcast_contacts")
            .update({ status: "error", error_message: errorBody.slice(0, 500) })
            .eq("id", contact.id);
          errorCount++;
        }
      } catch (err: any) {
        await supabase
          .from("broadcast_contacts")
          .update({ status: "error", error_message: err.message?.slice(0, 500) || "Erro de conexão" })
          .eq("id", contact.id);
        errorCount++;
      }

      // Update broadcast counters after each contact
      await supabase
        .from("broadcasts")
        .update({
          sent_count: broadcast.sent_count + sentCount,
          error_count: broadcast.error_count + errorCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", broadcast_id);

      // Delay between sends (except last contact in batch)
      if (i < contacts.length - 1) {
        await new Promise((r) => setTimeout(r, broadcast.delay_seconds * 1000));
      }
    }

    // Check if there are more pending contacts
    const { count } = await supabase
      .from("broadcast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending");

    const hasMore = (count ?? 0) > 0;

    return new Response(
      JSON.stringify({
        success: true,
        processed: contacts.length,
        sent: sentCount,
        errors: errorCount,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
