-- Lembretes do agendamento (Fase 3a do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- Quando o lead está na etapa marcada como "Agendamento" (funnel_stages.linked_event = 'scheduled')
-- e tem leads.data_agendamento_reuniao, a organização pode ligar:
--   d1_morning   — mensagem ao lead no dia anterior, 08:00 (Brasília)
--   d1_afternoon — mensagem ao lead no dia anterior, 17:00
--   day_of       — mensagem ao lead 2 horas antes
--   no_show      — tarefa interna ao responsável 10 minutos depois, se ninguém marcou a reunião
--
-- Regras:
-- - Nasce desligado em toda organização (enabled = false).
-- - Sair da etapa, mudar a data ou desligar cancela o que ainda não saiu.
-- - Horário que já passou não é criado; lembrete atrasado mais de 30 min não sai.
-- - O mesmo lembrete não sai duas vezes para o mesmo horário de agendamento.
-- - Nada aqui pode impedir a atualização do lead: falhas viram WARNING.

-- ------------------------------------------------------------
-- 1. Configuração por organização
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_reminder_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  d1_morning_enabled boolean NOT NULL DEFAULT true,
  d1_morning_message text NOT NULL DEFAULT
    'Oi, {{nome}}! Passando para lembrar do seu horário amanhã, {{data}}, às {{hora}}. Se precisar remarcar, é só responder esta mensagem.',
  d1_afternoon_enabled boolean NOT NULL DEFAULT true,
  d1_afternoon_message text NOT NULL DEFAULT
    'Oi, {{nome}}! Seu horário é amanhã às {{hora}}. Responda esta mensagem para confirmar.',
  day_of_enabled boolean NOT NULL DEFAULT true,
  day_of_message text NOT NULL DEFAULT
    'Oi, {{nome}}! Falta pouco: seu horário é hoje às {{hora}}.',
  no_show_task_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.appointment_reminder_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem os lembretes da organização" ON public.appointment_reminder_settings;
CREATE POLICY "Membros veem os lembretes da organização"
  ON public.appointment_reminder_settings FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins criam os lembretes da organização" ON public.appointment_reminder_settings;
CREATE POLICY "Admins criam os lembretes da organização"
  ON public.appointment_reminder_settings FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins alteram os lembretes da organização" ON public.appointment_reminder_settings;
CREATE POLICY "Admins alteram os lembretes da organização"
  ON public.appointment_reminder_settings FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

-- ------------------------------------------------------------
-- 2. Lembretes agendados
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('d1_morning', 'd1_afternoon', 'day_of', 'no_show')),
  appointment_at timestamptz NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'sent', 'skipped', 'cancelled', 'failed')),
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (lead_id, kind, appointment_at)
);

CREATE INDEX IF NOT EXISTS appointment_reminders_due_idx
  ON public.appointment_reminders (scheduled_for)
  WHERE status IN ('pending', 'running');

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem os lembretes agendados da organização" ON public.appointment_reminders;
CREATE POLICY "Membros veem os lembretes agendados da organização"
  ON public.appointment_reminders FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- ------------------------------------------------------------
-- 3. Horários de cada lembrete
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_reminder_time(p_kind text, p_appointment_at timestamptz)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'd1_morning' THEN
      (((p_appointment_at AT TIME ZONE 'America/Sao_Paulo')::date - 1) + time '08:00') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'd1_afternoon' THEN
      (((p_appointment_at AT TIME ZONE 'America/Sao_Paulo')::date - 1) + time '17:00') AT TIME ZONE 'America/Sao_Paulo'
    WHEN 'day_of' THEN p_appointment_at - interval '2 hours'
    WHEN 'no_show' THEN p_appointment_at + interval '10 minutes'
  END;
$$;

