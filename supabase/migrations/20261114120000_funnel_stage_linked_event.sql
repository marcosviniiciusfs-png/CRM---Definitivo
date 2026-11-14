-- Eventos de etapa (Fase 1 do plano docs/superpowers/plans/2026-11-14-trazer-hurtz-para-kairoz.md).
--
-- Cada etapa pode representar um evento do atendimento. O painel, os lembretes e a IA de etapas
-- leem o evento em vez do nome da etapa. Ganho e perdido continuam em stage_type ('won'/'lost'),
-- que já é lido em todo o sistema; linked_event cobre só os eventos da reunião.
--
-- Regra: cada evento fica em no máximo uma etapa por funil. Marcar o evento numa etapa tira o
-- evento da etapa que o tinha antes (trigger abaixo), e o índice único garante a regra.

ALTER TABLE public.funnel_stages
  ADD COLUMN IF NOT EXISTS linked_event text;

ALTER TABLE public.funnel_stages
  DROP CONSTRAINT IF EXISTS funnel_stages_linked_event_check;

ALTER TABLE public.funnel_stages
  ADD CONSTRAINT funnel_stages_linked_event_check
  CHECK (linked_event IS NULL OR linked_event IN ('scheduled', 'confirmed', 'attended', 'no_show'));

COMMENT ON COLUMN public.funnel_stages.linked_event IS
  'Evento do atendimento que a etapa representa: scheduled, confirmed, attended, no_show. No máximo um por funil. Ganho/perdido ficam em stage_type.';

-- ------------------------------------------------------------
-- Preenchimento inicial pelos nomes usados hoje (só onde ainda não há evento).
-- Em cada funil, fica com o evento a primeira etapa não final que casar com o nome.
-- ------------------------------------------------------------
WITH normalized AS (
  SELECT
    id,
    funnel_id,
    position,
    btrim(regexp_replace(
      translate(lower(name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '[^a-z0-9]+', ' ', 'g'
    )) AS norm
  FROM public.funnel_stages
  WHERE linked_event IS NULL
    AND COALESCE(is_final, false) = false
    AND COALESCE(stage_type, 'custom') NOT IN ('won', 'lost', 'discarded')
),
candidates AS (
  SELECT
    id,
    funnel_id,
    position,
    CASE
      WHEN norm IN ('agendamento realizado', 'agendado', 'agendados', 'agendamento', 'reuniao agendada', 'call agendada')
        THEN 'scheduled'
      WHEN norm IN ('confirmado', 'confirmados', 'agendamento confirmado', 'reuniao confirmada')
        THEN 'confirmed'
      WHEN norm IN ('reuniao feita', 'reuniao realizada', 'compareceu', 'call realizada')
        THEN 'attended'
      WHEN norm IN ('nao compareceu', 'no show', 'noshow', 'faltou')
        THEN 'no_show'
    END AS event
  FROM normalized
),
ranked AS (
  SELECT
    id,
    event,
    row_number() OVER (PARTITION BY funnel_id, event ORDER BY position, id) AS rn
  FROM candidates
  WHERE event IS NOT NULL
)
UPDATE public.funnel_stages fs
SET linked_event = ranked.event
FROM ranked
WHERE fs.id = ranked.id
  AND ranked.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_stages other
    WHERE other.funnel_id = fs.funnel_id
      AND other.linked_event = ranked.event
  );

CREATE UNIQUE INDEX IF NOT EXISTS funnel_stages_one_linked_event_per_funnel
  ON public.funnel_stages (funnel_id, linked_event)
  WHERE linked_event IS NOT NULL;

-- ------------------------------------------------------------
-- Marcar o evento numa etapa tira o evento da outra etapa do mesmo funil.
-- SECURITY INVOKER: só funciona para quem já pode editar as etapas do funil (RLS).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.funnel_stages_move_linked_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.linked_event IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.linked_event IS NOT DISTINCT FROM OLD.linked_event
     AND NEW.funnel_id = OLD.funnel_id THEN
    RETURN NEW;
  END IF;

  UPDATE public.funnel_stages
  SET linked_event = NULL
  WHERE funnel_id = NEW.funnel_id
    AND linked_event = NEW.linked_event
    AND id IS DISTINCT FROM NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_stages_move_linked_event ON public.funnel_stages;
CREATE TRIGGER funnel_stages_move_linked_event
  BEFORE INSERT OR UPDATE OF linked_event, funnel_id ON public.funnel_stages
  FOR EACH ROW
  EXECUTE FUNCTION public.funnel_stages_move_linked_event();

-- ------------------------------------------------------------
-- Funil padrão de organizações novas já nasce com os eventos marcados.
-- Mesma definição de 20260323000000_fix_duplicate_default_funnels.sql + linked_event.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_default_funnel_for_organization()
RETURNS TRIGGER AS $$
DECLARE
  new_funnel_id UUID;
  existing_funnel_count INT;
BEGIN
  SELECT COUNT(*) INTO existing_funnel_count
  FROM public.sales_funnels
  WHERE organization_id = NEW.id
    AND is_default = true;

  IF existing_funnel_count > 0 THEN
    RAISE NOTICE '[FUNNEL-TRIGGER] Org % já possui funil padrão, pulando criação.', NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.sales_funnels (
    organization_id, name, description, is_default, is_active, icon
  ) VALUES (
    NEW.id, 'Funil Padrão', 'Funil padrão do sistema', true, true, 'Target'
  ) RETURNING id INTO new_funnel_id;

  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final, linked_event
  ) VALUES
    (new_funnel_id, 'Novo Lead',              'Leads recém-chegados',                '#3B82F6', '📋', 0,   'custom', false, NULL),
    (new_funnel_id, 'Qualificação / Aquecido', 'Leads sendo qualificados',            '#06B6D4', '🔥', 1,   'custom', false, NULL),
    (new_funnel_id, 'Agendamento Realizado',  'Reunião agendada',                    '#EAB308', '📅', 2,   'custom', false, 'scheduled'),
    (new_funnel_id, 'Reunião Feita',          'Reunião realizada com o lead',        '#F97316', '🤝', 3,   'custom', false, 'attended'),
    (new_funnel_id, 'Proposta / Negociação',  'Proposta enviada, em negociação',     '#8B5CF6', '📝', 4,   'custom', false, NULL),
    (new_funnel_id, 'Aprovação / Análise',    'Aguardando aprovação do cliente',     '#6366F1', '🔍', 5,   'custom', false, NULL),
    (new_funnel_id, 'Venda Realizada',        'Negócio fechado com sucesso',         '#10B981', '🎉', 6,   'won',    true,  NULL),
    (new_funnel_id, 'Pós-venda / Ativação',  'Cliente em processo de ativação',     '#34D399', '✨', 7,   'custom', false, NULL),
    (new_funnel_id, 'Perdido',               'Negócio não concretizado',            '#EF4444', '❌', 999, 'lost',   true,  NULL);

  RAISE NOTICE '[FUNNEL-TRIGGER] Funil padrão criado para org %, funnel_id=%', NEW.id, new_funnel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';
