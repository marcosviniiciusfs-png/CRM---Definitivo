-- Facebook Lead Ads: cada submissao Meta distinta deve criar um card.
-- Telefone/email passam a ser apenas sinais informativos de duplicidade.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS facebook_lead_id TEXT;

COMMENT ON COLUMN public.leads.facebook_lead_id IS
  'ID imutavel da submissao Meta Lead Ads; usado para idempotencia por organizacao.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.leads'::regclass
      AND conname = 'leads_facebook_lead_id_canonical_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_facebook_lead_id_canonical_check
      CHECK (
        facebook_lead_id IS NULL
        OR (
          facebook_lead_id = btrim(facebook_lead_id)
          AND facebook_lead_id <> ''
        )
      ) NOT VALID;
  END IF;
END;
$$;

ALTER TABLE public.leads
  VALIDATE CONSTRAINT leads_facebook_lead_id_canonical_check;

-- Remover os formatos conhecidos da regra antiga:
-- - constraints historicas de telefone;
-- - indice parcial usado no ambiente atual, que excetua cards manuais.
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_telefone_lead_key;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_telefone_organization_unique;

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_telefone_lead_organization_id_key;

DROP INDEX IF EXISTS public.leads_automatic_phone_org_unique;

-- Falhar de forma explicita em um ambiente divergente, em vez de apagar
-- silenciosamente outro indice UNIQUE apenas porque seu predicado cita telefone.
DO $$
DECLARE
  remaining_indexes TEXT;
BEGIN
  SELECT string_agg(index_definition.relname, ', ' ORDER BY index_definition.relname)
  INTO remaining_indexes
  FROM pg_index AS index_metadata
  JOIN pg_class AS table_definition
    ON table_definition.oid = index_metadata.indrelid
  JOIN pg_namespace AS table_namespace
    ON table_namespace.oid = table_definition.relnamespace
  JOIN pg_class AS index_definition
    ON index_definition.oid = index_metadata.indexrelid
  WHERE table_namespace.nspname = 'public'
    AND table_definition.relname = 'leads'
    AND index_metadata.indisunique
    AND NOT index_metadata.indisprimary
    AND position(
      'telefone_lead' IN lower(pg_get_indexdef(index_metadata.indexrelid))
    ) > 0;

  IF remaining_indexes IS NOT NULL THEN
    RAISE EXCEPTION
      'Ainda existem indices UNIQUE de telefone em public.leads: %',
      remaining_indexes;
  END IF;
END;
$$;

-- Repor um indice NAO unico para a consulta informativa por telefone.
CREATE INDEX IF NOT EXISTS idx_leads_org_phone_created_at
  ON public.leads (organization_id, telefone_lead, created_at, id)
  WHERE telefone_lead IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_org_email_created_at
  ON public.leads (organization_id, email, created_at, id)
  WHERE email IS NOT NULL;

-- Lookup idempotente dos cards historicos, que ainda nao possuem a nova coluna.
CREATE INDEX IF NOT EXISTS idx_facebook_webhook_logs_success_lead_lookup
  ON public.facebook_webhook_logs (
    organization_id,
    facebook_lead_id,
    created_at,
    lead_id
  )
  WHERE status = 'success'
    AND facebook_lead_id IS NOT NULL
    AND lead_id IS NOT NULL;

-- Recibos duraveis preservam a idempotencia historica sem fazer UPDATE em
-- dezenas de milhares de leads (o que alteraria updated_at e publicaria
-- eventos Realtime). Esta tabela nao participa da rotina de limpeza de logs.
CREATE TABLE IF NOT EXISTS public.facebook_lead_receipts (
  organization_id UUID NOT NULL
    REFERENCES public.organizations(id) ON DELETE CASCADE,
  facebook_lead_id TEXT NOT NULL,
  lead_id UUID NOT NULL
    REFERENCES public.leads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facebook_lead_receipts_pkey
    PRIMARY KEY (organization_id, facebook_lead_id),
  CONSTRAINT facebook_lead_receipts_lead_id_key
    UNIQUE (lead_id),
  CONSTRAINT facebook_lead_receipts_id_canonical_check
    CHECK (
      facebook_lead_id = btrim(facebook_lead_id)
      AND facebook_lead_id <> ''
    )
);

