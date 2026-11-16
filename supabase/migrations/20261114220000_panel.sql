-- Painel de acompanhamento (Fase 4 do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- - panel_settings: uma linha por organização, NASCE DESLIGADA. Só super admin liga, escolhe de onde
--   vem o token da Meta e quais contas de anúncio somar (Edge Function panel-meta-insights, modo
--   "configure"). Admin da organização só altera a meta mensal. Membros só leem.
-- - panel_meta_tokens: token próprio do painel, criptografado; nunca lido pelo navegador.
-- - panel_meta_cache: respostas da Meta guardadas (5 min se o período inclui hoje/ontem, 1 h no resto).
-- - panel_attendance(): atendimento por dia a partir dos eventos de etapa (Fase 1).

CREATE TABLE IF NOT EXISTS public.panel_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  token_source text NOT NULL DEFAULT 'own' CHECK (token_source IN ('own', 'facebook_integration')),
  ad_account_ids text[] NOT NULL DEFAULT '{}',
  monthly_conversation_goal integer CHECK (monthly_conversation_goal IS NULL OR monthly_conversation_goal > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.panel_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem o painel da organização" ON public.panel_settings;
CREATE POLICY "Membros veem o painel da organização"
  ON public.panel_settings FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
-- Sem políticas de escrita: tudo passa pela Edge Function, que confere quem pode mudar o quê.

CREATE TABLE IF NOT EXISTS public.panel_meta_tokens (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  encrypted_access_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.panel_meta_tokens ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só a service role lê e grava.

CREATE TABLE IF NOT EXISTS public.panel_meta_cache (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cache_key text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, cache_key)
);

ALTER TABLE public.panel_meta_cache ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só a service role lê e grava.

-- ------------------------------------------------------------
-- Atendimento por dia (horário de Brasília)
-- ------------------------------------------------------------
-- Conta cada lead uma vez por dia em cada evento:
--   new_leads          — leads criados no dia
--   scheduled          — entrou na etapa "Agendamento"
--   scheduled_from_ads — dos agendados, os que vieram de anúncio (origem Facebook/Meta ou tag "Lead de anúncio")
--   confirmed          — entrou na etapa "Confirmação"
--   attended           — entrou na etapa "Compareceu" ou teve a reunião do dia marcada como realizada no card
--   no_show            — entrou na etapa "Não compareceu" ou teve a reunião do dia marcada como no-show no card
--   won / lost         — entrou numa etapa de ganho / perdido
CREATE OR REPLACE FUNCTION public.panel_attendance(
  p_organization_id uuid,
  p_from date,
  p_to date,
  p_funnel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  day date,
  new_leads integer,
  scheduled integer,
  scheduled_from_ads integer,
  confirmed integer,
  attended integer,
  no_show integer,
  won integer,
  lost integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_org_member(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Acesso negado à organização' USING ERRCODE = '42501';
  END IF;

  IF p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Período inválido (máximo de 366 dias)' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(p_from, p_to, interval '1 day')::date AS dia
  ),
  org_leads AS (
    SELECT l.id, l.created_at, l.source, l.data_agendamento_reuniao, l.status_reuniao
    FROM public.leads l
    WHERE l.organization_id = p_organization_id
      AND (p_funnel_id IS NULL OR l.funnel_id = p_funnel_id)
  ),
  ad_leads AS (
    SELECT ol.id
    FROM org_leads ol
    WHERE ol.source ILIKE ANY (ARRAY['%facebook%', '%meta%', '%instagram%'])
       OR EXISTS (
         SELECT 1
         FROM public.lead_tag_assignments a
         JOIN public.lead_tags t ON t.id = a.tag_id
         WHERE a.lead_id = ol.id AND t.name = 'Lead de anúncio'
       )
  ),
  moves AS (
    SELECT
      h.lead_id,
      (h.moved_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE
        WHEN fs.stage_type = 'won' THEN 'won'
        WHEN fs.stage_type = 'lost' THEN 'lost'
        ELSE fs.linked_event
      END AS event
    FROM public.funnel_stage_history h
    JOIN org_leads ol ON ol.id = h.lead_id
    JOIN public.funnel_stages fs ON fs.id = h.to_stage_id
    WHERE h.moved_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND h.moved_at < ((p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  card_marks AS (
    SELECT
      ol.id AS lead_id,
      (ol.data_agendamento_reuniao AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      CASE ol.status_reuniao WHEN 'realizada' THEN 'attended' WHEN 'no_show' THEN 'no_show' END AS event
    FROM org_leads ol
    WHERE ol.status_reuniao IN ('realizada', 'no_show')
      AND ol.data_agendamento_reuniao >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND ol.data_agendamento_reuniao < ((p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  events AS (
    SELECT DISTINCT lead_id, dia, event FROM moves WHERE event IS NOT NULL
    UNION
    SELECT lead_id, dia, event FROM card_marks
  ),
  created AS (
    SELECT (ol.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia, count(*)::integer AS n
    FROM org_leads ol
    WHERE ol.created_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND ol.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    GROUP BY 1
  )
  SELECT
    d.dia,
    COALESCE(c.n, 0),
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'scheduled')::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'scheduled' AND e.lead_id IN (SELECT id FROM ad_leads))::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'confirmed')::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'attended')::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'no_show')::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'won')::integer,
    count(DISTINCT e.lead_id) FILTER (WHERE e.event = 'lost')::integer
  FROM days d
  LEFT JOIN created c ON c.dia = d.dia
  LEFT JOIN events e ON e.dia = d.dia
  GROUP BY d.dia, c.n
  ORDER BY d.dia;
END;
$$;

REVOKE ALL ON FUNCTION public.panel_attendance(uuid, date, date, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_attendance(uuid, date, date, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.panel_attendance(uuid, date, date, uuid) TO authenticated, service_role;
