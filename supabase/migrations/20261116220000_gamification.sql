-- Gamificação completa (Fase 5 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md;
-- fases 2 a 4 de docs/superpowers/plans/2026-11-16-gamificacao-ranking.md).
--
-- - seller_goals: metas do mês por vendedor, equipe ou organização (produção, vendas, reuniões, pontos).
-- - user_achievements: medalhas conquistadas (catálogo no código e em gamification_refresh).
-- - campaigns: desafios com prêmio (corrida, meta, equipes, batalha) e revelação opcional.
-- - gamification_refresh(): apura metas batidas, recordes, medalhas e fecha campanhas vencidas.
--   Roda de hora em hora pelo pg_cron e quando alguém abre o ranking.
-- - seller_profile(), campaign_standings(), ranking_feed(): leituras com a regra de visibilidade do R$.
-- - Modo TV: organization_settings.tv_token + tv_board(token), única leitura liberada para anon.

-- ------------------------------------------------------------
-- 1. Metas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seller_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('user', 'team', 'org')),
  scope_id uuid,
  metric text NOT NULL CHECK (metric IN ('producao', 'vendas', 'reunioes', 'pontos')),
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  target numeric(15,2) NOT NULL CHECK (target > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT seller_goals_scope_id_check CHECK ((scope = 'org') = (scope_id IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS seller_goals_unique_idx
  ON public.seller_goals (organization_id, scope, coalesce(scope_id, '00000000-0000-0000-0000-000000000000'::uuid), metric, month);

ALTER TABLE public.seller_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros veem as metas" ON public.seller_goals;
CREATE POLICY "Membros veem as metas" ON public.seller_goals FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Admins definem metas" ON public.seller_goals;
CREATE POLICY "Admins definem metas" ON public.seller_goals FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
REVOKE ALL ON public.seller_goals FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seller_goals TO authenticated;

-- Valor de uma métrica para um conjunto de vendedores num intervalo.
CREATE OR REPLACE FUNCTION public.gamification_metric_value(
  p_organization_id uuid, p_users uuid[], p_metric text, p_from date, p_to date
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(CASE p_metric
    WHEN 'producao' THEN sum(e.amount) FILTER (WHERE e.event_kind = 'venda')
    WHEN 'vendas' THEN count(*) FILTER (WHERE e.event_kind = 'venda')
    WHEN 'reunioes' THEN count(*) FILTER (WHERE e.event_kind = 'reuniao_feita')
    WHEN 'pontos' THEN sum(e.points)
  END, 0)
  FROM public.score_events e
  WHERE e.organization_id = p_organization_id
    AND e.voided_at IS NULL
    AND e.occurred_on BETWEEN p_from AND p_to
    AND (p_users IS NULL OR e.user_id = ANY (p_users));
$$;
REVOKE ALL ON FUNCTION public.gamification_metric_value(uuid, uuid[], text, date, date) FROM PUBLIC, anon, authenticated;

-- Progresso das metas do mês (com a mesma regra de visibilidade do ranking para produção).
CREATE OR REPLACE FUNCTION public.goals_progress(p_organization_id uuid, p_month date)
RETURNS TABLE (goal_id uuid, scope text, scope_id uuid, metric text, target numeric, achieved numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_show boolean;
  v_admin boolean;
  v_month date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
BEGIN
  IF v_caller IS NULL OR NOT public.is_org_member(v_caller, p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso às metas desta organização.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(ranking_show_values, true) INTO v_show FROM public.organization_settings WHERE organization_id = p_organization_id;
  v_show := coalesce(v_show, true);
  v_admin := public.is_org_admin(v_caller, p_organization_id);

  RETURN QUERY
  SELECT g.id, g.scope, g.scope_id, g.metric,
    CASE WHEN g.metric = 'producao' AND g.scope = 'user' AND NOT v_show AND NOT v_admin AND g.scope_id <> v_caller THEN NULL ELSE g.target END,
    CASE WHEN g.metric = 'producao' AND g.scope = 'user' AND NOT v_show AND NOT v_admin AND g.scope_id <> v_caller THEN NULL ELSE
      public.gamification_metric_value(
        p_organization_id,
        CASE g.scope
          WHEN 'user' THEN ARRAY[g.scope_id]
          WHEN 'team' THEN (SELECT array_agg(tm.user_id) FROM public.team_members tm WHERE tm.team_id = g.scope_id)
          ELSE NULL
        END,
        g.metric, v_month, v_end)
    END
  FROM public.seller_goals g
  WHERE g.organization_id = p_organization_id AND g.month = v_month;
END;
$$;
REVOKE ALL ON FUNCTION public.goals_progress(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.goals_progress(uuid, date) TO authenticated;

-- ------------------------------------------------------------
-- 2. Medalhas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code text NOT NULL,
  period_key text NOT NULL DEFAULT 'sempre',
  earned_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT user_achievements_unique UNIQUE (organization_id, user_id, code, period_key)
);
CREATE INDEX IF NOT EXISTS user_achievements_user_idx ON public.user_achievements (organization_id, user_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros veem as medalhas" ON public.user_achievements;
CREATE POLICY "Membros veem as medalhas" ON public.user_achievements FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
REVOKE ALL ON public.user_achievements FROM anon;
GRANT SELECT ON public.user_achievements TO authenticated;

-- ------------------------------------------------------------
-- 3. Campanhas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  metric text NOT NULL CHECK (metric IN ('producao', 'vendas', 'reunioes', 'pontos')),
  format text NOT NULL CHECK (format IN ('corrida', 'meta', 'equipes', 'batalha')),
  target numeric(15,2) CHECK (target IS NULL OR target > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  participant_user_ids uuid[],
  team_ids uuid[],
  prize text CHECK (prize IS NULL OR char_length(prize) <= 200),
  reveal_on date,
  winners jsonb,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  CONSTRAINT campaigns_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT campaigns_meta_needs_target CHECK (format <> 'meta' OR target IS NOT NULL),
  CONSTRAINT campaigns_battle_two CHECK (format <> 'batalha' OR cardinality(participant_user_ids) = 2),
  CONSTRAINT campaigns_teams_needed CHECK (format <> 'equipes' OR cardinality(team_ids) >= 2)
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Membros veem as campanhas" ON public.campaigns;
CREATE POLICY "Membros veem as campanhas" ON public.campaigns FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
DROP POLICY IF EXISTS "Admins criam campanhas" ON public.campaigns;
CREATE POLICY "Admins criam campanhas" ON public.campaigns FOR ALL TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));
REVOKE ALL ON public.campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;

-- Classificação interna (sem checagem de quem pede): vendedores ou equipes.
CREATE OR REPLACE FUNCTION public.campaign_rows(p_campaign_id uuid)
RETURNS TABLE (entity_type text, entity_id uuid, value numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF c.format = 'equipes' THEN
    RETURN QUERY
    SELECT 'team'::text, t.id,
      public.gamification_metric_value(c.organization_id,
        (SELECT array_agg(tm.user_id) FROM public.team_members tm WHERE tm.team_id = t.id),
        c.metric, c.starts_on, c.ends_on)
    FROM public.teams t
    WHERE t.organization_id = c.organization_id AND t.id = ANY (c.team_ids);
  ELSE
    RETURN QUERY
    SELECT 'user'::text, m.user_id,
      public.gamification_metric_value(c.organization_id, ARRAY[m.user_id], c.metric, c.starts_on, c.ends_on)
    FROM (
      SELECT DISTINCT om.user_id FROM public.organization_members om
      WHERE om.organization_id = c.organization_id AND om.user_id IS NOT NULL AND coalesce(om.is_active, true)
        AND (c.participant_user_ids IS NULL OR om.user_id = ANY (c.participant_user_ids))
    ) m;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.campaign_rows(uuid) FROM PUBLIC, anon, authenticated;

-- Classificação para a tela. Antes da revelação, membro comum vê só a própria linha.
CREATE OR REPLACE FUNCTION public.campaign_standings(p_campaign_id uuid)
RETURNS TABLE (entity_type text, entity_id uuid, value numeric, hidden boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.campaigns%ROWTYPE;
  v_caller uuid := auth.uid();
  v_admin boolean;
  v_show boolean;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO c FROM public.campaigns WHERE id = p_campaign_id;
  IF NOT FOUND OR v_caller IS NULL OR NOT public.is_org_member(v_caller, c.organization_id) THEN
    RAISE EXCEPTION 'Campanha não encontrada.' USING ERRCODE = '42501';
  END IF;
  v_admin := public.is_org_admin(v_caller, c.organization_id);
  SELECT coalesce(ranking_show_values, true) INTO v_show FROM public.organization_settings WHERE organization_id = c.organization_id;
  v_show := coalesce(v_show, true);

  RETURN QUERY
  SELECT r.entity_type, r.entity_id,
    CASE WHEN c.metric = 'producao' AND NOT v_show AND NOT v_admin AND NOT (r.entity_type = 'user' AND r.entity_id = v_caller) THEN NULL ELSE r.value END,
    (c.reveal_on IS NOT NULL AND v_today < c.reveal_on AND NOT v_admin)
  FROM public.campaign_rows(p_campaign_id) r
  WHERE v_admin
     OR c.reveal_on IS NULL
     OR v_today >= c.reveal_on
     OR (r.entity_type = 'user' AND r.entity_id = v_caller)
     OR (r.entity_type = 'team' AND EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.team_id = r.entity_id AND tm.user_id = v_caller));
END;
$$;
REVOKE ALL ON FUNCTION public.campaign_standings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.campaign_standings(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 4. Apuração: metas, recordes, medalhas e campanhas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gamification_award(p_org uuid, p_user uuid, p_code text, p_period text, p_details jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_achievements (organization_id, user_id, code, period_key, details)
  VALUES (p_org, p_user, p_code, p_period, coalesce(p_details, '{}'::jsonb))
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_award(uuid, uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.gamification_refresh_org(p_org uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_week date := v_today - ((extract(isodow FROM v_today)::int + 6) % 7);
  v_week_start date := v_today - (extract(isodow FROM v_today)::int - 1);
  g record;
  u record;
  c record;
  v_value numeric;
  v_best numeric;
  v_winners jsonb;
BEGIN
  -- Meta individual batida no mês: medalha + pontos (uma vez por meta).
  FOR g IN SELECT * FROM public.seller_goals WHERE organization_id = p_org AND month = v_month AND scope = 'user' LOOP
    v_value := public.gamification_metric_value(p_org, ARRAY[g.scope_id], g.metric, v_month, v_today);
    IF v_value >= g.target THEN
      PERFORM public.score_upsert(p_org, g.scope_id, 'meta_batida', NULL, NULL, 'seller_goal', g.id::text, now(),
        jsonb_build_object('metric', g.metric, 'target', g.target));
      PERFORM public.gamification_award(p_org, g.scope_id, 'meta_batida', to_char(v_month, 'YYYY-MM'),
        jsonb_build_object('metric', g.metric, 'target', g.target));
    END IF;
  END LOOP;

  FOR u IN
    SELECT DISTINCT e.user_id FROM public.score_events e
    WHERE e.organization_id = p_org AND e.voided_at IS NULL AND e.occurred_on >= v_month - interval '1 year'
  LOOP
    -- Primeira venda.
    IF EXISTS (SELECT 1 FROM public.score_events WHERE organization_id = p_org AND user_id = u.user_id AND event_kind = 'venda' AND voided_at IS NULL) THEN
      PERFORM public.gamification_award(p_org, u.user_id, 'primeira_venda', 'sempre', '{}'::jsonb);
    END IF;
    -- 5 vendas no mês.
    IF public.gamification_metric_value(p_org, ARRAY[u.user_id], 'vendas', v_month, v_today) >= 5 THEN
      PERFORM public.gamification_award(p_org, u.user_id, 'cinco_vendas_mes', to_char(v_month, 'YYYY-MM'), '{}'::jsonb);
    END IF;
    -- 20 respostas em até 5 min na semana.
    IF (SELECT count(*) FROM public.score_events WHERE organization_id = p_org AND user_id = u.user_id
          AND event_kind = 'resposta_5min' AND voided_at IS NULL AND occurred_on BETWEEN v_week_start AND v_today) >= 20 THEN
      PERFORM public.gamification_award(p_org, u.user_id, 'resposta_relampago', to_char(v_week_start, 'IYYY-"S"IW'), '{}'::jsonb);
    END IF;
    -- 10 reuniões feitas no mês.
    IF public.gamification_metric_value(p_org, ARRAY[u.user_id], 'reunioes', v_month, v_today) >= 10 THEN
      PERFORM public.gamification_award(p_org, u.user_id, 'dez_reunioes_mes', to_char(v_month, 'YYYY-MM'), '{}'::jsonb);
    END IF;
    -- Recorde pessoal: produção do mês acima de qualquer mês anterior (precisa de histórico).
    v_value := public.gamification_metric_value(p_org, ARRAY[u.user_id], 'producao', v_month, v_today);
    SELECT max(m.total) INTO v_best FROM (
      SELECT sum(e.amount) AS total FROM public.score_events e
      WHERE e.organization_id = p_org AND e.user_id = u.user_id AND e.event_kind = 'venda'
        AND e.voided_at IS NULL AND e.occurred_on < v_month
      GROUP BY date_trunc('month', e.occurred_on)
    ) m;
    IF v_best IS NOT NULL AND v_value > v_best THEN
      PERFORM public.score_upsert(p_org, u.user_id, 'recorde_pessoal', v_value, NULL, 'personal_record',
        u.user_id::text || ':' || to_char(v_month, 'YYYY-MM'), now(), jsonb_build_object('previous_best', v_best));
      PERFORM public.gamification_award(p_org, u.user_id, 'recorde_pessoal', to_char(v_month, 'YYYY-MM'),
        jsonb_build_object('production', v_value, 'previous_best', v_best));
    END IF;
  END LOOP;

  -- Fecha campanhas vencidas.
  FOR c IN SELECT * FROM public.campaigns WHERE organization_id = p_org AND closed_at IS NULL AND ends_on < v_today LOOP
    IF c.format = 'meta' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('type', r.entity_type, 'id', r.entity_id, 'value', r.value) ORDER BY r.value DESC), '[]'::jsonb)
        INTO v_winners FROM public.campaign_rows(c.id) r WHERE r.value >= c.target;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_build_object('type', r.entity_type, 'id', r.entity_id, 'value', r.value)), '[]'::jsonb)
        INTO v_winners
      FROM public.campaign_rows(c.id) r
      WHERE r.value > 0 AND r.value = (SELECT max(x.value) FROM public.campaign_rows(c.id) x);
    END IF;
    UPDATE public.campaigns SET winners = v_winners, closed_at = now() WHERE id = c.id;
    FOR u IN SELECT (w ->> 'id')::uuid AS user_id FROM jsonb_array_elements(v_winners) w WHERE w ->> 'type' = 'user' LOOP
      PERFORM public.gamification_award(p_org, u.user_id, 'campeao_campanha', c.id::text, jsonb_build_object('campaign', c.name));
    END LOOP;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_refresh_org(uuid) FROM PUBLIC, anon, authenticated;

-- Chamada pela tela do ranking (no máximo a cada 5 minutos por organização).
CREATE OR REPLACE FUNCTION public.gamification_refresh(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key bigint := hashtextextended('gamification:' || p_organization_id::text, 0);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501';
  END IF;
  IF NOT pg_try_advisory_xact_lock(v_key) THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_settings
    WHERE organization_id = p_organization_id AND gamification_refreshed_at > now() - interval '5 minutes'
  ) THEN
    RETURN;
  END IF;
  PERFORM public.gamification_refresh_org(p_organization_id);
  INSERT INTO public.organization_settings (organization_id, gamification_refreshed_at)
  VALUES (p_organization_id, now())
  ON CONFLICT (organization_id) DO UPDATE SET gamification_refreshed_at = now();
END;
$$;

ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS gamification_refreshed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tv_token text;
CREATE UNIQUE INDEX IF NOT EXISTS organization_settings_tv_token_key ON public.organization_settings (tv_token) WHERE tv_token IS NOT NULL;

REVOKE ALL ON FUNCTION public.gamification_refresh(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gamification_refresh(uuid) TO authenticated;

-- Todas as organizações com atividade (cron).
CREATE OR REPLACE FUNCTION public.gamification_refresh_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  FOR v_org IN
    SELECT DISTINCT organization_id FROM public.score_events WHERE created_at > now() - interval '40 days'
    UNION
    SELECT DISTINCT organization_id FROM public.campaigns WHERE closed_at IS NULL
  LOOP
    BEGIN
      PERFORM public.gamification_refresh_org(v_org);
      UPDATE public.organization_settings SET gamification_refreshed_at = now() WHERE organization_id = v_org;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[gamification] Falha na organização %: %', v_org, SQLERRM;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.gamification_refresh_all() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'gamification-refresh';
    PERFORM cron.schedule('gamification-refresh', '7 * * * *', 'SELECT public.gamification_refresh_all()');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Perfil do vendedor: pontos de sempre, sequência e medalhas
-- ------------------------------------------------------------
-- Sequência: dias úteis seguidos (até hoje ou ontem) com pelo menos p_daily_points pontos.
CREATE OR REPLACE FUNCTION public.seller_profile(p_organization_id uuid, p_user_id uuid, p_daily_points integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_day date;
  v_streak integer := 0;
  v_lifetime integer;
  v_points integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_member(auth.uid(), p_organization_id)
     OR NOT public.is_org_member(p_user_id, p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(sum(points), 0) INTO v_lifetime FROM public.score_events
  WHERE organization_id = p_organization_id AND user_id = p_user_id AND voided_at IS NULL;

  v_day := v_today;
  -- Hoje ainda não conta contra a sequência se o dia não terminou.
  SELECT coalesce(sum(points), 0) INTO v_points FROM public.score_events
  WHERE organization_id = p_organization_id AND user_id = p_user_id AND voided_at IS NULL AND occurred_on = v_today;
  IF v_points >= p_daily_points THEN v_streak := 1; END IF;
  v_day := v_today - 1;
  LOOP
    IF extract(isodow FROM v_day) IN (6, 7) THEN
      v_day := v_day - 1;
      CONTINUE;
    END IF;
    SELECT coalesce(sum(points), 0) INTO v_points FROM public.score_events
    WHERE organization_id = p_organization_id AND user_id = p_user_id AND voided_at IS NULL AND occurred_on = v_day;
    EXIT WHEN v_points < p_daily_points OR v_streak >= 365;
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  END LOOP;

  RETURN jsonb_build_object(
    'lifetime_points', v_lifetime,
    'streak_days', v_streak,
    'daily_points_target', p_daily_points,
    'achievements', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', a.code, 'period', a.period_key, 'earned_at', a.earned_at) ORDER BY a.earned_at DESC)
      FROM public.user_achievements a WHERE a.organization_id = p_organization_id AND a.user_id = p_user_id
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.seller_profile(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_profile(uuid, uuid, integer) TO authenticated;

-- ------------------------------------------------------------
-- 6. Feed ao vivo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ranking_feed(p_organization_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE (id uuid, user_id uuid, kind text, amount numeric, occurred_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_show boolean;
  v_admin boolean;
BEGIN
  IF v_caller IS NULL OR NOT public.is_org_member(v_caller, p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(ranking_show_values, true) INTO v_show FROM public.organization_settings WHERE organization_id = p_organization_id;
  v_show := coalesce(v_show, true);
  v_admin := public.is_org_admin(v_caller, p_organization_id);

  RETURN QUERY
  SELECT f.id, f.user_id, f.kind,
    CASE WHEN v_show OR v_admin OR f.user_id = v_caller THEN f.amount ELSE NULL END,
    f.occurred_at
  FROM (
    SELECT e.id, e.user_id, e.event_kind AS kind, e.amount, e.created_at AS occurred_at
    FROM public.score_events e
    WHERE e.organization_id = p_organization_id AND e.voided_at IS NULL
      AND e.event_kind IN ('venda', 'meta_batida', 'recorde_pessoal')
    UNION ALL
    SELECT a.id, a.user_id, 'medalha:' || a.code, NULL::numeric, a.earned_at
    FROM public.user_achievements a
    WHERE a.organization_id = p_organization_id
  ) f
  ORDER BY f.occurred_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50);
END;
$$;
REVOKE ALL ON FUNCTION public.ranking_feed(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ranking_feed(uuid, integer) TO authenticated;

-- ------------------------------------------------------------
-- 7. Modo TV
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tv_token(p_organization_id uuid, p_enable boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador pode gerar o link da TV.' USING ERRCODE = '42501';
  END IF;
  v_token := CASE WHEN p_enable THEN replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') ELSE NULL END;
  INSERT INTO public.organization_settings (organization_id, tv_token, updated_at, updated_by)
  VALUES (p_organization_id, v_token, now(), auth.uid())
  ON CONFLICT (organization_id) DO UPDATE SET tv_token = EXCLUDED.tv_token, updated_at = now(), updated_by = auth.uid();
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.set_tv_token(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tv_token(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tv_token(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso.' USING ERRCODE = '42501';
  END IF;
  SELECT tv_token INTO v_token FROM public.organization_settings WHERE organization_id = p_organization_id;
  RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.get_tv_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tv_token(uuid) TO authenticated;

-- Tudo o que a TV mostra, numa leitura só. Única função liberada para anon; exige o token.
CREATE OR REPLACE FUNCTION public.tv_board(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.organization_settings%ROWTYPE;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_campaign public.campaigns%ROWTYPE;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN NULL;
  END IF;
  SELECT * INTO s FROM public.organization_settings WHERE tv_token = p_token;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_campaign FROM public.campaigns
  WHERE organization_id = s.organization_id AND closed_at IS NULL AND starts_on <= v_today AND ends_on >= v_today
    AND (reveal_on IS NULL OR reveal_on <= v_today)
  ORDER BY ends_on LIMIT 1;

  RETURN jsonb_build_object(
    'organization', (SELECT name FROM public.organizations WHERE id = s.organization_id),
    'show_values', s.ranking_show_values,
    'month', to_char(v_month, 'YYYY-MM'),
    'ranking', coalesce((
      SELECT jsonb_agg(r ORDER BY r.production DESC NULLS LAST, r.points DESC)
      FROM (
        SELECT coalesce(p.full_name, 'Colaborador') AS name, p.avatar_url,
          CASE WHEN s.ranking_show_values THEN sum(e.amount) FILTER (WHERE e.event_kind = 'venda') END AS production,
          count(*) FILTER (WHERE e.event_kind = 'venda') AS sales,
          sum(e.points) AS points
        FROM public.score_events e
        LEFT JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.organization_id = s.organization_id AND e.voided_at IS NULL AND e.occurred_on BETWEEN v_month AND v_today
        GROUP BY e.user_id, p.full_name, p.avatar_url
        ORDER BY sum(e.amount) FILTER (WHERE e.event_kind = 'venda') DESC NULLS LAST, sum(e.points) DESC
        LIMIT 10
      ) r
    ), '[]'::jsonb),
    'goal', (
      SELECT jsonb_build_object(
        'metric', g.metric,
        'target', CASE WHEN g.metric <> 'producao' OR s.ranking_show_values THEN g.target END,
        'achieved', CASE WHEN g.metric <> 'producao' OR s.ranking_show_values
          THEN public.gamification_metric_value(s.organization_id, NULL, g.metric, v_month, v_today) END,
        'percent', round(100 * public.gamification_metric_value(s.organization_id, NULL, g.metric, v_month, v_today) / g.target)
      )
      FROM public.seller_goals g
      WHERE g.organization_id = s.organization_id AND g.scope = 'org' AND g.month = v_month
      ORDER BY g.metric = 'producao' DESC LIMIT 1
    ),
    'campaign', CASE WHEN v_campaign.id IS NULL THEN NULL ELSE jsonb_build_object(
      'name', v_campaign.name, 'metric', v_campaign.metric, 'format', v_campaign.format, 'prize', v_campaign.prize,
      'ends_on', v_campaign.ends_on,
      'standings', coalesce((
        SELECT jsonb_agg(x ORDER BY x.value DESC)
        FROM (
          SELECT CASE WHEN r.entity_type = 'team' THEN (SELECT t.name FROM public.teams t WHERE t.id = r.entity_id)
                      ELSE coalesce((SELECT p.full_name FROM public.profiles p WHERE p.user_id = r.entity_id), 'Colaborador') END AS name,
                 CASE WHEN v_campaign.metric = 'producao' AND NOT s.ranking_show_values THEN NULL ELSE r.value END AS value
          FROM public.campaign_rows(v_campaign.id) r
          ORDER BY r.value DESC LIMIT 5
        ) x
      ), '[]'::jsonb)
    ) END,
    'feed', coalesce((
      SELECT jsonb_agg(f ORDER BY f.at DESC)
      FROM (
        SELECT coalesce(p.full_name, 'Colaborador') AS name, e.event_kind AS kind,
          CASE WHEN s.ranking_show_values THEN e.amount END AS amount, e.created_at AS at
        FROM public.score_events e
        LEFT JOIN public.profiles p ON p.user_id = e.user_id
        WHERE e.organization_id = s.organization_id AND e.voided_at IS NULL
          AND e.event_kind IN ('venda', 'meta_batida', 'recorde_pessoal')
        ORDER BY e.created_at DESC LIMIT 8
      ) f
    ), '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.tv_board(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tv_board(text) TO anon, authenticated;
