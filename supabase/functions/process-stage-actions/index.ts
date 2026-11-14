// Executa as ações de etapa enfileiradas em stage_action_runs pelo trigger de leads
// (migration 20261114150000_stage_moves_and_actions.sql).
//
// Chamada pelo próprio trigger (pg_net, na hora) e por um cron de 1 minuto, sempre com
// x-cron-secret. Cada ação é reservada por claim_stage_action_runs e roda no máximo uma vez.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { corsHeaders } from "../_shared/cors.ts";
import { isInternalServiceRoleRequest } from "../_shared/organization-auth.ts";
import {
  normalizeEmail,
  pickTaskCreator,
  renderMessageTemplate,
  SKIP_REASON_TEXT,
  skipReason,
  type StageActionLead,
  type StageActionRun,
} from "../_shared/stage-actions.ts";

const BATCH_LIMIT = 25;
// Margem para não estourar o tempo da função quando há muitas ações na fila.
const TIME_BUDGET_MS = 45_000;

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
type Outcome = { status: "done" | "skipped" | "failed"; result?: unknown; error?: string };

const LEAD_COLUMNS =
  "id, nome_lead, telefone_lead, funnel_stage_id, organization_id, responsavel_user_id, whatsapp_instance_id, valor";

async function sendMessage(supabase: Supabase, run: StageActionRun, lead: StageActionLead): Promise<Outcome> {
  const message = renderMessageTemplate(String(run.stage_config?.message_template ?? ""), lead);
  if (!message) return { status: "skipped", error: SKIP_REASON_TEXT.missing_config };

  // Canal do lead; se ele não tiver, o primeiro canal conectado da mesma organização.
  let instanceName: string | null = null;
  if (lead.whatsapp_instance_id) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status, organization_id")
      .eq("id", lead.whatsapp_instance_id)
      .maybeSingle();
    if (data && data.organization_id === lead.organization_id && data.status === "connected") {
      instanceName = data.instance_name;
    }
  }
  if (!instanceName) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("organization_id", lead.organization_id)
      .eq("status", "connected")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    instanceName = data?.instance_name ?? null;
  }
  if (!instanceName) {
    return { status: "failed", error: "Nenhum canal de WhatsApp conectado na organização." };
  }

  const { data, error } = await supabase.functions.invoke("send-whatsapp-message", {
    body: {
      instance_name: instanceName,
      remoteJid: lead.telefone_lead,
      message_text: message,
      leadId: lead.id,
    },
  });
  if (error || data?.success === false) {
    return { status: "failed", error: `Envio recusado: ${error?.message ?? data?.error ?? "sem detalhe"}` };
  }
  return { status: "done", result: { instance_name: instanceName } };
}