-- ------------------------------------------------------------
-- 4. Sincronização: recalcula os lembretes de um lead
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_appointment_reminders(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead record;
  v_settings public.appointment_reminder_settings%ROWTYPE;
  v_is_scheduled boolean := false;
  v_kind text;
  v_kinds text[] := ARRAY[]::text[];
  v_time timestamptz;
BEGIN
  SELECT id, organization_id, funnel_stage_id, data_agendamento_reuniao
    INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_lead.funnel_stage_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.funnel_stages
      WHERE id = v_lead.funnel_stage_id AND linked_event = 'scheduled'
    ) INTO v_is_scheduled;
  END IF;

  IF v_lead.organization_id IS NOT NULL THEN
    SELECT * INTO v_settings
    FROM public.appointment_reminder_settings
    WHERE organization_id = v_lead.organization_id;
  END IF;

  IF v_is_scheduled AND v_lead.data_agendamento_reuniao IS NOT NULL AND COALESCE(v_settings.enabled, false) THEN
    IF v_settings.d1_morning_enabled THEN v_kinds := array_append(v_kinds, 'd1_morning'); END IF;
    IF v_settings.d1_afternoon_enabled THEN v_kinds := array_append(v_kinds, 'd1_afternoon'); END IF;
    IF v_settings.day_of_enabled THEN v_kinds := array_append(v_kinds, 'day_of'); END IF;
    IF v_settings.no_show_task_enabled THEN v_kinds := array_append(v_kinds, 'no_show'); END IF;
  END IF;

  -- Cancela o que não vale mais: saiu da etapa, mudou a data, desligou o lembrete.
  UPDATE public.appointment_reminders
  SET status = 'cancelled', finished_at = now(),
      last_error = 'Cancelado: o lead saiu da etapa de agendamento, a data mudou ou o lembrete foi desligado.'
  WHERE lead_id = p_lead_id
    AND status = 'pending'
    AND (
      appointment_at IS DISTINCT FROM v_lead.data_agendamento_reuniao
      OR NOT (kind = ANY (v_kinds))
    );

  FOREACH v_kind IN ARRAY v_kinds LOOP
    v_time := public.appointment_reminder_time(v_kind, v_lead.data_agendamento_reuniao);
    CONTINUE WHEN v_time <= now();

    INSERT INTO public.appointment_reminders (organization_id, lead_id, kind, appointment_at, scheduled_for)
    VALUES (v_lead.organization_id, p_lead_id, v_kind, v_lead.data_agendamento_reuniao, v_time)
    ON CONFLICT (lead_id, kind, appointment_at) DO UPDATE
      SET status = 'pending', scheduled_for = EXCLUDED.scheduled_for, last_error = NULL, finished_at = NULL
      WHERE appointment_reminders.status = 'cancelled';
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_appointment_reminders(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_appointment_reminders(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sync_appointment_reminders(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_appointment_reminders(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.leads_sync_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.funnel_stage_id IS NOT DISTINCT FROM OLD.funnel_stage_id
     AND NEW.data_agendamento_reuniao IS NOT DISTINCT FROM OLD.data_agendamento_reuniao
     AND NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.data_agendamento_reuniao IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.sync_appointment_reminders(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[appointment-reminders] Falha ao sincronizar lembretes do lead %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_sync_appointment_reminders ON public.leads;
CREATE TRIGGER leads_sync_appointment_reminders
  AFTER INSERT OR UPDATE OF funnel_stage_id, data_agendamento_reuniao, organization_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.leads_sync_appointment_reminders();

CREATE OR REPLACE FUNCTION public.touch_appointment_reminder_settings()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_reminder_settings_touch ON public.appointment_reminder_settings;
CREATE TRIGGER appointment_reminder_settings_touch
  BEFORE INSERT OR UPDATE ON public.appointment_reminder_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_appointment_reminder_settings();

-- Ligar, desligar ou mudar os tipos recalcula os leads agendados da organização.
CREATE OR REPLACE FUNCTION public.settings_resync_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  FOR v_lead_id IN
    SELECT DISTINCT l.id
    FROM public.leads l
    LEFT JOIN public.appointment_reminders r ON r.lead_id = l.id AND r.status = 'pending'
    WHERE l.organization_id = NEW.organization_id
      AND (
        r.id IS NOT NULL
        OR (l.data_agendamento_reuniao > now() - interval '1 hour'
            AND EXISTS (
              SELECT 1 FROM public.funnel_stages fs
              WHERE fs.id = l.funnel_stage_id AND fs.linked_event = 'scheduled'
            ))
      )
  LOOP
    BEGIN
      PERFORM public.sync_appointment_reminders(v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[appointment-reminders] Falha ao recalcular lead %: %', v_lead_id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_reminder_settings_resync ON public.appointment_reminder_settings;
CREATE TRIGGER appointment_reminder_settings_resync
  AFTER INSERT OR UPDATE ON public.appointment_reminder_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.settings_resync_appointment_reminders();

-- Marcar uma etapa como "Agendamento" depois (ou desmarcar) recalcula os leads dessa etapa.
CREATE OR REPLACE FUNCTION public.stage_event_resync_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF (OLD.linked_event IS NOT DISTINCT FROM NEW.linked_event)
     OR NOT ('scheduled' IN (COALESCE(OLD.linked_event, ''), COALESCE(NEW.linked_event, ''))) THEN
    RETURN NEW;
  END IF;

  FOR v_lead_id IN
    SELECT id FROM public.leads
    WHERE funnel_stage_id = NEW.id
      AND data_agendamento_reuniao > now() - interval '1 hour'
  LOOP
    BEGIN
      PERFORM public.sync_appointment_reminders(v_lead_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[appointment-reminders] Falha ao recalcular lead %: %', v_lead_id, SQLERRM;
    END;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_stages_resync_appointment_reminders ON public.funnel_stages;
CREATE TRIGGER funnel_stages_resync_appointment_reminders
  AFTER UPDATE OF linked_event ON public.funnel_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.stage_event_resync_appointment_reminders();

-- ------------------------------------------------------------
-- 5. Reserva dos lembretes vencidos para a Edge Function
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_due_appointment_reminders(p_limit integer DEFAULT 25)
RETURNS SETOF public.appointment_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.appointment_reminders
  SET status = 'failed', finished_at = now(),
      last_error = 'Execução interrompida antes de terminar; não foi repetida para não duplicar a mensagem.'
  WHERE status = 'running'
    AND started_at < now() - interval '10 minutes';

  UPDATE public.appointment_reminders
  SET status = 'skipped', finished_at = now(),
      last_error = 'Atrasado mais de 30 minutos; não saiu fora de hora.'
  WHERE status = 'pending'
    AND scheduled_for < now() - interval '30 minutes';

  RETURN QUERY
  UPDATE public.appointment_reminders r
  SET status = 'running', started_at = now()
  WHERE r.id IN (
    SELECT id
    FROM public.appointment_reminders
    WHERE status = 'pending'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_appointment_reminders(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_due_appointment_reminders(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_due_appointment_reminders(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_appointment_reminders(integer) TO service_role;

-- ------------------------------------------------------------
-- 6. Cron de 1 minuto
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('send-appointment-reminders');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'send-appointment-reminders',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/send-appointment-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $cron$
);
