-- "Aguardando resposta desde" no lead (Fase 3b do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- leads.aguardando_resposta_desde = horário da primeira mensagem do lead que ainda não teve
-- resposta da equipe. Mensagem do lead (ENTRADA) liga; mensagem da equipe (SAIDA) desliga.
-- O Pipeline usa isso para o estado "Responder" do card.
--
-- Mensagens importadas fora de ordem (sincronização de histórico) não bagunçam o valor:
-- - ENTRADA só liga se não houver SAIDA mais nova que ela;
-- - SAIDA só desliga se for mais nova que a espera atual.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS aguardando_resposta_desde timestamptz;

COMMENT ON COLUMN public.leads.aguardando_resposta_desde IS
  'Primeira mensagem do lead ainda sem resposta da equipe (WhatsApp). NULL = ninguém esperando.';

CREATE OR REPLACE FUNCTION public.mensagens_chat_update_waiting_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_at timestamptz := COALESCE(NEW.data_hora, NEW.created_at, now());
BEGIN
  IF NEW.id_lead IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF NEW.direcao = 'ENTRADA' THEN
      UPDATE public.leads l
      SET aguardando_resposta_desde = v_at
      WHERE l.id = NEW.id_lead
        AND l.aguardando_resposta_desde IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.mensagens_chat m
          WHERE m.id_lead = NEW.id_lead
            AND m.direcao = 'SAIDA'
            AND m.data_hora >= v_at
        );
    ELSIF NEW.direcao = 'SAIDA' THEN
      UPDATE public.leads l
      SET aguardando_resposta_desde = NULL
      WHERE l.id = NEW.id_lead
        AND l.aguardando_resposta_desde IS NOT NULL
        AND l.aguardando_resposta_desde <= v_at;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[waiting-reply] Falha ao atualizar o lead %: %', NEW.id_lead, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mensagens_chat_update_waiting_reply ON public.mensagens_chat;
CREATE TRIGGER mensagens_chat_update_waiting_reply
  AFTER INSERT ON public.mensagens_chat
  FOR EACH ROW
  EXECUTE FUNCTION public.mensagens_chat_update_waiting_reply();

-- Preenchimento inicial com as conversas dos últimos 30 dias.
WITH recent AS (
  SELECT id_lead, direcao, data_hora
  FROM public.mensagens_chat
  WHERE data_hora > now() - interval '30 days'
    AND direcao IN ('ENTRADA', 'SAIDA')
),
last_out AS (
  SELECT id_lead, max(data_hora) AS at
  FROM recent
  WHERE direcao = 'SAIDA'
  GROUP BY id_lead
),
waiting AS (
  SELECT r.id_lead, min(r.data_hora) AS since
  FROM recent r
  LEFT JOIN last_out o ON o.id_lead = r.id_lead
  WHERE r.direcao = 'ENTRADA'
    AND (o.at IS NULL OR r.data_hora > o.at)
  GROUP BY r.id_lead
)
UPDATE public.leads l
SET aguardando_resposta_desde = w.since
FROM waiting w
WHERE l.id = w.id_lead
  AND l.aguardando_resposta_desde IS DISTINCT FROM w.since;

-- Tarefas abertas dos leads do Pipeline numa chamada só (POST, sem limite de URL).
-- SECURITY INVOKER: cada usuário só vê as tarefas que o RLS de kanban_cards já mostra.
-- Aberta = sem completed_at e fora da coluna de concluídas. O banco de produção não tem
-- kanban_columns.is_completion_stage, então a coluna de concluídas é reconhecida pelo título.
CREATE OR REPLACE FUNCTION public.lead_open_tasks(p_lead_ids uuid[])
RETURNS TABLE (lead_id uuid, card_id uuid, due_date text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  -- due_date em texto: o campo de data da tarefa grava só o dia (AAAA-MM-DD).
  SELECT c.lead_id, c.id, c.due_date::text
  FROM public.kanban_cards c
  JOIN public.kanban_columns col ON col.id = c.column_id
  WHERE c.lead_id = ANY (p_lead_ids)
    AND c.completed_at IS NULL
    AND btrim(col.title) !~* '^conclu';
$$;

REVOKE ALL ON FUNCTION public.lead_open_tasks(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lead_open_tasks(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.lead_open_tasks(uuid[]) TO authenticated, service_role;
