import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Settings = Omit<Tables<"appointment_reminder_settings">, "updated_at" | "updated_by">;

// Mesmos textos padrão da migration 20261114180000_appointment_reminders.sql.
const DEFAULTS: Omit<Settings, "organization_id"> = {
  enabled: false,
  d1_morning_enabled: true,
  d1_morning_message:
    "Oi, {{nome}}! Passando para lembrar do seu horário amanhã, {{data}}, às {{hora}}. Se precisar remarcar, é só responder esta mensagem.",
  d1_afternoon_enabled: true,
  d1_afternoon_message: "Oi, {{nome}}! Seu horário é amanhã às {{hora}}. Responda esta mensagem para confirmar.",
  day_of_enabled: true,
  day_of_message: "Oi, {{nome}}! Falta pouco: seu horário é hoje às {{hora}}.",
  no_show_task_enabled: true,
};

const MESSAGE_REMINDERS = [
  {
    toggle: "d1_morning_enabled",
    message: "d1_morning_message",
    title: "Dia anterior, 8h",
    help: "Mensagem ao lead na manhã do dia anterior.",
  },
  {
    toggle: "d1_afternoon_enabled",
    message: "d1_afternoon_message",
    title: "Dia anterior, 17h",
    help: "Mensagem ao lead no fim da tarde do dia anterior.",
  },
  {
    toggle: "day_of_enabled",
    message: "day_of_message",
    title: "2 horas antes",
    help: "Mensagem ao lead no dia, 2 horas antes do horário.",
  },
] as const;

interface AppointmentRemindersDialogProps {
  organizationId: string;
}

export function AppointmentRemindersDialog({ organizationId }: AppointmentRemindersDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Settings>({ organization_id: organizationId, ...DEFAULTS });
  const [saving, setSaving] = useState(false);

  const settingsQuery = useQuery({
    queryKey: ["appointment-reminder-settings", organizationId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointment_reminder_settings")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open) return;
    const saved = settingsQuery.data;
    setForm(saved
      ? {
        organization_id: organizationId,
        enabled: saved.enabled,
        d1_morning_enabled: saved.d1_morning_enabled,
        d1_morning_message: saved.d1_morning_message,
        d1_afternoon_enabled: saved.d1_afternoon_enabled,
        d1_afternoon_message: saved.d1_afternoon_message,
        day_of_enabled: saved.day_of_enabled,
        day_of_message: saved.day_of_message,
        no_show_task_enabled: saved.no_show_task_enabled,
      }
      : { organization_id: organizationId, ...DEFAULTS });
  }, [open, settingsQuery.data, organizationId]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const emptyMessage = MESSAGE_REMINDERS.find(
    (reminder) => form[reminder.toggle] && !String(form[reminder.message]).trim(),
  );

  const handleSave = async () => {
    if (emptyMessage) {
      toast.error(`Escreva a mensagem de "${emptyMessage.title}" ou desligue esse lembrete.`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("appointment_reminder_settings")
      .upsert(form, { onConflict: "organization_id" });
    setSaving(false);

    if (error) {
      console.error("Erro ao salvar lembretes:", error);
      toast.error("Não foi possível salvar os lembretes. Tente novamente.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["appointment-reminder-settings", organizationId] });
    toast.success(form.enabled ? "Lembretes ligados." : "Lembretes salvos.");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BellRing className="h-4 w-4" />
          Lembretes
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Lembretes do agendamento</DialogTitle>
          <DialogDescription>
            Valem para leads na etapa marcada como "Agendamento" no funil e com data de reunião preenchida.
            Mudar a data ou tirar o lead da etapa cancela o que ainda não saiu.
          </DialogDescription>
        </DialogHeader>

        {settingsQuery.isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Carregando lembretes...</p>
        ) : settingsQuery.isError ? (
          <p className="py-6 text-sm text-destructive">
            Não foi possível carregar os lembretes. Feche e abra de novo.
          </p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="reminders-enabled" className="text-sm font-semibold">Ligar lembretes</Label>
                <p className="text-xs text-muted-foreground">
                  Desligado, nenhum lembrete sai, nem os já programados.
                </p>
              </div>
              <Switch
                id="reminders-enabled"
                checked={form.enabled}
                onCheckedChange={(checked) => update("enabled", checked)}
              />
            </div>

            {MESSAGE_REMINDERS.map((reminder) => (
              <div key={reminder.toggle} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label htmlFor={reminder.toggle} className="text-sm font-semibold">{reminder.title}</Label>
                    <p className="text-xs text-muted-foreground">{reminder.help}</p>
                  </div>
                  <Switch
                    id={reminder.toggle}
                    checked={form[reminder.toggle]}
                    onCheckedChange={(checked) => update(reminder.toggle, checked)}
                  />
                </div>
                {form[reminder.toggle] && (
                  <Textarea
                    value={form[reminder.message]}
                    onChange={(event) => update(reminder.message, event.target.value)}
                    rows={3}
                  />
                )}
              </div>
            ))}

            <p className="text-xs text-muted-foreground">
              Use {"{{nome}}"} para o primeiro nome do lead, {"{{data}}"} para o dia (15/11) e {"{{hora}}"} para o horário (14:30).
              As mensagens saem pelo canal de WhatsApp do lead.
            </p>

            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="no-show-task" className="text-sm font-semibold">Tarefa de no-show</Label>
                <p className="text-xs text-muted-foreground">
                  10 minutos depois do horário, cria a tarefa "Lead não entrou na reunião. Ligar agora." para o
                  responsável, se ninguém marcou a reunião como realizada ou no-show.
                </p>
              </div>
              <Switch
                id="no-show-task"
                checked={form.no_show_task_enabled}
                onCheckedChange={(checked) => update("no_show_task_enabled", checked)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || settingsQuery.isLoading || settingsQuery.isError}>
            {saving ? "Salvando..." : "Salvar lembretes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