ALTER TABLE public.facebook_lead_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.facebook_lead_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.facebook_lead_receipts FROM anon, authenticated;
GRANT SELECT ON TABLE public.facebook_lead_receipts TO service_role;

-- Falhar em dados historicos ambiguos; nunca escolher silenciosamente outro
-- lead para o mesmo evento, nem associar varios eventos success ao mesmo card.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.facebook_webhook_logs AS webhook_log
    JOIN public.leads AS lead_row
      ON lead_row.id = webhook_log.lead_id
     AND lead_row.organization_id = webhook_log.organization_id
    WHERE webhook_log.status = 'success'
      AND webhook_log.facebook_lead_id IS NOT NULL
      AND btrim(webhook_log.facebook_lead_id) <> ''
    GROUP BY
      webhook_log.organization_id,
      btrim(webhook_log.facebook_lead_id)
    HAVING count(DISTINCT webhook_log.lead_id) > 1
  ) THEN
    RAISE EXCEPTION
      'Logs success ambiguos: um facebook_lead_id aponta para varios leads';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.facebook_webhook_logs AS webhook_log
    JOIN public.leads AS lead_row
      ON lead_row.id = webhook_log.lead_id
     AND lead_row.organization_id = webhook_log.organization_id
    WHERE webhook_log.status = 'success'
      AND webhook_log.facebook_lead_id IS NOT NULL
      AND btrim(webhook_log.facebook_lead_id) <> ''
    GROUP BY webhook_log.organization_id, webhook_log.lead_id
    HAVING count(DISTINCT btrim(webhook_log.facebook_lead_id)) > 1
  ) THEN
    RAISE EXCEPTION
      'Logs success ambiguos: um lead aponta para varios facebook_lead_id';
  END IF;
END;
$$;

WITH canonical_success AS (
  SELECT DISTINCT ON (
    webhook_log.organization_id,
    btrim(webhook_log.facebook_lead_id)
  )
    webhook_log.organization_id,
    btrim(webhook_log.facebook_lead_id) AS facebook_lead_id,
    webhook_log.lead_id,
    webhook_log.created_at
  FROM public.facebook_webhook_logs AS webhook_log
  JOIN public.leads AS lead_row
    ON lead_row.id = webhook_log.lead_id
   AND lead_row.organization_id = webhook_log.organization_id
  WHERE webhook_log.status = 'success'
    AND webhook_log.facebook_lead_id IS NOT NULL
    AND btrim(webhook_log.facebook_lead_id) <> ''
  ORDER BY
    webhook_log.organization_id,
    btrim(webhook_log.facebook_lead_id),
    webhook_log.created_at ASC,
    webhook_log.id ASC
)
INSERT INTO public.facebook_lead_receipts (
  organization_id,
  facebook_lead_id,
  lead_id,
  created_at
)
SELECT
  canonical_success.organization_id,
  canonical_success.facebook_lead_id,
  canonical_success.lead_id,
  canonical_success.created_at
FROM canonical_success
ON CONFLICT DO NOTHING;

-- Mesmo em uma reaplicacao parcial, um conflito nunca pode trocar o lead
-- previamente associado ao recibo canonico.
DO $$
BEGIN
  IF EXISTS (
    WITH canonical_success AS (
      SELECT DISTINCT ON (
        webhook_log.organization_id,
        btrim(webhook_log.facebook_lead_id)
      )
        webhook_log.organization_id,
        btrim(webhook_log.facebook_lead_id) AS facebook_lead_id,
        webhook_log.lead_id
      FROM public.facebook_webhook_logs AS webhook_log
      JOIN public.leads AS lead_row
        ON lead_row.id = webhook_log.lead_id
       AND lead_row.organization_id = webhook_log.organization_id
      WHERE webhook_log.status = 'success'
        AND webhook_log.facebook_lead_id IS NOT NULL
        AND btrim(webhook_log.facebook_lead_id) <> ''
      ORDER BY
        webhook_log.organization_id,
        btrim(webhook_log.facebook_lead_id),
        webhook_log.created_at ASC,
        webhook_log.id ASC
    )
    SELECT 1
    FROM canonical_success
    LEFT JOIN public.facebook_lead_receipts AS receipt
      ON receipt.organization_id = canonical_success.organization_id
     AND receipt.facebook_lead_id = canonical_success.facebook_lead_id
    WHERE receipt.lead_id IS DISTINCT FROM canonical_success.lead_id
  ) THEN
    RAISE EXCEPTION
      'Conflito ao preencher facebook_lead_receipts; nenhum mapeamento foi alterado';
  END IF;
