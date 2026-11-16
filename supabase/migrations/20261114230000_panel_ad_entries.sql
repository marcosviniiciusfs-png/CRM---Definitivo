-- Leads de anúncio por dia (Fase 5 do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- Junta as duas portas de entrada de anúncio que o KairoZ já registra:
--   - WhatsApp: tracking_match_log (primeira mensagem bateu com a palavra-chave do canal, ou contato
--     desconhecido quando o canal pede isso). Uma coluna por palavra-chave.
--   - Formulário da Meta: leads com facebook_lead_id (ou origem Facebook). Uma coluna.
-- Cada lead conta uma vez por dia e por coluna, no dia de Brasília em que entrou.

CREATE OR REPLACE FUNCTION public.panel_ad_entries_daily(
  p_organization_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  day date,
  source_key text,
  source_label text,
  leads integer
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
  WITH whatsapp AS (
    SELECT
      (m.matched_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      'wa:' || lower(m.matched_keyword) AS chave,
      CASE WHEN m.matched_keyword = '__unknown_contact__' THEN 'Contato novo no WhatsApp'
           ELSE m.matched_keyword END AS rotulo,
      m.lead_id
    FROM public.tracking_match_log m
    WHERE m.organization_id = p_organization_id
      AND m.matched_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND m.matched_at < ((p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  meta_form AS (
    SELECT
      (l.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
      'meta_form'::text AS chave,
      'Formulário da Meta'::text AS rotulo,
      l.id AS lead_id
    FROM public.leads l
    WHERE l.organization_id = p_organization_id
      AND (l.facebook_lead_id IS NOT NULL OR l.source ILIKE 'facebook%')
      AND l.created_at >= (p_from::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND l.created_at < ((p_to + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  entries AS (
    SELECT * FROM whatsapp
    UNION ALL
    SELECT * FROM meta_form
  )
  SELECT e.dia, e.chave, min(e.rotulo), count(DISTINCT e.lead_id)::integer
  FROM entries e
  GROUP BY e.dia, e.chave
  ORDER BY e.dia, e.chave;
END;
$$;

REVOKE ALL ON FUNCTION public.panel_ad_entries_daily(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.panel_ad_entries_daily(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.panel_ad_entries_daily(uuid, date, date) TO authenticated, service_role;
