import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/evolution-config.ts";
import { sendLeadGroupAlert } from "../_shared/lead-group-alert.ts";

// Leads muito recentes ainda podem estar sendo tratados pelo envio em tempo real.
const SWEEP_MIN_AGE_MS = 3 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Cron: só o que acabou de falhar (2h), em lotes pequenos.
const CRON_WINDOW_HOURS = 2;
const CRON_BATCH_LIMIT = 10;
// Botão manual: alertas perdidos das últimas 24h, em lotes que cabem no tempo da função.
const MANUAL_WINDOW_HOURS = 24;
const MANUAL_BATCH_LIMIT = 15;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Lista os leads de uma janela que deveriam ter gerado alerta e não têm sucesso gravado.
async function findMissedAlerts(supabase: any, organizationId: string | null, windowHours: number) {
  const now = Date.now();
  const since = new Date(now - windowHours * HOUR_MS).toISOString();
  const until = new Date(now - SWEEP_MIN_AGE_MS).toISOString();

  let channelQuery = supabase
    .from("whatsapp_instances")
    .select("organization_id")
    .eq("lead_alerts_enabled", true)
    .not("lead_alert_group_id", "is", null);
  if (organizationId) channelQuery = channelQuery.eq("organization_id", organizationId);
  const { data: channels } = await channelQuery;
  const orgIds = [...new Set((channels || []).map((c: any) => c.organization_id))];
  if (orgIds.length === 0) return [];

  const { data: leads } = await supabase
    .from("leads")
    .select("id, organization_id, source")
    .in("organization_id", orgIds)
    .gte("created_at", since)
    .lte("created_at", until)
    .order("created_at", { ascending: false })
    .limit(1000);

  const { data: sent } = await supabase
    .from("webhook_logs")
    .select("payload")
    .eq("event_type", "lead_group_alert")
    .eq("status", "success")
    .gte("created_at", since);
  const sentIds = new Set((sent || []).map((row: any) => row.payload?.lead_id));

  return (leads || []).filter((lead: any) => !sentIds.has(lead.id));
}

async function sendMissedAlerts(supabase: any, missed: any[], limit: number) {
  const batch = missed.slice(0, limit);
  const results = [];
  for (const lead of batch) {
    const result = await sendLeadGroupAlert(supabase, {
      leadId: lead.id,
      organizationId: lead.organization_id,
      sourceLabel: lead.source || "CRM",
      waitForAssignment: false,
    });
    results.push({ lead_id: lead.id, ...result });
  }
  return {
    missed: missed.length,
    attempted: batch.length,
    remaining: Math.max(missed.length - batch.length, 0),
    results,
  };
}

// Usuário logado só pode agir sobre organizações em que é membro ativo.
async function userIsActiveMember(supabase: any, token: string, organizationId: string) {
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) return false;
  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  return !!member;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "").trim();
    const isServiceCall = !!serviceRoleKey && token === serviceRoleKey;
    const isCronCall = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;

    const body = await req.json();
    const supabase = createSupabaseAdmin();

    if (body.mode === "count" || body.mode === "sweep") {
      const organizationId: string | null = body.organization_id || null;
      const isPrivileged = isServiceCall || isCronCall;

      if (!isPrivileged) {
        if (!organizationId || !token || !(await userIsActiveMember(supabase, token, organizationId))) {
          return json({ success: false, error: "Unauthorized" }, 401);
        }
      }

      if (body.mode === "count") {
        const windowHours = Math.min(Number(body.window_hours) || MANUAL_WINDOW_HOURS, 24 * 7);
        const missed = await findMissedAlerts(supabase, organizationId, windowHours);
        return json({ success: true, mode: "count", missed: missed.length });
      }

      // sweep: cron usa janela curta; chamada manual usa a janela de 24h.
      const windowHours = isPrivileged && isCronCall
        ? CRON_WINDOW_HOURS
        : Math.min(Number(body.window_hours) || MANUAL_WINDOW_HOURS, 24);
      const limit = isPrivileged && isCronCall ? CRON_BATCH_LIMIT : MANUAL_BATCH_LIMIT;
      const missed = await findMissedAlerts(supabase, organizationId, windowHours);
      const summary = await sendMissedAlerts(supabase, missed, limit);
      return json({ success: true, mode: "sweep", ...summary });
    }

    // Envio de um lead específico: só chamadas internas (service role ou cron).
    if (!isServiceCall && !isCronCall) {
      return json({ success: false, error: "Unauthorized" }, 401);
    }
    if (!body.lead_id || !body.organization_id) {
      return json({ success: false, error: "lead_id and organization_id are required" }, 400);
    }

    const result = await sendLeadGroupAlert(supabase, {
      leadId: body.lead_id,
      organizationId: body.organization_id,
      sourceLabel: body.source_label || "CRM",
    });

    return json({ success: true, ...result });
  } catch (error: any) {
    return json({ success: false, error: error?.message || "Unexpected error" }, 500);
  }
});