END;
$$;

-- Fallback conservador para cards sem qualquer log success preservado. O ID
-- do JSON so e aceito se nao houver um log duplicate provando que ele foi uma
-- submissao bloqueada que sobrescreveu additional_data do card original.
WITH additional_data_fallback AS (
  SELECT
    lead_row.organization_id,
    btrim(lead_row.additional_data->>'facebook_lead_id') AS facebook_lead_id,
    lead_row.id AS lead_id,
    lead_row.created_at
  FROM public.leads AS lead_row
  WHERE lead_row.organization_id IS NOT NULL
    AND (
      lead_row.source = 'Facebook Leads'
      OR lead_row.additional_data->>'source' = 'facebook'
    )
    AND lead_row.additional_data->>'facebook_lead_id' IS NOT NULL
    AND btrim(lead_row.additional_data->>'facebook_lead_id') <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM public.facebook_webhook_logs AS success_log
      WHERE success_log.organization_id = lead_row.organization_id
        AND success_log.lead_id = lead_row.id
        AND success_log.status = 'success'
        AND success_log.facebook_lead_id IS NOT NULL
        AND btrim(success_log.facebook_lead_id) <> ''
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.facebook_webhook_logs AS duplicate_log
      WHERE duplicate_log.organization_id = lead_row.organization_id
        AND duplicate_log.lead_id = lead_row.id
        AND duplicate_log.status = 'duplicate'
        AND btrim(duplicate_log.facebook_lead_id) = btrim(
          lead_row.additional_data->>'facebook_lead_id'
        )
    )
)
INSERT INTO public.facebook_lead_receipts (
  organization_id,
  facebook_lead_id,
  lead_id,
  created_at
)
SELECT
  additional_data_fallback.organization_id,
  additional_data_fallback.facebook_lead_id,
  additional_data_fallback.lead_id,
  additional_data_fallback.created_at
FROM additional_data_fallback
ON CONFLICT DO NOTHING;

-- Validar tambem o fallback. ON CONFLICT nunca remapeia; qualquer candidato
-- que nao tenha terminado exatamente no seu proprio receipt aborta a migration.
DO $$
BEGIN
  IF EXISTS (
    WITH additional_data_fallback AS (
      SELECT
        lead_row.organization_id,
        btrim(lead_row.additional_data->>'facebook_lead_id') AS facebook_lead_id,
        lead_row.id AS lead_id
      FROM public.leads AS lead_row
      WHERE lead_row.organization_id IS NOT NULL
        AND (
          lead_row.source = 'Facebook Leads'
          OR lead_row.additional_data->>'source' = 'facebook'
        )
        AND lead_row.additional_data->>'facebook_lead_id' IS NOT NULL
        AND btrim(lead_row.additional_data->>'facebook_lead_id') <> ''
        AND NOT EXISTS (
          SELECT 1
          FROM public.facebook_webhook_logs AS success_log
          WHERE success_log.organization_id = lead_row.organization_id
            AND success_log.lead_id = lead_row.id
            AND success_log.status = 'success'
            AND success_log.facebook_lead_id IS NOT NULL
            AND btrim(success_log.facebook_lead_id) <> ''
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.facebook_webhook_logs AS duplicate_log
          WHERE duplicate_log.organization_id = lead_row.organization_id
            AND duplicate_log.lead_id = lead_row.id
            AND duplicate_log.status = 'duplicate'
            AND btrim(duplicate_log.facebook_lead_id) = btrim(
              lead_row.additional_data->>'facebook_lead_id'
            )
        )
    )
    SELECT 1
    FROM additional_data_fallback
    LEFT JOIN public.facebook_lead_receipts AS receipt
      ON receipt.organization_id = additional_data_fallback.organization_id
     AND receipt.facebook_lead_id = additional_data_fallback.facebook_lead_id
    WHERE receipt.lead_id IS DISTINCT FROM additional_data_fallback.lead_id
  ) THEN
    RAISE EXCEPTION
      'Conflito no fallback additional_data de facebook_lead_receipts';
  END IF;