async function createTask(supabase: Supabase, run: StageActionRun, lead: StageActionLead): Promise<Outcome> {
  const { data: board } = await supabase
    .from("kanban_boards")
    .select("id, kanban_columns(id, position)")
    .eq("organization_id", lead.organization_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const columns = [...((board?.kanban_columns as { id: string; position: number | null }[]) ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const columnId = columns[0]?.id;
  if (!columnId) return { status: "failed", error: "A organização não tem quadro de tarefas com coluna." };

  let ownerId: string | null = null;
  if (!run.moved_by && !lead.responsavel_user_id) {
    const { data: owner } = await supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", lead.organization_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
    ownerId = owner?.user_id ?? null;
  }
  const createdBy = pickTaskCreator(run.moved_by, lead.responsavel_user_id, ownerId);
  if (!createdBy) return { status: "failed", error: "Não há usuário para registrar como criador da tarefa." };

  const estimated = Number(run.stage_config?.estimated_time);
  const { data, error } = await supabase
    .from("kanban_cards")
    .insert({
      column_id: columnId,
      content: String(run.stage_config?.task_title ?? "").trim(),
      description: `Follow-up com lead: ${lead.nome_lead ?? ""}`.trim(),
      estimated_time: Number.isFinite(estimated) && estimated > 0 ? estimated : null,
      created_by: createdBy,
      lead_id: lead.id,
    })
    .select("id")
    .single();
  if (error) return { status: "failed", error: `Não foi possível criar a tarefa: ${error.message}` };
  return { status: "done", result: { kanban_card_id: data.id } };
}

async function assignAgent(supabase: Supabase, run: StageActionRun, lead: StageActionLead): Promise<Outcome> {
  const email = normalizeEmail(run.stage_config?.agent_email);
  const { data: member } = await supabase
    .from("organization_members")
    .select("user_id, email, is_active")
    .eq("organization_id", lead.organization_id)
    // ilike para ignorar maiúsculas; % e _ escapados para casar só o e-mail exato.
    .ilike("email", email.replace(/[%_\\]/g, (char) => `\\${char}`))
    .limit(1)
    .maybeSingle();
  if (!member?.user_id || member.is_active === false) {
    return { status: "failed", error: `Nenhum colaborador ativo com o e-mail ${email} na organização.` };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", member.user_id)
    .maybeSingle();
  const name = profile?.full_name || member.email || email;

  const { error } = await supabase
    .from("leads")
    .update({ responsavel_user_id: member.user_id, responsavel: name })
    .eq("id", lead.id);
  if (error) return { status: "failed", error: `Não foi possível atribuir o lead: ${error.message}` };
  return { status: "done", result: { responsavel_user_id: member.user_id } };
}

async function metaPurchase(supabase: Supabase, _run: StageActionRun, lead: StageActionLead): Promise<Outcome> {
  const { data, error } = await supabase.functions.invoke("send-meta-conversion-event", {
    body: { lead_id: lead.id, event_name: "Purchase", value: lead.valor || 0 },
  });
  if (error) return { status: "failed", error: `Evento de conversão recusado: ${error.message}` };
  // Sem pixel configurado a função responde success:false; isso não é falha da ação.
  if (data?.success === false) return { status: "skipped", error: data?.message ?? "Conversão não enviada." };
  return { status: "done", result: data ?? null };
}

const EXECUTORS = {
  send_message: sendMessage,
  create_task: createTask,
  assign_agent: assignAgent,
  meta_purchase: metaPurchase,
} as const;

async function processRun(supabase: Supabase, run: StageActionRun): Promise<Outcome> {
  const { data: lead } = await supabase.from("leads").select(LEAD_COLUMNS).eq("id", run.lead_id).maybeSingle();
  const reason = skipReason(run, (lead as StageActionLead | null) ?? null);
  if (reason) return { status: "skipped", error: SKIP_REASON_TEXT[reason] };
  return EXECUTORS[run.action](supabase, run, lead as StageActionLead);
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
  const summary = { done: 0, skipped: 0, failed: 0 };

  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const { data: runs, error } = await supabase.rpc("claim_stage_action_runs", { p_limit: BATCH_LIMIT });
    if (error) {
      console.error("[stage-actions] Falha ao reservar ações:", error.message);
      return json({ success: false, error: error.message, ...summary }, 500);
    }
    if (!runs?.length) break;

    for (const run of runs as StageActionRun[]) {
      let outcome: Outcome;
      try {
        outcome = await processRun(supabase, run);
      } catch (err) {
        outcome = { status: "failed", error: err instanceof Error ? err.message : String(err) };
      }

      summary[outcome.status] += 1;
      if (outcome.status === "failed") {
        console.error(`[stage-actions] ${run.action} do lead ${run.lead_id} falhou: ${outcome.error}`);
      }

      const { error: updateError } = await supabase
        .from("stage_action_runs")
        .update({
          status: outcome.status,
          result: outcome.result ?? null,
          last_error: outcome.error ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      if (updateError) console.error(`[stage-actions] Falha ao gravar resultado de ${run.id}:`, updateError.message);
    }

    if (runs.length < BATCH_LIMIT) break;
  }

  return json({ success: true, ...summary });
});
