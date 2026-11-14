import assert from "node:assert/strict";
import test from "node:test";

import {
  firstName,
  formatAppointment,
  isSameAppointment,
  reminderSkipReason,
  renderReminderMessage,
  type AppointmentReminder,
  type ReminderLead,
  type ReminderSettings,
} from "../supabase/functions/_shared/appointment-reminders.ts";

// 15/11/2026 14:30 em Brasília (UTC-3)
const APPOINTMENT = "2026-11-15T17:30:00.000Z";

const settings: ReminderSettings = {
  enabled: true,
  d1_morning_enabled: true,
  d1_morning_message: "Oi, {{nome}}! Amanhã, {{data}}, às {{hora}}.",
  d1_afternoon_enabled: false,
  d1_afternoon_message: "x",
  day_of_enabled: true,
  day_of_message: "Hoje às {{hora}}.",
  no_show_task_enabled: true,
};

const lead: ReminderLead = {
  id: "lead-1",
  nome_lead: "Maria Silva",
  telefone_lead: "5511999998888",
  organization_id: "org-1",
  funnel_stage_id: "stage-agendado",
  data_agendamento_reuniao: APPOINTMENT,
  status_reuniao: null,
  responsavel_user_id: "user-1",
  whatsapp_instance_id: null,
};

const reminder = (kind: AppointmentReminder["kind"]): AppointmentReminder => ({
  id: "r1",
  lead_id: "lead-1",
  kind,
  appointment_at: APPOINTMENT,
});

test("formatAppointment usa o horário de Brasília", () => {
  assert.deepEqual(formatAppointment(APPOINTMENT), { data: "15/11", hora: "14:30" });
});

test("renderReminderMessage troca nome, data e hora", () => {
  assert.equal(
    renderReminderMessage(settings.d1_morning_message, "Maria Silva", APPOINTMENT),
    "Oi, Maria! Amanhã, 15/11, às 14:30.",
  );
});

test("renderReminderMessage sem nome não deixa vírgula sobrando", () => {
  assert.equal(renderReminderMessage("Oi, {{nome}}! Hoje às {{hora}}.", "5511999998888", APPOINTMENT), "Oi! Hoje às 14:30.");
  assert.equal(renderReminderMessage("Oi, {{nome}}! Hoje às {{hora}}.", null, APPOINTMENT), "Oi! Hoje às 14:30.");
});

test("firstName ignora nome que é telefone", () => {
  assert.equal(firstName("  Ana Paula "), "Ana");
  assert.equal(firstName("5511999998888"), "");
});

test("isSameAppointment tolera 1 minuto", () => {
  assert.equal(isSameAppointment(APPOINTMENT, "2026-11-15T17:30:40.000Z"), true);
  assert.equal(isSameAppointment(APPOINTMENT, "2026-11-15T18:30:00.000Z"), false);
  assert.equal(isSameAppointment(APPOINTMENT, null), false);
});

test("lembrete sai quando o lead continua agendado no mesmo horário", () => {
  assert.equal(reminderSkipReason(reminder("d1_morning"), lead, true, settings), null);
  assert.equal(reminderSkipReason(reminder("no_show"), lead, true, settings), null);
});

test("lembrete não sai quando algo mudou", () => {
  assert.equal(reminderSkipReason(reminder("d1_morning"), null, true, settings), "lead_missing");
  assert.equal(reminderSkipReason(reminder("d1_morning"), lead, false, settings), "not_scheduled_stage");
  assert.equal(
    reminderSkipReason(reminder("d1_morning"), { ...lead, data_agendamento_reuniao: "2026-11-16T17:30:00.000Z" }, true, settings),
    "appointment_changed",
  );
  assert.equal(reminderSkipReason(reminder("d1_afternoon"), lead, true, settings), "disabled");
  assert.equal(reminderSkipReason(reminder("day_of"), lead, true, { ...settings, enabled: false }), "disabled");
  assert.equal(reminderSkipReason(reminder("day_of"), lead, true, null), "disabled");
  assert.equal(reminderSkipReason(reminder("day_of"), { ...lead, telefone_lead: " " }, true, settings), "missing_phone");
});

test("tarefa de no-show não é criada se a reunião já foi marcada", () => {
  assert.equal(reminderSkipReason(reminder("no_show"), { ...lead, status_reuniao: "realizada" }, true, settings), "meeting_marked");
  assert.equal(reminderSkipReason(reminder("no_show"), { ...lead, status_reuniao: "no_show" }, true, settings), "meeting_marked");
  // Sem telefone a tarefa interna ainda faz sentido.
  assert.equal(reminderSkipReason(reminder("no_show"), { ...lead, telefone_lead: null }, true, settings), null);
});