END;
$$;

-- Defesa final contra duas entregas simultaneas do mesmo evento Meta. O escopo
-- inclui organization_id para preservar isolamento e permitir que uma Pagina
-- legitimamente conectada a duas orgs gere um card em cada uma.
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_org_facebook_lead_id
  ON public.leads (organization_id, facebook_lead_id)
  WHERE organization_id IS NOT NULL
    AND facebook_lead_id IS NOT NULL;

-- Compatibilidade durante o cutover: a versao anterior da Edge Function ja
-- gravava o ID dentro de additional_data, mas ainda nao preenchia a coluna.
-- Aplicar somente em INSERT evita promover uma tentativa bloqueada quando o
-- codigo antigo atualiza additional_data de um lead existente.
CREATE OR REPLACE FUNCTION public.populate_facebook_lead_id_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  payload_lead_id TEXT;
BEGIN
  IF NEW.facebook_lead_id IS NULL
     AND NEW.additional_data->>'source' = 'facebook' THEN
    payload_lead_id := NULLIF(
      btrim(NEW.additional_data->>'facebook_lead_id'),
      ''
    );
    NEW.facebook_lead_id := payload_lead_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.populate_facebook_lead_id_on_insert() FROM PUBLIC;

DROP TRIGGER IF EXISTS populate_facebook_lead_id_before_insert ON public.leads;
CREATE TRIGGER populate_facebook_lead_id_before_insert
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.populate_facebook_lead_id_on_insert();

CREATE OR REPLACE FUNCTION public.sync_facebook_lead_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mapped_lead_id UUID;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.facebook_lead_id IS NOT NULL
       AND NEW.facebook_lead_id IS DISTINCT FROM OLD.facebook_lead_id THEN
      RAISE EXCEPTION 'facebook_lead_id e imutavel depois de definido'
        USING ERRCODE = '23514';
    END IF;

    IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
       AND COALESCE(OLD.facebook_lead_id, NEW.facebook_lead_id) IS NOT NULL THEN
      RAISE EXCEPTION 'organization_id de lead Meta e imutavel'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.facebook_lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.facebook_lead_receipts (
      organization_id,
      facebook_lead_id,
      lead_id
    )
    VALUES (
      NEW.organization_id,
      NEW.facebook_lead_id,
      NEW.id
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT receipt.lead_id
    INTO mapped_lead_id
    FROM public.facebook_lead_receipts AS receipt
    WHERE receipt.organization_id = NEW.organization_id
      AND receipt.facebook_lead_id = NEW.facebook_lead_id;

    IF mapped_lead_id IS DISTINCT FROM NEW.id THEN
      RAISE EXCEPTION
        'facebook_lead_id % ja pertence a outro lead da organizacao',
        NEW.facebook_lead_id
        USING ERRCODE = '23505';
    END IF;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_facebook_lead_receipt() FROM PUBLIC;

DROP TRIGGER IF EXISTS sync_facebook_lead_receipt_after_insert ON public.leads;
CREATE TRIGGER sync_facebook_lead_receipt_after_insert
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_facebook_lead_receipt();

DROP TRIGGER IF EXISTS sync_facebook_lead_receipt_after_update ON public.leads;
CREATE TRIGGER sync_facebook_lead_receipt_after_update
  AFTER UPDATE OF facebook_lead_id, organization_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_facebook_lead_receipt();
