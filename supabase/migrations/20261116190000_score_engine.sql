-- Placar e ranking (Fase 2 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md e
-- Fase 1 de docs/superpowers/plans/2026-11-16-gamificacao-ranking.md).
--
-- - score_events: um registro por fato pontuável, gravado só por funções do servidor.
--   Desfazer o fato anula o registro (voided_at) em vez de apagar; refazer reativa.
--   Única por (source_table, source_id, event_kind): nada conta duas vezes.
-- - score_rules: pontos por tipo de evento e limite diário por vendedor, por organização.
--   Sem linha = padrão de score_default_*().
-- - Fontes: cota vendida (modo consórcio, pela regra da organização), etapa ganha (demais
--   organizações), reunião agendada/feita (eventos de etapa) e resposta rápida no WhatsApp.
-- - Crédito vai para o vendedor da cota ou o responsável do lead no momento do fato.
-- - ranking_board(): quadro por vendedor no período; esconde o R$ dos colegas quando a
--   organização desliga ranking_show_values (owner/admin sempre veem).

-- ------------------------------------------------------------
-- 1. Visibilidade do R$ no ranking
-- ------------------------------------------------------------
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS ranking_show_values boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_ranking_show_values(p_organization_id uuid, p_show boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização pode mudar esta configuração.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.organization_settings (organization_id, ranking_show_values, updated_at, updated_by)
  VALUES (p_organization_id, coalesce(p_show, true), now(), auth.uid())
  ON CONFLICT (organization_id) DO UPDATE
    SET ranking_show_values = EXCLUDED.ranking_show_values,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;
  RETURN coalesce(p_show, true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_ranking_show_values(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ranking_show_values(uuid, boolean) TO authenticated;

-- ------------------------------------------------------------
-- 2. Regras de pontuação
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_default_points(p_kind text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'venda' THEN 100
    WHEN 'reuniao_agendada' THEN 10
    WHEN 'reuniao_feita' THEN 25
    WHEN 'resposta_5min' THEN 5
    WHEN 'resposta_15min' THEN 2
    WHEN 'meta_batida' THEN 300
    WHEN 'recorde_pessoal' THEN 100
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.score_default_daily_cap(p_kind text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_kind
    WHEN 'resposta_5min' THEN 50
    WHEN 'resposta_15min' THEN 20
    WHEN 'reuniao_agendada' THEN 100
    ELSE NULL
  END;
$$;

CREATE TABLE IF NOT EXISTS public.score_rules (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_kind text NOT NULL CHECK (event_kind IN (
    'venda', 'reuniao_agendada', 'reuniao_feita', 'resposta_5min', 'resposta_15min', 'meta_batida', 'recorde_pessoal'
  )),
  points integer NOT NULL CHECK (points BETWEEN 0 AND 10000),
  daily_cap integer CHECK (daily_cap IS NULL OR daily_cap > 0),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  PRIMARY KEY (organization_id, event_kind)
);

ALTER TABLE public.score_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem as regras de pontos" ON public.score_rules;
CREATE POLICY "Membros veem as regras de pontos"
  ON public.score_rules FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins mudam as regras de pontos" ON public.score_rules;
CREATE POLICY "Admins mudam as regras de pontos"
  ON public.score_rules FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.score_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.score_rules TO authenticated;

-- ------------------------------------------------------------
-- 3. Eventos de pontuação
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_kind text NOT NULL,
  points integer NOT NULL DEFAULT 0,
  amount numeric(15,2),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  occurred_at timestamptz NOT NULL,
  occurred_on date NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_events_source_key UNIQUE (source_table, source_id, event_kind)
);

CREATE INDEX IF NOT EXISTS score_events_org_day_idx ON public.score_events (organization_id, occurred_on) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS score_events_user_day_idx ON public.score_events (user_id, occurred_on) WHERE voided_at IS NULL;

ALTER TABLE public.score_events ENABLE ROW LEVEL SECURITY;

-- O vendedor vê os próprios eventos; owner/admin veem todos. O ranking dos colegas passa por
-- ranking_board(), que respeita a visibilidade do R$.
DROP POLICY IF EXISTS "Vendedor vê os próprios pontos" ON public.score_events;
CREATE POLICY "Vendedor vê os próprios pontos"
  ON public.score_events FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
  );
-- Sem políticas de escrita: só as funções abaixo gravam.

REVOKE ALL ON public.score_events FROM anon;
GRANT SELECT ON public.score_events TO authenticated;

-- Grava (ou reativa) um evento, aplicando a regra e o limite diário da organização.
CREATE OR REPLACE FUNCTION public.score_upsert(
  p_organization_id uuid,
  p_user_id uuid,
  p_kind text,
  p_amount numeric,
  p_lead_id uuid,
  p_source_table text,
  p_source_id text,
  p_occurred_at timestamptz,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_points integer;
  v_cap integer;
  v_enabled boolean;
  v_day date := (p_occurred_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_organization_id IS NULL THEN
    RETURN;
  END IF;

  SELECT r.points, r.daily_cap, r.enabled INTO v_points, v_cap, v_enabled
  FROM public.score_rules r
  WHERE r.organization_id = p_organization_id AND r.event_kind = p_kind;

  IF NOT FOUND THEN
    v_points := public.score_default_points(p_kind);
    v_cap := public.score_default_daily_cap(p_kind);
    v_enabled := true;
  END IF;

  IF NOT v_enabled THEN
    v_points := 0;
  END IF;

  IF v_cap IS NOT NULL AND v_points > 0 THEN
    SELECT coalesce(sum(points), 0) INTO v_used
    FROM public.score_events
    WHERE user_id = p_user_id
      AND organization_id = p_organization_id
      AND event_kind = p_kind
      AND occurred_on = v_day
      AND voided_at IS NULL
      AND NOT (source_table = p_source_table AND source_id = p_source_id);
    v_points := greatest(0, least(v_points, v_cap - v_used));
  END IF;

  INSERT INTO public.score_events (
    organization_id, user_id, event_kind, points, amount, lead_id,
    source_table, source_id, occurred_at, occurred_on, details
  ) VALUES (
    p_organization_id, p_user_id, p_kind, v_points, p_amount, p_lead_id,
    p_source_table, p_source_id, p_occurred_at, v_day, coalesce(p_details, '{}'::jsonb)
  )
  ON CONFLICT (source_table, source_id, event_kind) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        points = EXCLUDED.points,
        amount = EXCLUDED.amount,
        lead_id = EXCLUDED.lead_id,
        occurred_at = EXCLUDED.occurred_at,
        occurred_on = EXCLUDED.occurred_on,
        details = EXCLUDED.details,
        voided_at = NULL,
        void_reason = NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.score_void(p_source_table text, p_source_id text, p_kind text, p_reason text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.score_events
  SET voided_at = now(), void_reason = p_reason
  WHERE source_table = p_source_table
    AND source_id = p_source_id
    AND event_kind = p_kind
    AND voided_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.score_upsert(uuid, uuid, text, numeric, uuid, text, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.score_void(text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Fonte: cotas vendidas (modo consórcio)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_sync_consortium_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale public.consortium_sales%ROWTYPE;
  v_rule text;
  v_counts boolean;
  v_day date;
BEGIN
  SELECT * INTO v_sale FROM public.consortium_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    PERFORM public.score_void('consortium_sales', p_sale_id::text, 'venda', 'cota apagada');
    RETURN;
  END IF;

  SELECT coalesce(consortium_sale_counts_on, 'adesao') INTO v_rule
  FROM public.organization_settings WHERE organization_id = v_sale.organization_id;
  v_rule := coalesce(v_rule, 'adesao');

  v_counts := CASE
    WHEN v_sale.status = 'cancelada' THEN false
    WHEN v_rule = 'primeira_parcela' THEN v_sale.status = 'ativa'
    ELSE true
  END;
  v_day := CASE WHEN v_rule = 'primeira_parcela' THEN v_sale.first_installment_paid_on ELSE v_sale.adhesion_date END;

  IF v_counts AND v_sale.seller_user_id IS NOT NULL AND v_day IS NOT NULL THEN
    PERFORM public.score_upsert(
      v_sale.organization_id, v_sale.seller_user_id, 'venda', v_sale.credit_amount, v_sale.lead_id,
      'consortium_sales', v_sale.id::text,
      (v_day::timestamp + time '12:00') AT TIME ZONE 'America/Sao_Paulo',
      jsonb_build_object('administrator_id', v_sale.administrator_id, 'asset_type', v_sale.asset_type)
    );
  ELSE
    PERFORM public.score_void(
      'consortium_sales', v_sale.id::text, 'venda',
      CASE WHEN v_sale.status = 'cancelada' THEN 'cota cancelada' ELSE 'aguardando a 1ª parcela' END
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.score_sync_consortium_sale(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consortium_sales_score_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.score_sync_consortium_sale(coalesce(NEW.id, OLD.id));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[score] Falha ao pontuar a cota %: %', coalesce(NEW.id, OLD.id), SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consortium_sales_score ON public.consortium_sales;
CREATE TRIGGER consortium_sales_score
  AFTER INSERT OR UPDATE OR DELETE ON public.consortium_sales
  FOR EACH ROW EXECUTE FUNCTION public.consortium_sales_score_trigger();

-- Mudar a regra recalcula as cotas da organização.
CREATE OR REPLACE FUNCTION public.set_consortium_sale_rule(p_organization_id uuid, p_rule text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sale uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para mudar esta configuração.' USING ERRCODE = '42501';
  END IF;
  IF p_rule IS NULL OR p_rule NOT IN ('adesao', 'primeira_parcela') THEN
    RAISE EXCEPTION 'Regra inválida: %', p_rule USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_org_admin(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização pode mudar a regra.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_settings (organization_id, consortium_sale_counts_on, updated_at, updated_by)
  VALUES (p_organization_id, p_rule, now(), v_user)
  ON CONFLICT (organization_id) DO UPDATE
    SET consortium_sale_counts_on = EXCLUDED.consortium_sale_counts_on,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  FOR v_sale IN SELECT id FROM public.consortium_sales WHERE organization_id = p_organization_id LOOP
    PERFORM public.score_sync_consortium_sale(v_sale);
  END LOOP;

  RETURN p_rule;
END;
$$;

REVOKE ALL ON FUNCTION public.set_consortium_sale_rule(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_consortium_sale_rule(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 5. Fonte: movimentação de etapa (venda ganha fora do consórcio e reuniões)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.score_from_stage_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead record;
  v_to record;
  v_from record;
  v_segment text;
  v_day date := (NEW.moved_at AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  BEGIN
    SELECT id, organization_id, responsavel_user_id, valor INTO v_lead
    FROM public.leads WHERE id = NEW.lead_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT stage_type, linked_event INTO v_to FROM public.funnel_stages WHERE id = NEW.to_stage_id;
    SELECT stage_type INTO v_from FROM public.funnel_stages WHERE id = NEW.from_stage_id;

    SELECT segment INTO v_segment FROM public.organization_settings WHERE organization_id = v_lead.organization_id;

    -- Venda ganha (organizações fora do modo consórcio; no consórcio a venda é a cota).
    IF coalesce(v_segment, 'generico') <> 'consorcio' THEN
      IF v_to.stage_type = 'won' THEN
        PERFORM public.score_upsert(
          v_lead.organization_id, v_lead.responsavel_user_id, 'venda', v_lead.valor, v_lead.id,
          'leads_won', v_lead.id::text, NEW.moved_at, '{}'::jsonb
        );
      ELSIF v_from.stage_type = 'won' THEN
        PERFORM public.score_void('leads_won', v_lead.id::text, 'venda', 'saiu da etapa de ganho');
      END IF;
    END IF;

    -- Reuniões: no máximo uma de cada tipo por lead por dia.
    IF v_to.linked_event = 'scheduled' THEN
      PERFORM public.score_upsert(
        v_lead.organization_id, v_lead.responsavel_user_id, 'reuniao_agendada', NULL, v_lead.id,
        'lead_meeting', v_lead.id::text || ':' || v_day::text, NEW.moved_at, '{}'::jsonb
      );
    ELSIF v_to.linked_event = 'attended' THEN
      PERFORM public.score_upsert(
        v_lead.organization_id, v_lead.responsavel_user_id, 'reuniao_feita', NULL, v_lead.id,
        'lead_meeting', v_lead.id::text || ':' || v_day::text, NEW.moved_at, '{}'::jsonb
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[score] Falha ao pontuar a movimentação %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_stage_history_score ON public.funnel_stage_history;
CREATE TRIGGER funnel_stage_history_score
  AFTER INSERT ON public.funnel_stage_history
  FOR EACH ROW EXECUTE FUNCTION public.score_from_stage_move();

-- ------------------------------------------------------------
-- 6. Fonte: resposta rápida no WhatsApp
-- ------------------------------------------------------------
-- Quando a mensagem da equipe desliga "aguardando resposta", o tempo de espera vira ponto:
-- até 5 min, até 15 min. Mensagens antigas importadas não pontuam (espera longa).
CREATE OR REPLACE FUNCTION public.score_from_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wait integer := EXTRACT(EPOCH FROM (now() - OLD.aguardando_resposta_desde))::integer;
  v_kind text;
BEGIN
  BEGIN
    IF v_wait < 0 OR NEW.responsavel_user_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_kind := CASE WHEN v_wait <= 300 THEN 'resposta_5min' WHEN v_wait <= 900 THEN 'resposta_15min' ELSE NULL END;
    IF v_kind IS NOT NULL THEN
      PERFORM public.score_upsert(
        NEW.organization_id, NEW.responsavel_user_id, v_kind, NULL, NEW.id,
        'lead_reply', NEW.id::text || ':' || EXTRACT(EPOCH FROM OLD.aguardando_resposta_desde)::bigint::text,
        now(), jsonb_build_object('wait_seconds', v_wait)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[score] Falha ao pontuar a resposta do lead %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_score_reply ON public.leads;
CREATE TRIGGER leads_score_reply
  AFTER UPDATE OF aguardando_resposta_desde ON public.leads
  FOR EACH ROW
  WHEN (OLD.aguardando_resposta_desde IS NOT NULL AND NEW.aguardando_resposta_desde IS NULL)
  EXECUTE FUNCTION public.score_from_reply();

-- ------------------------------------------------------------
-- 7. Quadro do ranking
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_board(p_organization_id uuid, p_from date, p_to date)
RETURNS TABLE (
  user_id uuid,
  production numeric,
  sales integer,
  points integer,
  leads_received integer,
  meetings_scheduled integer,
  meetings_done integer,
  fast_replies integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_show boolean;
  v_is_admin boolean;
BEGIN
  IF v_caller IS NULL OR NOT public.is_org_member(v_caller, p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso ao ranking desta organização.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(ranking_show_values, true) INTO v_show
  FROM public.organization_settings WHERE organization_id = p_organization_id;
  v_show := coalesce(v_show, true);
  v_is_admin := public.is_org_admin(v_caller, p_organization_id);

  RETURN QUERY
  WITH members AS (
    SELECT DISTINCT m.user_id
    FROM public.organization_members m
    WHERE m.organization_id = p_organization_id
      AND m.user_id IS NOT NULL
      AND coalesce(m.is_active, true)
  ),
  events AS (
    SELECT e.user_id,
      sum(e.amount) FILTER (WHERE e.event_kind = 'venda') AS production,
      count(*) FILTER (WHERE e.event_kind = 'venda') AS sales,
      sum(e.points) AS points,
      count(*) FILTER (WHERE e.event_kind = 'reuniao_agendada') AS meetings_scheduled,
      count(*) FILTER (WHERE e.event_kind = 'reuniao_feita') AS meetings_done,
      count(*) FILTER (WHERE e.event_kind IN ('resposta_5min', 'resposta_15min')) AS fast_replies
    FROM public.score_events e
    WHERE e.organization_id = p_organization_id
      AND e.voided_at IS NULL
      AND e.occurred_on BETWEEN p_from AND p_to
    GROUP BY e.user_id
  ),
  received AS (
    SELECT h.to_user_id AS user_id, count(DISTINCT h.lead_id) AS leads_received
    FROM public.lead_distribution_history h
    WHERE h.organization_id = p_organization_id
      AND (h.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
    GROUP BY h.to_user_id
  )
  SELECT mb.user_id,
    CASE WHEN v_show OR v_is_admin OR mb.user_id = v_caller THEN coalesce(ev.production, 0) ELSE NULL END,
    coalesce(ev.sales, 0)::integer,
    coalesce(ev.points, 0)::integer,
    coalesce(rc.leads_received, 0)::integer,
    coalesce(ev.meetings_scheduled, 0)::integer,
    coalesce(ev.meetings_done, 0)::integer,
    coalesce(ev.fast_replies, 0)::integer
  FROM members mb
  LEFT JOIN events ev ON ev.user_id = mb.user_id
  LEFT JOIN received rc ON rc.user_id = mb.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ranking_board(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ranking_board(uuid, date, date) TO authenticated;

-- ------------------------------------------------------------
-- 8. Carga inicial: mês atual a partir do histórico de etapas
-- ------------------------------------------------------------
DO $$
DECLARE
  v_month_start timestamptz := date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_row record;
BEGIN
  FOR v_row IN
    SELECT h.id, h.lead_id, h.moved_at, fs.stage_type, fs.linked_event,
           l.organization_id, l.responsavel_user_id, l.valor, l.funnel_stage_id, s.segment
    FROM public.funnel_stage_history h
    JOIN public.funnel_stages fs ON fs.id = h.to_stage_id
    JOIN public.leads l ON l.id = h.lead_id
    LEFT JOIN public.organization_settings s ON s.organization_id = l.organization_id
    WHERE h.moved_at >= v_month_start
      AND (fs.stage_type = 'won' OR fs.linked_event IN ('scheduled', 'attended'))
    ORDER BY h.moved_at
  LOOP
    -- Venda: só se o lead continua numa etapa de ganho.
    IF v_row.stage_type = 'won' AND coalesce(v_row.segment, 'generico') <> 'consorcio'
       AND EXISTS (SELECT 1 FROM public.funnel_stages c WHERE c.id = v_row.funnel_stage_id AND c.stage_type = 'won') THEN
      PERFORM public.score_upsert(v_row.organization_id, v_row.responsavel_user_id, 'venda', v_row.valor, v_row.lead_id,
        'leads_won', v_row.lead_id::text, v_row.moved_at, '{"carga_inicial": true}'::jsonb);
    END IF;
    IF v_row.linked_event = 'scheduled' THEN
      PERFORM public.score_upsert(v_row.organization_id, v_row.responsavel_user_id, 'reuniao_agendada', NULL, v_row.lead_id,
        'lead_meeting', v_row.lead_id::text || ':' || (v_row.moved_at AT TIME ZONE 'America/Sao_Paulo')::date::text,
        v_row.moved_at, '{"carga_inicial": true}'::jsonb);
    ELSIF v_row.linked_event = 'attended' THEN
      PERFORM public.score_upsert(v_row.organization_id, v_row.responsavel_user_id, 'reuniao_feita', NULL, v_row.lead_id,
        'lead_meeting', v_row.lead_id::text || ':' || (v_row.moved_at AT TIME ZONE 'America/Sao_Paulo')::date::text,
        v_row.moved_at, '{"carga_inicial": true}'::jsonb);
    END IF;
  END LOOP;
END $$;
