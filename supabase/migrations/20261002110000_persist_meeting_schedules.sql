-- A meeting schedule is persisted on the lead, not only as history JSON.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS data_agendamento_reuniao timestamptz;

CREATE OR REPLACE FUNCTION public.meeting_schedule_timestamp(p_content text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  payload jsonb;
  schedule_date text;
  schedule_time text;
BEGIN
  payload := p_content::jsonb;
  schedule_date := COALESCE(payload->>'data', payload->>'date');
  schedule_time := COALESCE(payload->>'hora', payload->>'time', '00:00');

  IF schedule_date ~ '^\d{4}-\d{2}-\d{2}$' AND schedule_time ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
    RETURN (schedule_date || ' ' || schedule_time)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  IF schedule_date ~ '^\d{2}/\d{2}/\d{4}$' AND schedule_time ~ '^\d{2}:\d{2}(:\d{2})?$' THEN
    RETURN (to_date(schedule_date, 'DD/MM/YYYY') + schedule_time::time) AT TIME ZONE 'America/Sao_Paulo';
  END IF;
  RETURN NULL;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Backfill the latest valid meeting already stored in the activity history.
WITH latest_schedule AS (
  SELECT DISTINCT ON (lead_id)
    lead_id,
    public.meeting_schedule_timestamp(content) AS scheduled_at
  FROM public.lead_activities
  WHERE activity_type = 'Agendamento Reunião'
    AND public.meeting_schedule_timestamp(content) IS NOT NULL
  ORDER BY lead_id, created_at DESC, id DESC
)
UPDATE public.leads lead
SET data_agendamento_reuniao = latest_schedule.scheduled_at
FROM latest_schedule
WHERE lead.id = latest_schedule.lead_id;

-- Synchronize all current and future insert, update, and delete paths.
CREATE OR REPLACE FUNCTION public.sync_lead_meeting_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_lead_id uuid;
  schedule_at timestamptz;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.activity_type <> 'Agendamento Reunião' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' AND OLD.activity_type <> 'Agendamento Reunião' THEN
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.activity_type <> 'Agendamento Reunião'
     AND NEW.activity_type <> 'Agendamento Reunião' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    target_lead_id := OLD.lead_id;
  ELSE
    target_lead_id := NEW.lead_id;
  END IF;

  SELECT public.meeting_schedule_timestamp(activity.content)
  INTO schedule_at
  FROM public.lead_activities activity
  WHERE activity.lead_id = target_lead_id
    AND activity.activity_type = 'Agendamento Reunião'
    AND public.meeting_schedule_timestamp(activity.content) IS NOT NULL
  ORDER BY activity.created_at DESC, activity.id DESC
  LIMIT 1;

  UPDATE public.leads
  SET data_agendamento_reuniao = schedule_at
  WHERE id = target_lead_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_lead_meeting_schedule_on_activity ON public.lead_activities;
CREATE TRIGGER sync_lead_meeting_schedule_on_activity
AFTER INSERT OR UPDATE OR DELETE ON public.lead_activities
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_meeting_schedule();
