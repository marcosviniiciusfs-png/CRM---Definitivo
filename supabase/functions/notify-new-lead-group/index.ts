import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import { sendLeadGroupAlert } from "../_shared/lead-group-alert.ts";

// Janela do reenvio: só leads criados nas últimas 2h. Leads mais antigos nunca
// são reenviados, para não jogar alertas antigos no grupo.
const SWEEP_WINDOW_MS = 2 * 60 * 60 * 1000;
// Leads muito recentes ainda podem estar sendo tratados pelo envio em tempo real.
const SWEEP_MIN_AGE_MS = 3 * 60 * 1000;
const SWEEP_BATCH_LIMIT = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function sweepMissingAlerts(supabase: any) {
  const now = Date.now();
  const since = new Date(now - SWEEP_WINDOW_MS).toISOString();
  const until = new Date(now - SWEEP_MIN_AGE_MS).toISOString();

  const { data: channels } = await supabase
    .from("whatsapp_instances")
    .select("organization_id")
    .eq("lead_alerts_enabled", true)
    .not("lead_alert_group_id", "is", null);
  const orgIds = [...new Set((channels || []).map((c: any) => c.organization_id))];
  if (orgIds.length === 0) return { candidates: 0, attempted: 0, results: [] };

  const { data: leads } = await supabase
    .from("leads")
    .select("id, organization_id, source")
    .in("organization_id", orgIds)
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: sent } = await supabase
    .from("webhook_logs")
    .select("payload")
    .eq("event_type", "lead_group_alert")
    .eq("status", "success")
    .gte("created_at", since);
  const sentIds = new Set((sent || []).map((row: any) => row.payload?.lead_id));

  const pending = (leads || [])
    .filter((lead: any) => !sentIds.has(lead.id))
    .slice(0, SWEEP_BATCH_LIMIT);

  const results = [];
  for (const lead of pending) {
    const result = await sendLeadGroupAlert(supabase, {
      leadId: lead.id,
      organizationId: lead.organization_id,
      sourceLabel: lead.source || "CRM",
      waitForAssignment: false,
    });
    results.push({ lead_id: lead.id, ...result });
  }

  return { candidates: (leads || []).length, attempted: pending.length, results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const isServiceCall = !!serviceRoleKey && token === serviceRoleKey;
    const isCronCall = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
    if (!isServiceCall && !isCronCall) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }

    const body = await req.json();

    if (body.mode === "sweep") {
      const summary = await sweepMissingAlerts(createSupabaseAdmin());
      return json({ success: true, mode: "sweep", ...summary });
    }

    if (!body.lead_id || !body.organization_id) {
      return json({ success: false, error: "lead_id and organization_id are required" }, 400);
    }

    const result = await sendLeadGroupAlert(createSupabaseAdmin(), {
      leadId: body.lead_id,
      organizationId: body.organization_id,
      sourceLabel: body.source_label || "CRM",
    });

    return json({ success: true, ...result });
  } catch (error: any) {
    return json({ success: false, error: error?.message || "Unexpected error" }, 500);
  }
});
