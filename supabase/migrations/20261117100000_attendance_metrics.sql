-- Atendimento por WhatsApp (Fase A do controle por vendedor).
--
-- Cada vendedor conecta o próprio WhatsApp (whatsapp_instances.user_id). Cada conversa respondida ou
-- esperando resposta vira uma linha em conversation_responses, gravada por trigger em mensagens_chat:
--   ENTRADA abre uma espera (uma por lead e WhatsApp); SAIDA fecha a espera aberta e guarda o tempo.
-- O vendedor é o dono do WhatsApp, não o responsável do lead. Os pontos de resposta rápida do ranking
-- passam a creditar o dono do WhatsApp que respondeu.
-- attendance_metrics() resume por vendedor: taxa de resposta, tempos médio e mediano, primeira resposta.
-- Owner e admin veem todos; o vendedor vê só os próprios números.
-- Horário comercial não é descontado: o tempo corre 24 h.

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.conversation_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL,
  seller_user_id uuid NOT NULL,
  inbound_at timestamptz NOT NULL,
  inbound_on date NOT NULL,
  replied_at timestamptz,
  response_seconds integer CHECK (response_seconds IS NULL OR response_seconds >= 0),
  is_first_response boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversation_responses_open_idx
  ON public.conversation_responses (lead_id, instance_id) WHERE replied_at IS NULL;
CREATE INDEX IF NOT EXISTS conversation_responses_org_day_idx
  ON public.conversation_responses (organization_id, inbound_on);
CREATE INDEX IF NOT EXISTS conversation_responses_seller_day_idx
  ON public.conversation_responses (seller_user_id, inbound_on);

ALTER TABLE public.conversation_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Vendedor vê as próprias esperas, admin vê todas" ON public.conversation_responses;
CREATE POLICY "Vendedor vê as próprias esperas, admin vê todas"
  ON public.conversation_responses FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND (seller_user_id = auth.uid() OR public.is_org_admin(auth.uid(), organization_id))
  );
REVOKE ALL ON public.conversation_responses FROM anon;
GRANT SELECT ON public.conversation_responses TO authenticated;

