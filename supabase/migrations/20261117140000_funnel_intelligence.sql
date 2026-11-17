-- Inteligência comercial: funil e conversão (só owner/admin da organização).
--
-- funnel_intelligence() analisa uma COORTE: os leads CRIADOS no período, num funil. Para cada etapa:
--   reached  = leads da coorte que passaram pela etapa em qualquer momento (histórico de etapas, gravado
--              pelo servidor) ou que estão nela agora;
--   avg_seconds_in_stage = tempo médio que ficaram nela antes de sair;
--   current  = leads da coorte que estão nela agora, e stalled = os parados há mais de 7 dias;
--   lost_here = leads da coorte que foram para "Perdido" saindo desta etapa.
-- Mais totais: leads, ganhos, perdidos, valor e dias médios até ganhar.

CREATE OR REPLACE FUNCTION public.funnel_intelligence(p_organization_id uuid, p_funnel_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := (p_from::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_to timestamptz := ((p_to + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_org_admin(auth.uid(), p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização vê a inteligência comercial.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_funnels WHERE id = p_funnel_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Funil não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF p_to < p_from OR p_to - p_from > 366 THEN
    RAISE EXCEPTION 'Período inválido: use até 366 dias.' USING ERRCODE = '22023';
  END IF;

  WITH cohort AS (
    SELECT l.id, l.created_at, l.funnel_stage_id, l.valor
    FROM public.leads l
    WHERE l.organization_id = p_organization_id AND l.funnel_id = p_funnel_id
      AND l.created_at >= v_from AND l.created_at < v_to
  ),
  stages AS (
    SELECT s.id, s.name, s.position, s.stage_type, s.is_final, s.linked_event, s.color
    FROM public.funnel_stages s WHERE s.funnel_id = p_funnel_id
  ),
  hist AS (
    SELECT h.lead_id, h.from_stage_id, h.to_stage_id, h.moved_at, h.duration_in_previous_stage
    FROM public.funnel_stage_history h JOIN cohort c ON c.id = h.lead_id
  ),
  touched AS (
    SELECT lead_id, to_stage_id AS stage_id FROM hist
    UNION
    SELECT id, funnel_stage_id FROM cohort WHERE funnel_stage_id IS NOT NULL
  ),
  reached AS (SELECT stage_id, count(*)::integer AS n FROM touched GROUP BY stage_id),
  timein AS (
    SELECT from_stage_id AS stage_id, round(avg(duration_in_previous_stage))::integer AS avg_s
    FROM hist WHERE from_stage_id IS NOT NULL AND duration_in_previous_stage IS NOT NULL GROUP BY from_stage_id
  ),
  last_move AS (SELECT lead_id, max(moved_at) AS at FROM hist GROUP BY lead_id),
  cur AS (
    SELECT c.funnel_stage_id AS stage_id, count(*)::integer AS n,
           count(*) FILTER (WHERE coalesce(m.at, c.created_at) < now() - interval '7 days')::integer AS stalled
    FROM cohort c LEFT JOIN last_move m ON m.lead_id = c.id
    WHERE c.funnel_stage_id IS NOT NULL GROUP BY c.funnel_stage_id
  ),
  lost AS (
    SELECT h.from_stage_id AS stage_id, count(DISTINCT h.lead_id)::integer AS n
    FROM hist h JOIN stages s ON s.id = h.to_stage_id AND s.stage_type = 'lost'
    WHERE h.from_stage_id IS NOT NULL GROUP BY h.from_stage_id
  ),
  won_leads AS (
    SELECT c.id, c.created_at, c.valor, c.funnel_stage_id, min(h.moved_at) AS won_at
    FROM cohort c JOIN hist h ON h.lead_id = c.id JOIN stages s ON s.id = h.to_stage_id AND s.stage_type = 'won'
    GROUP BY c.id, c.created_at, c.valor, c.funnel_stage_id
  )
  SELECT jsonb_build_object(
    'totals', jsonb_build_object(
      'leads', (SELECT count(*) FROM cohort),
      'won', (SELECT count(*) FROM won_leads),
      'lost', (SELECT count(DISTINCT lead_id) FROM hist h JOIN stages s ON s.id = h.to_stage_id AND s.stage_type = 'lost'),
      'won_value', (SELECT coalesce(sum(valor), 0) FROM won_leads),
      'avg_days_to_win', (SELECT round((avg(extract(epoch FROM (won_at - created_at))) / 86400)::numeric, 1) FROM won_leads)
    ),
    'stages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'position', s.position, 'stage_type', s.stage_type, 'is_final', s.is_final,
        'linked_event', s.linked_event, 'color', s.color,
        'reached', coalesce(r.n, 0), 'avg_seconds_in_stage', t.avg_s,
        'current', coalesce(cu.n, 0), 'stalled', coalesce(cu.stalled, 0), 'lost_here', coalesce(lo.n, 0)
      ) ORDER BY s.is_final, s.position)
      FROM stages s
      LEFT JOIN reached r ON r.stage_id = s.id
      LEFT JOIN timein t ON t.stage_id = s.id
      LEFT JOIN cur cu ON cu.stage_id = s.id
      LEFT JOIN lost lo ON lo.stage_id = s.id
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.funnel_intelligence(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.funnel_intelligence(uuid, uuid, date, date) TO authenticated;
