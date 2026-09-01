import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  getEvolutionApiKey,
  getEvolutionApiUrl,
  normalizeUrl,
} from "../_shared/evolution-config.ts";

interface SetPresenceRequest {
  instance_name: string;
  presence: "available" | "unavailable";
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabase = createSupabaseAdmin();

    // Verify JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid authorization token",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { instance_name, presence } = await req.json() as SetPresenceRequest;

    if (!instance_name || !presence) {
      throw new Error("Missing instance_name or presence");
    }

    if (presence !== "available" && presence !== "unavailable") {
      throw new Error(
        'Invalid presence value. Must be "available" or "unavailable"',
      );
    }

    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("id, organization_id")
      .eq("instance_name", instance_name)
      .maybeSingle();

    if (instanceError) {
      console.error("Error loading WhatsApp instance:", instanceError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to validate WhatsApp instance",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!instance?.organization_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Instance not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: activeMembership, error: membershipError } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", instance.organization_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (membershipError) {
      console.error(
        "Error validating organization membership:",
        membershipError,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to validate organization membership",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!activeMembership) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Access denied to this organization",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userScopedClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: channelAccessOk, error: channelAccessError } =
      await userScopedClient
        .rpc("user_can_access_channel", { p_channel_id: instance.id });

    if (channelAccessError) {
      console.error(
        "Error validating WhatsApp channel access:",
        channelAccessError,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to validate WhatsApp channel access",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    if (!channelAccessOk) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Access denied to this WhatsApp channel",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`👻 Setting presence for ${instance_name} to ${presence}`);

    // Get Evolution API credentials
    let evolutionApiUrl = "";
    let evolutionApiKey = "";

    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiKey();
    } catch {
      // FALLBACK: If env vars not available, try database config table
      console.log(
        "⚠️ Evolution API credentials not in env vars, checking database...",
      );

      const { data: config, error: configError } = await supabase
        .from("app_config")
        .select("config_key, config_value")
        .in("config_key", ["EVOLUTION_API_URL", "EVOLUTION_API_KEY"])
        .limit(2);

      if (configError) {
        console.error("❌ Error fetching config from database:", configError);
      } else if (config && config.length > 0) {
        config.forEach((item) => {
          const value = item.config_value?.trim();
          if (value && value.length > 0) {
            if (item.config_key === "EVOLUTION_API_URL") {
              evolutionApiUrl = value;
            }
            if (item.config_key === "EVOLUTION_API_KEY") {
              evolutionApiKey = value;
            }
          }
        });
      }
    }

    // Final validation
    if (!evolutionApiUrl || !evolutionApiKey) {
      throw new Error("Evolution API credentials not configured");
    }

    const baseUrl = normalizeUrl(evolutionApiUrl);

    // First check if the instance is connected
    const statusResponse = await fetch(
      `${baseUrl}/instance/connectionState/${instance_name}`,
      {
        method: "GET",
        headers: {
          "apikey": evolutionApiKey,
        },
      },
    );

    if (!statusResponse.ok) {
      console.log(
        `⚠️ Instance ${instance_name} not found or error checking status`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Instance not found",
          skipped: true,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 to not cause frontend errors
        },
      );
    }

    const statusData = await statusResponse.json();
    const connectionState = statusData?.instance?.state || statusData?.state;

    console.log(
      `📡 Instance ${instance_name} connection state: ${connectionState}`,
    );

    // Only set presence if instance is connected
    if (connectionState !== "open" && connectionState !== "connected") {
      console.log(
        `⚠️ Instance ${instance_name} is not connected (state: ${connectionState}), skipping presence update`,
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Instance not connected",
          skipped: true,
          connectionState,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200, // Return 200 to not cause frontend errors
        },
      );
    }

    // Call Evolution API to set presence
    const presenceResponse = await fetch(
      `${baseUrl}/instance/setPresence/${instance_name}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": evolutionApiKey,
        },
        body: JSON.stringify({ presence }),
      },
    );

    if (!presenceResponse.ok) {
      const errorText = await presenceResponse.text();
      console.error("❌ Evolution API error:", errorText);

      // Check if it's a connection closed error - handle gracefully
      if (
        errorText.includes("Connection Closed") ||
        errorText.includes("connection")
      ) {
        console.log(
          `⚠️ Connection closed for ${instance_name}, presence not set`,
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: "Connection closed",
            skipped: true,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200, // Return 200 to not cause frontend errors
          },
        );
      }

      throw new Error(
        `Evolution API error: ${presenceResponse.status} - ${errorText}`,
      );
    }

    const result = await presenceResponse.json();
    console.log(`✅ Presence set to ${presence} for ${instance_name}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Presence set to ${presence}`,
        result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("Error in set-whatsapp-presence:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200, // Return 200 to prevent frontend crashes - presence is non-critical
      },
    );
  }
});