-- ------------------------------------------------------------
-- Lógica compartilhada pelo trigger e pela carga inicial
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_apply(
  p_lead uuid, p_instance uuid, p_direction text, p_at timestamptz, p_score boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_seller uuid;
  v_row public.conversation_responses%ROWTYPE;
  v_kind text;
BEGIN
  IF p_lead IS NULL OR p_instance IS NULL OR p_at IS NULL THEN
    RETURN;
  END IF;

  SELECT organization_id, user_id INTO v_org, v_seller FROM public.whatsapp_instances WHERE id = p_instance;
  IF v_org IS NULL OR v_seller IS NULL THEN
    RETURN;
  END IF;

  IF p_direction = 'ENTRADA' THEN
    -- Mensagem importada fora de ordem não reabre uma espera já respondida depois dela.
    IF EXISTS (
      SELECT 1 FROM public.conversation_responses
      WHERE lead_id = p_lead AND instance_id = p_instance AND replied_at IS NOT NULL AND replied_at >= p_at
    ) THEN
      RETURN;
    END IF;
    INSERT INTO public.conversation_responses (organization_id, lead_id, instance_id, seller_user_id, inbound_at, inbound_on)
    VALUES (v_org, p_lead, p_instance, v_seller, p_at, (p_at AT TIME ZONE 'America/Sao_Paulo')::date)
    ON CONFLICT (lead_id, instance_id) WHERE replied_at IS NULL DO NOTHING;

  ELSIF p_direction = 'SAIDA' THEN
    UPDATE public.conversation_responses r
    SET replied_at = p_at,
        response_seconds = greatest(0, EXTRACT(EPOCH FROM (p_at - r.inbound_at))::integer),
        is_first_response = NOT EXISTS (
          SELECT 1 FROM public.conversation_responses o WHERE o.lead_id = r.lead_id AND o.id <> r.id AND o.replied_at IS NOT NULL AND o.replied_at < p_at
        )
    WHERE r.lead_id = p_lead AND r.instance_id = p_instance AND r.replied_at IS NULL AND r.inbound_at <= p_at
    RETURNING * INTO v_row;

    IF FOUND AND p_score THEN
      v_kind := CASE WHEN v_row.response_seconds <= 300 THEN 'resposta_5min' WHEN v_row.response_seconds <= 900 THEN 'resposta_15min' ELSE NULL END;
      IF v_kind IS NOT NULL THEN
        PERFORM public.score_upsert(
          v_org, v_seller, v_kind, NULL, p_lead, 'lead_reply',
          p_lead::text || ':' || EXTRACT(EPOCH FROM v_row.inbound_at)::bigint::text,
          p_at, jsonb_build_object('wait_seconds', v_row.response_seconds, 'instance_id', p_instance)
        );
      END IF;
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.attendance_apply(uuid, uuid, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mensagens_chat_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.attendance_apply(
      NEW.id_lead, NEW.whatsapp_instance_id, NEW.direcao,
      coalesce(NEW.data_hora, NEW.created_at, now()), true
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[attendance] Falha ao registrar a mensagem do lead %: %', NEW.id_lead, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensagens_chat_attendance ON public.mensagens_chat;
CREATE TRIGGER mensagens_chat_attendance
  AFTER INSERT ON public.mensagens_chat
  FOR EACH ROW EXECUTE FUNCTION public.mensagens_chat_attendance();

-- Os pontos de resposta rápida agora saem do trigger acima (dono do WhatsApp), não do responsável do lead.
DROP TRIGGER IF EXISTS leads_score_reply ON public.leads;

-- ------------------------------------------------------------
-- Carga inicial: últimos 30 dias, em ordem, sem pontuar
-- ------------------------------------------------------------
DO $$
DECLARE
  m record;
BEGIN
  FOR m IN
    SELECT id_lead, whatsapp_instance_id, direcao, coalesce(data_hora, created_at) AS at
    FROM public.mensagens_chat
    WHERE coalesce(data_hora, created_at) > now() - interval '30 days'
      AND direcao IN ('ENTRADA', 'SAIDA')
      AND whatsapp_instance_id IS NOT NULL
      AND id_lead IS NOT NULL
    ORDER BY coalesce(data_hora, created_at), created_at
  LOOP
    PERFORM public.attendance_apply(m.id_lead, m.whatsapp_instance_id, m.direcao, m.at, false);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Resumo por vendedor
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_metrics(p_organization_id uuid, p_from date, p_to date)
RETURNS TABLE (
  user_id uuid,
  channels integer,
  channels_connected integer,
  conversations integer,
  answered integer,
  pending integer,
  answered_5min integer,
  avg_seconds integer,
  median_seconds integer,
  first_response_avg_seconds integer,
  oldest_pending_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_admin boolean;
BEGIN
  IF v_caller IS NULL OR NOT public.is_org_member(v_caller, p_organization_id) THEN
    RAISE EXCEPTION 'Sem acesso ao atendimento desta organização.' USING ERRCODE = '42501';
  END IF;
  v_admin := public.is_org_admin(v_caller, p_organization_id);

  RETURN QUERY
  WITH sellers AS (
    SELECT i.user_id AS uid,
           count(*)::integer AS channels,
           count(*) FILTER (WHERE upper(i.status) = 'CONNECTED')::integer AS connected
    FROM public.whatsapp_instances i
    WHERE i.organization_id = p_organization_id
      AND (v_admin OR i.user_id = v_caller)
    GROUP BY i.user_id
  ),
  agg AS (
    SELECT r.seller_user_id AS uid,
           count(*)::integer AS conversations,
           count(*) FILTER (WHERE r.replied_at IS NOT NULL)::integer AS answered,
           count(*) FILTER (WHERE r.replied_at IS NULL)::integer AS pending,
           count(*) FILTER (WHERE r.response_seconds <= 300)::integer AS answered_5min,
           round(avg(r.response_seconds))::integer AS avg_seconds,
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY r.response_seconds))::integer AS median_seconds,
           round(avg(r.response_seconds) FILTER (WHERE r.is_first_response))::integer AS first_avg,
           min(r.inbound_at) FILTER (WHERE r.replied_at IS NULL) AS oldest_pending
    FROM public.conversation_responses r
    WHERE r.organization_id = p_organization_id
      AND r.inbound_on BETWEEN p_from AND p_to
      AND (v_admin OR r.seller_user_id = v_caller)
    GROUP BY r.seller_user_id
  )
  SELECT s.uid, s.channels, s.connected,
         coalesce(a.conversations, 0), coalesce(a.answered, 0), coalesce(a.pending, 0), coalesce(a.answered_5min, 0),
         a.avg_seconds, a.median_seconds, a.first_avg, a.oldest_pending
  FROM sellers s LEFT JOIN agg a ON a.uid = s.uid;
END;
$$;
REVOKE ALL ON FUNCTION public.attendance_metrics(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_metrics(uuid, date, date) TO authenticated;
