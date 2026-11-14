-- Ações de etapa no servidor (Fase 2 do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- Antes: as ações de etapa (mensagem, tarefa, atribuição, conversão Meta no ganho) rodavam no navegador,
-- só quando alguém arrastava o card no Pipeline. Mover em lote, pelo celular, pela roleta ou por
-- Edge Function não disparava nada, e nenhuma movimentação era registrada.
--
-- Agora:
-- 1. Toda mudança de leads.funnel_stage_id grava uma linha em funnel_stage_history, com a origem
--    (human = usuário logado, automation = Edge Function que se identifica, system = resto).
-- 2. Se a etapa de destino tem ação, a movimentação vira uma linha em stage_action_runs.
-- 3. A Edge Function process-stage-actions executa cada linha no máximo uma vez: é chamada na hora
--    (pg_net) e por um cron de 1 minuto, que pega o que ficou para trás.
--
-- Nada aqui pode impedir a movimentação do lead: falhas viram WARNING.

-- ------------------------------------------------------------
-- 1. Histórico com origem
-- ------------------------------------------------------------
ALTER TABLE public.funnel_stage_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'system';

ALTER TABLE public.funnel_stage_history
  DROP CONSTRAINT IF EXISTS funnel_stage_history_source_check;

ALTER TABLE public.funnel_stage_history
  ADD CONSTRAINT funnel_stage_history_source_check
  CHECK (source IN ('human', 'automation', 'system'));

CREATE INDEX IF NOT EXISTS funnel_stage_history_lead_moved_at_idx
  ON public.funnel_stage_history (lead_id, moved_at DESC);

COMMENT ON COLUMN public.funnel_stage_history.source IS
  'Quem moveu: human (usuário logado), automation (Edge Function com header x-move-source: automation), system (demais).';

-- ------------------------------------------------------------
-- 2. Fila de ações de etapa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stage_action_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  history_id uuid NOT NULL UNIQUE REFERENCES public.funnel_stage_history(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('send_message', 'create_task', 'assign_agent', 'meta_purchase')),
  stage_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  moved_by uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'skipped', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS stage_action_runs_pending_idx
  ON public.stage_action_runs (created_at)
  WHERE status IN ('pending', 'running');

CREATE INDEX IF NOT EXISTS stage_action_runs_lead_idx
  ON public.stage_action_runs (lead_id, created_at DESC);

ALTER TABLE public.stage_action_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem as ações de etapa da organização" ON public.stage_action_runs;
CREATE POLICY "Membros veem as ações de etapa da organização"
  ON public.stage_action_runs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND COALESCE(om.is_active, true)
    )
  );

COMMENT ON TABLE public.stage_action_runs IS
  'Ações de etapa disparadas por movimentação de lead. Escrita só pelo trigger e pela Edge Function process-stage-actions.';

