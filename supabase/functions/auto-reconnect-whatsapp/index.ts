import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiKey,
  isConnectedState,
  createSupabaseAdmin,
} from "../_shared/evolution-config.ts";

interface AutoReconnectRequest {
  instance_name: string;
}

const MAX_ATTEMPTS = 3;
const WAIT_BETWEEN_ATTEMPTS_MS = 5000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { instance_name }: AutoReconnectRequest = await req.json();

    if (!instance_name) {
      return new Response(
        JSON.stringify({ success: false, error: "instance_name é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createSupabaseAdmin();
    const evolutionApiUrl = getEvolutionApiUrl();
    const evolutionApiKey = getEvolutionApiKey();

    const headers = {
      "Content-Type": "application/json",
      apikey: evolutionApiKey,
    };

    const fetchState = async () => {
      const res = await fetch(`${evolutionApiUrl}/instance/connectionState/${instance_name}`, {
        method: "GET",
        headers,
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => null);
      return json?.instance?.state || json?.state || null;
    };

    const currentState = await fetchState();

    if (isConnectedState(currentState)) {
      console.log(`✅ ${instance_name} já está conectada (state=${currentState})`);
      return new Response(
        JSON.stringify({
          success: true,
          reconnected: false,
          message: "Instância já está conectada",
          status: "CONNECTED",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    console.log(`🔄 ${instance_name} desconectada (state=${currentState}). Iniciando até ${MAX_ATTEMPTS} tentativas de restart…`);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`🔁 Tentativa ${attempt}/${MAX_ATTEMPTS} para ${instance_name}`);

      const restartRes = await fetch(`${evolutionApiUrl}/instance/restart/${instance_name}`, {
        method: "POST",
        headers,
      });

      if (!restartRes.ok) {
        console.warn(`⚠️ restart retornou ${restartRes.status} na tentativa ${attempt}`);
      }

      await new Promise((r) => setTimeout(r, WAIT_BETWEEN_ATTEMPTS_MS));

      const newState = await fetchState();
      if (isConnectedState(newState)) {
        await supabase
          .from("whatsapp_instances")
          .update({ status: "CONNECTED", updated_at: new Date().toISOString() })
          .eq("instance_name", instance_name);

        console.log(`✅ Reconexão bem-sucedida na tentativa ${attempt} (state=${newState})`);

        return new Response(
          JSON.stringify({
            success: true,
            reconnected: true,
            attempts: attempt,
            status: "CONNECTED",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      console.log(`❌ Tentativa ${attempt} falhou (state=${newState}). Continuando…`);
    }

    await supabase
      .from("whatsapp_instances")
      .update({ status: "DISCONNECTED", updated_at: new Date().toISOString() })
      .eq("instance_name", instance_name);

    console.log(`❌ Reconexão falhou após ${MAX_ATTEMPTS} tentativas. Marcando ${instance_name} como DISCONNECTED.`);

    return new Response(
      JSON.stringify({
        success: false,
        reconnected: false,
        attempts: MAX_ATTEMPTS,
        status: "DISCONNECTED",
        error: `Reconexão falhou após ${MAX_ATTEMPTS} tentativas`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    console.error("❌ Erro em auto-reconnect-whatsapp:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
