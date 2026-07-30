import {
  getEvolutionApiKey,
  getEvolutionApiUrl,
  normalizeUrl,
} from "./evolution-config.ts";

type SupabaseAdmin = any;

interface LeadAlertInput {
  leadId: string;
  organizationId: string;
  sourceLabel: string;
}

const clean = (value: unknown, fallback = "Não informado") => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const normalizeSource = (value: unknown): "whatsapp" | "facebook" | "webhook" => {
  const source = normalizeText(value);
  if (source.includes("facebook") || source.includes("meta")) return "facebook";
  if (source.includes("webhook") || source.includes("form")) return "webhook";
  return "whatsapp";
};

const fieldValue = (field: any) => {
  const value = field?.value ?? field?.values?.[0] ?? field?.answer ?? field?.response;
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
};

function getInterest(lead: any) {
  const additional = lead?.additional_data || {};
  const direct =
    additional.interesse || additional.interest || additional.produto ||
    additional.product || additional.servico || additional.service ||
    additional.objetivo || additional.objective;
  if (direct) return direct;

  const fields = Array.isArray(additional.fields) ? additional.fields : [];
  const explicit = fields.find((field: any) => {
    const name = normalizeText(field?.name || field?.label || field?.question);
    return ["interesse", "produto", "servico", "objetivo", "plano", "curso", "tratamento"]
      .some((token) => name.includes(token)) && fieldValue(field);
  });
  if (explicit) return fieldValue(explicit);

  return lead?.descricao_negocio || null;
}

function validResponsibleName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) return null;
  const normalized = normalizeText(name);
  if (["sem responsavel", "nao atribuido", "unassigned"].includes(normalized)) return null;
  return name;
}