-- ------------------------------------------------------------
-- 3. Trigger em leads
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lead_stage_move_source()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_headers json;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN 'human';
  END IF;

  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN OTHERS THEN
    v_headers := NULL;
  END;

  IF v_headers ->> 'x-move-source' = 'automation' THEN
    RETURN 'automation';
  END IF;

  RETURN 'system';
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_action_for(p_stage_type text, p_config jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_stage_type = 'send_message' AND COALESCE(btrim(p_config ->> 'message_template'), '') <> '' THEN 'send_message'
    WHEN p_stage_type = 'create_task'  AND COALESCE(btrim(p_config ->> 'task_title'), '') <> ''       THEN 'create_task'
    WHEN p_stage_type = 'assign_agent' AND COALESCE(btrim(p_config ->> 'agent_email'), '') <> ''      THEN 'assign_agent'
    WHEN p_stage_type = 'won' THEN 'meta_purchase'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.record_lead_stage_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_history_id uuid;
  v_previous_moved_at timestamptz;
  v_stage record;
  v_action text;
  v_run_id uuid;
BEGIN
  IF NEW.funnel_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.funnel_stage_id IS NOT DISTINCT FROM OLD.funnel_stage_id THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF TG_OP = 'UPDATE' THEN
      SELECT moved_at INTO v_previous_moved_at
      FROM public.funnel_stage_history
      WHERE lead_id = NEW.id
      ORDER BY moved_at DESC
      LIMIT 1;
    END IF;

    INSERT INTO public.funnel_stage_history (
      lead_id, funnel_id, from_stage_id, to_stage_id, moved_by, moved_at, source, duration_in_previous_stage
    ) VALUES (
      NEW.id,
      NEW.funnel_id,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.funnel_stage_id ELSE NULL END,
      NEW.funnel_stage_id,
      auth.uid(),
      now(),
      public.lead_stage_move_source(),
      CASE WHEN v_previous_moved_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (now() - v_previous_moved_at))::integer END
    )
    RETURNING id INTO v_history_id;

    -- Ações só quando o lead já estava numa etapa e mudou de etapa. Entrar no funil (lead novo,
    -- ou distribuição que define a primeira etapa) não dispara ação, como antes.
    IF TG_OP <> 'UPDATE' OR OLD.funnel_stage_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT id, stage_type, COALESCE(stage_config, '{}'::jsonb) AS stage_config
      INTO v_stage
    FROM public.funnel_stages
    WHERE id = NEW.funnel_stage_id;

    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    v_action := public.stage_action_for(v_stage.stage_type, v_stage.stage_config);
    IF v_action IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.stage_action_runs (
      organization_id, lead_id, history_id, stage_id, action, stage_config, moved_by
    ) VALUES (
      NEW.organization_id, NEW.id, v_history_id, v_stage.id, v_action, v_stage.stage_config, auth.uid()
    )
    RETURNING id INTO v_run_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[stage-move] Falha ao registrar movimentação do lead %: %', NEW.id, SQLERRM;
    RETURN NEW;
  END;

  -- Chamada imediata; o cron de 1 minuto cobre qualquer falha aqui.
  BEGIN
    PERFORM net.http_post(
      url := 'http://api-gw:8000/functions/v1/process-stage-actions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := jsonb_build_object('mode', 'drain', 'run_id', v_run_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[stage-move] Não foi possível chamar process-stage-actions agora: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_record_stage_move ON public.leads;
CREATE TRIGGER leads_record_stage_move
  AFTER INSERT OR UPDATE OF funnel_stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.record_lead_stage_move();

-- ------------------------------------------------------------
-- 4. Reserva das ações para a Edge Function (no máximo uma execução por ação)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_stage_action_runs(p_limit integer DEFAULT 25)
RETURNS SETOF public.stage_action_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Execução que travou no meio não é repetida: a mensagem pode já ter saído.
  UPDATE public.stage_action_runs
  SET status = 'failed',
      last_error = 'Execução interrompida antes de terminar; não foi repetida para não duplicar a ação.',
      finished_at = now()
  WHERE status = 'running'
    AND started_at < now() - interval '10 minutes';

  -- Ação que esperou demais (cron ou função fora do ar) não sai fora de hora.
  UPDATE public.stage_action_runs
  SET status = 'skipped',
      last_error = 'Ação expirada: ficou mais de 6 horas esperando.',
      finished_at = now()
  WHERE status = 'pending'
    AND created_at < now() - interval '6 hours';

  RETURN QUERY
  UPDATE public.stage_action_runs r
  SET status = 'running',
      started_at = now(),
      attempts = r.attempts + 1
  WHERE r.id IN (
    SELECT id
    FROM public.stage_action_runs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_stage_action_runs(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_stage_action_runs(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_stage_action_runs(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stage_action_runs(integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_lead_stage_move() FROM PUBLIC;

-- ------------------------------------------------------------
-- 5. Cron de reserva (pega o que a chamada imediata não processou)
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('process-stage-actions-sweep');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'process-stage-actions-sweep',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'http://api-gw:8000/functions/v1/process-stage-actions',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'crm_cron_secret'
          LIMIT 1
        )
      ),
      body := '{"mode":"drain"}'::jsonb
    ) AS request_id;
  $cron$
);
