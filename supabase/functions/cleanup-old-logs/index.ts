import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate the cutoff date (72 hours ago)
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - 72);
    const cutoffISO = cutoffDate.toISOString();

    console.log(`[CLEANUP-LOGS] Cleaning logs older than: ${cutoffISO}`);

    // Delete old logs from facebook_webhook_logs
    const { error: fbError, count: fbCount } = await supabase
      .from("facebook_webhook_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);

    if (fbError) {
      console.error("[CLEANUP-LOGS] Error deleting facebook logs:", fbError);
    } else {
      console.log(`[CLEANUP-LOGS] Deleted ${fbCount || 0} facebook webhook logs`);
    }

    // Delete old logs from webhook_logs (WhatsApp)
    const { error: waError, count: waCount } = await supabase
      .from("webhook_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);

    if (waError) {
      console.error("[CLEANUP-LOGS] Error deleting whatsapp logs:", waError);
    } else {
      console.log(`[CLEANUP-LOGS] Deleted ${waCount || 0} whatsapp webhook logs`);
    }

    // Delete old logs from form_webhook_logs
    const { error: formError, count: formCount } = await supabase
      .from("form_webhook_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);

    if (formError) {
      console.error("[CLEANUP-LOGS] Error deleting form webhook logs:", formError);
    } else {
      console.log(`[CLEANUP-LOGS] Deleted ${formCount || 0} form webhook logs`);
    }

    // Delete old logs from meta_conversion_logs
    const { error: metaError, count: metaCount } = await supabase
      .from("meta_conversion_logs")
      .delete({ count: "exact" })
      .lt("created_at", cutoffISO);

    if (metaError) {
      console.error("[CLEANUP-LOGS] Error deleting meta conversion logs:", metaError);
    } else {
      console.log(`[CLEANUP-LOGS] Deleted ${metaCount || 0} meta conversion logs`);
    }

    const totalDeleted = (fbCount || 0) + (waCount || 0) + (formCount || 0) + (metaCount || 0);
    console.log(`[CLEANUP-LOGS] Total logs deleted: ${totalDeleted}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleanup complete. Deleted ${totalDeleted} logs older than 72 hours.`,
        details: {
          facebook_webhook_logs: fbCount || 0,
          webhook_logs: waCount || 0,
          form_webhook_logs: formCount || 0,
          meta_conversion_logs: metaCount || 0,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[CLEANUP-LOGS] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