async function resolveUserName(
  supabase: SupabaseAdmin,
  organizationId: string,
  userId: string,
) {
  const [{ data: member }, { data: profile }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("display_name, email")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  return validResponsibleName(profile?.full_name) ||
    validResponsibleName(member?.display_name) ||
    validResponsibleName(member?.email);
}

async function resolveResponsibleName(supabase: SupabaseAdmin, lead: any) {
  const directName = validResponsibleName(lead?.responsavel);
  if (directName && lead?.responsavel_user_id) return directName;

  let responsibleUserId = lead?.responsavel_user_id || null;
  if (!responsibleUserId) {
    const { data: history } = await supabase
      .from("lead_distribution_history")
      .select("to_user_id")
      .eq("lead_id", lead.id)
      .eq("organization_id", lead.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    responsibleUserId = history?.to_user_id || null;
  }

  if (!responsibleUserId) return null;
  return await resolveUserName(supabase, lead.organization_id, responsibleUserId) || directName;
}

async function waitForAssignment(supabase: SupabaseAdmin, lead: any) {
  if (await resolveResponsibleName(supabase, lead)) return lead;

  let latest = lead;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const { data } = await supabase
      .from("leads")
      .select("id, nome_lead, telefone_lead, source, responsavel, responsavel_user_id, descricao_negocio, additional_data, organization_id, funnel_id, funnel_stage_id")
      .eq("id", lead.id)
      .eq("organization_id", lead.organization_id)
      .maybeSingle();
    if (data) {
      latest = data;
      if (await resolveResponsibleName(supabase, data)) break;
    }
  }
  return latest;
}

function buildMessage(lead: any, sourceLabel: string) {
  return [
    "🚨 *Novo lead recebido*",
    "",
    `👤 *Nome:* ${clean(lead?.nome_lead)}`,
    `📞 *Telefone:* ${clean(lead?.telefone_lead)}`,
    `🙋 *Responsável:* ${clean(lead?.responsavel, "Sem responsável")}`,
    `🎯 *Interesse:* ${clean(getInterest(lead))}`,
    `📍 *Origem:* ${clean(sourceLabel || lead?.source)}`,
  ].join("\n");
}

async function writeLog(supabase: SupabaseAdmin, payload: Record<string, unknown>) {
  const { error } = await supabase.from("webhook_logs").insert({
    organization_id: payload.organization_id,
    instance_name: String(payload.instance_name || "lead-group-alert"),
    event_type: "lead_group_alert",
    status: payload.status,
    payload,
    error_message: payload.error_message || null,
    message_content: payload.message_content || null,
    remote_jid: payload.group_id || null,
    direction: "outgoing",
    message_type: "text",
  });
  if (error) console.warn("[lead-group-alert] Falha ao gravar log:", error.message);
}

export async function sendLeadGroupAlert(supabase: SupabaseAdmin, input: LeadAlertInput) {
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, nome_lead, telefone_lead, source, responsavel, responsavel_user_id, descricao_negocio, additional_data, organization_id, funnel_id, funnel_stage_id")
    .eq("id", input.leadId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (leadError || !lead) {
    return { sent: false, skipped: true, reason: "lead_not_found" };
  }

  const assignedLead = await waitForAssignment(supabase, lead);
  const responsibleName = await resolveResponsibleName(supabase, assignedLead);
  if (!responsibleName) {
    return { sent: false, skipped: true, reason: "assignment_pending" };
  }
  const leadForMessage = responsibleName
    ? { ...assignedLead, responsavel: responsibleName }
    : assignedLead;

  const { data: firstStage } = await supabase
    .from("funnel_stages")
    .select("id")
    .eq("funnel_id", assignedLead.funnel_id)
    .order("position")
    .limit(1)
    .maybeSingle();

  if (firstStage?.id && assignedLead.funnel_stage_id && firstStage.id !== assignedLead.funnel_stage_id) {
    return { sent: false, skipped: true, reason: "not_first_stage" };
  }

  const { data: channel } = await supabase
    .from("whatsapp_instances")
    .select("id, instance_name, organization_id, status, lead_alert_group_id, lead_alert_last_sent_at, lead_alert_source_filters")
    .eq("organization_id", input.organizationId)
    .eq("lead_alerts_enabled", true)
    .not("lead_alert_group_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!channel?.lead_alert_group_id) {
    return { sent: false, skipped: true, reason: "not_configured" };
  }

  const enabledSources = Array.isArray(channel.lead_alert_source_filters) &&
      channel.lead_alert_source_filters.length > 0
    ? channel.lead_alert_source_filters
    : ["whatsapp", "facebook", "webhook"];
  if (!enabledSources.includes(normalizeSource(input.sourceLabel || assignedLead.source))) {
    return { sent: false, skipped: true, reason: "source_filtered" };
  }

  const connected = ["connected", "open"].includes(String(channel.status || "").toLowerCase());
  const validGroup = String(channel.lead_alert_group_id).endsWith("@g.us");
  if (!connected || !validGroup) {
    await writeLog(supabase, {
      organization_id: input.organizationId,
      instance_name: channel.instance_name,
      group_id: channel.lead_alert_group_id,
      lead_id: input.leadId,
      status: "error",
      error_message: !connected ? `Canal ${channel.status || "desconhecido"}` : "Grupo de aviso inválido",
    });
    return { sent: false, skipped: true, reason: !connected ? "channel_not_connected" : "invalid_group_id" };
  }

  const lastSent = channel.lead_alert_last_sent_at
    ? new Date(channel.lead_alert_last_sent_at).getTime()
    : 0;
  const waitMs = 3500 - (Date.now() - lastSent);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

  const text = buildMessage(leadForMessage, input.sourceLabel);
  const response = await fetch(
    `${normalizeUrl(getEvolutionApiUrl())}/message/sendText/${encodeURIComponent(channel.instance_name)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getEvolutionApiKey() },
      body: JSON.stringify({ number: channel.lead_alert_group_id, text }),
    },
  );

  if (!response.ok) {
    const responseText = await response.text().catch(() => "unknown");
    await writeLog(supabase, {
      organization_id: input.organizationId,
      instance_name: channel.instance_name,
      group_id: channel.lead_alert_group_id,
      lead_id: input.leadId,
      status: "error",
      message_content: text,
      error_message: `Evolution ${response.status}: ${responseText.slice(0, 300)}`,
    });
    return { sent: false, skipped: false, reason: "evolution_error" };
  }

  await supabase
    .from("whatsapp_instances")
    .update({ lead_alert_last_sent_at: new Date().toISOString() })
    .eq("id", channel.id);

  await writeLog(supabase, {
    organization_id: input.organizationId,
    instance_name: channel.instance_name,
    group_id: channel.lead_alert_group_id,
    lead_id: input.leadId,
    status: "success",
    message_content: text,
  });

  return { sent: true, skipped: false };
}
