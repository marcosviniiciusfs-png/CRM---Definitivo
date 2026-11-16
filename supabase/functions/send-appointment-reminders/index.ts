// Envia os lembretes do agendamento que venceram (migration 20261114180000_appointment_reminders.sql).
// Chamada pelo cron a cada minuto com x-cron-secret. Cada lembrete é reservado por
// claim_due_appointment_reminders e sai no máximo uma vez.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { corsHeaders } from "../_shared/cors.ts";
import { isInternalServiceRoleRequest } from "../_shared/organization-auth.ts";
import {
  findFirstTaskColumnId,
  findOrganizationOwnerId,
  resolveLeadInstanceName,
} from "../_shared/lead-outbound.ts";
import {
  formatAppointment,
  messageTemplateFor,
  REMINDER_SKIP_TEXT,
  reminderSkipReason,
  renderReminderMessage,
  type AppointmentReminder,
  type ReminderLead,
  type ReminderSettings,
} from "../_shared/appointment-reminders.ts";

const BATCH_LIMIT = 25;
const TIME_BUDGET_MS = 45_000;
const NO_SHOW_TASK_TITLE = "Lead não entrou na reunião. Ligar agora.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const encoder = new TextEncoder();
function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function isAuthorized(req: Request): boolean {
  if (isInternalServiceRoleRequest(req)) return true;
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const provided = req.headers.get("x-cron-secret")?.trim() ?? "";
  return !!expected && !!provided && constantTimeEqual(provided, expected);
}

type Supabase = ReturnType<typeof createClient>;
type Outcome = { status: "sent" | "skipped" | "failed"; result?: unknown; error?: string };

const LEAD_COLUMNS =
  "id, nome_lead, telefone_lead, organization_id, funnel_stage_id, data_agendamento_reuniao, status_reuniao, responsavel_user_id, whatsapp_instance_id";

async function sendLeadMessage(
  supabase: Supabase,
  reminder: AppointmentReminder,
  lead: ReminderLead,
  settings: ReminderSettings,
): Promise<Outcome> {
  const template = messageTemplateFor(settings, reminder.kind) ?? "";
  const message = renderReminderMessage(template, lead.nome_lead, reminder.appointment_at);
  if (!message) return { status: "skipped", error: "A mensagem do lembrete está vazia." };

  const instanceName = await resolveLeadInstanceName(supabase, lead);
  if (!instanceName) return { status: "failed", error: "Nenhum canal de WhatsApp conectado na organização." };

  const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
    body: { instance_name: instanceName, remoteJid: lead.telefone_lead, message_text: message, leadId: lead.id },
  });
  if (error || data?.success === false) {
    return { status: "failed", error: `Envio recusado: ${error?.message ?? data?.error ?? "sem detalhe"}` };
  }
  return { status: "sent", result: { instance_name: instanceName } };
}

async function createNoShowTask(supabase: Supabase, reminder: AppointmentReminder, lead: ReminderLead): Promise<Outcome> {
  const organizationId = lead.organization_id!;
  const columnId = await findFirstTaskColumnId(supabase, organizationId);
  if (!columnId) return { status: "failed", error: "A organização não tem quadro de tarefas com coluna." };

  const assigneeId = lead.responsavel_user_id ?? (await findOrganizationOwnerId(supabase, organizationId));
  if (!assigneeId) return { status: "failed", error: "O lead não tem responsável e a organização não tem dono." };

  const { data, hora } = formatAppointment(reminder.appointment_at);
  const { data: card, error } = await supabase
    .from("kanban_cards")
    .insert({
      column_id: columnId,
      content: NO_SHOW_TASK_TITLE,
      description: `${lead.nome_lead ?? "Lead"}: reunião marcada para ${data} às ${hora}.`,
      // Só o dia (Brasília), no mesmo formato do formulário de tarefas.
      due_date: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()),
      created_by: assigneeId,
      lead_id: lead.id,
    })
    .select("id")
    .single();
  if (error) return { status: "failed", error: `Não foi possível criar a tarefa: ${error.message}` };

  const { error: assignError } = await supabase
    .from("kanban_card_assignees")
    .insert({ card_id: card.id, user_id: assigneeId });
  if (assignError) console.warn(`[appointment-reminders] Tarefa ${card.id} sem responsável: ${assignError.message}`);

  return { status: "sent", result: { kanban_card_id: card.id } };
}

async function processReminder(supabase: Supabase, reminder: AppointmentReminder): Promise<Outcome> {
  const { data: lead } = await supabase.from("leads").select(LEAD_COLUMNS).eq("id", reminder.lead_id).maybeSingle();
  const typedLead = (lead as ReminderLead | null) ?? null;

  let isScheduledStage = false;
  let settings: ReminderSettings | null = null;
  if (typedLead?.funnel_stage_id) {
    const { data: stage } = await supabase
      .from("funnel_stages")
      .select("linked_event")
      .eq("id", typedLead.funnel_stage_id)
      .maybeSingle();
    isScheduledStage = stage?.linked_event === "scheduled";
  }
  if (typedLead?.organization_id) {
    const { data } = await supabase
      .from("appointment_reminder_settings")
      .select("*")
      .eq("organization_id", typedLead.organization_id)
      .maybeSingle();
    settings = (data as ReminderSettings | null) ?? null;
  }

  const reason = reminderSkipReason(reminder, typedLead, isScheduledStage, settings);
  if (reason) return { status: "skipped", error: REMINDER_SKIP_TEXT[reason] };

  return reminder.kind === "no_show"
    ? createNoShowTask(supabase, reminder, typedLead!)
    : sendLeadMessage(supabase, reminder, typedLead!, settings!);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ success: false, error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios." }, 500);
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { "x-move-source": "automation" } },
  });

  const startedAt = Date.now();
  const summary = { sent: 0, skipped: 0, failed: 0 };

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: reminders, error } = await supabase.rpc("claim_due_appointment_reminders", { p_limit: BATCH_LIMIT });
    if (error) {
      console.error("[appointment-reminders] Falha ao reservar lembretes:", error.message);
      return json({ success: false, error: error.message, ...summary }, 500);
    }
    if (!reminders?.length) break;

    for (const reminder of reminders as AppointmentReminder[]) {
      let outcome: Outcome;
      try {
        outcome = await processReminder(supabase, reminder);
      } catch (err) {
        outcome = { status: "failed", error: err instanceof Error ? err.message : String(err) };
      }
      summary[outcome.status] += 1;
      if (outcome.status === "failed") {
        console.error(`[appointment-reminders] ${reminder.kind} do lead ${reminder.lead_id} falhou: ${outcome.error}`);
      }

      const { error: updateError } = await supabase
        .from("appointment_reminders")
        .update({
          status: outcome.status,
          result: outcome.result ?? null,
          last_error: outcome.error ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", reminder.id);
      if (updateError) console.error(`[appointment-reminders] Falha ao gravar ${reminder.id}:`, updateError.message);
    }

    if (reminders.length < BATCH_LIMIT) break;
  }

  return json({ success: true, ...summary });
});
