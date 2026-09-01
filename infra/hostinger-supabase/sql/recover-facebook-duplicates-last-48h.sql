-- Recupera, como novos cards, as submissoes Meta que foram bloqueadas pela
-- politica antiga nas 48 horas anteriores ao inicio desta transacao.
--
-- Pre-requisito: aplicar 20260901150000_facebook_lead_reentry_policy.sql.
-- O script e idempotente: uma submissao que ja tenha um log success ou um
-- lead com o mesmo (organization_id, facebook_lead_id) nao entra no lote.
-- Efeitos externos (roleta, automacoes e alertas) nao sao disparados para o
-- historico recuperado; novos eventos ao vivo seguem o fluxo normal.

BEGIN;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

CREATE TEMP TABLE facebook_recovery_events ON COMMIT DROP AS
SELECT DISTINCT ON (
    webhook_log.organization_id,
    btrim(webhook_log.facebook_lead_id)
  )
  webhook_log.id AS canonical_log_id,
  webhook_log.organization_id,
  btrim(webhook_log.facebook_lead_id) AS facebook_lead_id,
  webhook_log.lead_id AS duplicate_of_lead_id,
  webhook_log.page_id,
  webhook_log.form_id AS logged_form_id,
  webhook_log.payload,
  webhook_log.error_message,
  webhook_log.created_at AS received_at
FROM public.facebook_webhook_logs AS webhook_log
WHERE lower(webhook_log.status) = 'duplicate'
  AND webhook_log.created_at >= transaction_timestamp() - interval '48 hours'
  AND webhook_log.facebook_lead_id IS NOT NULL
  AND btrim(webhook_log.facebook_lead_id) <> ''
  -- Somente bloqueios da regra antiga. Reentregas idempotentes da politica
  -- nova tambem usam status duplicate, mas possuem outra mensagem.
  AND webhook_log.error_message LIKE 'Lead j% existe (match:%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.facebook_webhook_logs AS successful_log
    WHERE successful_log.organization_id = webhook_log.organization_id
      AND successful_log.facebook_lead_id = webhook_log.facebook_lead_id
      AND lower(successful_log.status) = 'success'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.leads AS processed_lead
    WHERE processed_lead.organization_id = webhook_log.organization_id
      AND processed_lead.facebook_lead_id = btrim(webhook_log.facebook_lead_id)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.facebook_lead_receipts AS processed_receipt
    WHERE processed_receipt.organization_id = webhook_log.organization_id
      AND processed_receipt.facebook_lead_id = btrim(webhook_log.facebook_lead_id)
  )
ORDER BY
  webhook_log.organization_id,
  btrim(webhook_log.facebook_lead_id),
  webhook_log.created_at ASC,
  webhook_log.id ASC;

DO $$
DECLARE
  invalid_event_count INTEGER;
BEGIN
  SELECT count(*)
  INTO invalid_event_count
  FROM facebook_recovery_events AS recovery_event
  WHERE recovery_event.duplicate_of_lead_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.leads AS original_lead
       CROSS JOIN LATERAL jsonb_array_elements(
         CASE
           WHEN jsonb_typeof(original_lead.duplicate_attempts_history) = 'array'
             THEN original_lead.duplicate_attempts_history
           ELSE '[]'::jsonb
         END
       ) AS history_entry(value)
       WHERE original_lead.id = recovery_event.duplicate_of_lead_id
         AND original_lead.organization_id = recovery_event.organization_id
         AND history_entry.value->'original_data'->>'id' = recovery_event.facebook_lead_id
     );

  IF invalid_event_count > 0 THEN
    RAISE EXCEPTION
      'Recovery recusado: % evento(s) sem lead original ou payload historico',
      invalid_event_count;
  END IF;
END;
$$;

CREATE TEMP TABLE facebook_recovery_candidates ON COMMIT DROP AS
WITH recovered_payload AS (
  SELECT
    recovery_event.*,
    original_lead.nome_lead AS original_lead_name,
    original_lead.responsavel AS original_responsavel,
    original_lead.responsavel_user_id AS original_responsavel_user_id,
    original_lead.funnel_id AS original_funnel_id,
    duplicate_history.value AS history_entry,
    duplicate_history.value->'original_data' AS lead_data,
    COALESCE(
      NULLIF(duplicate_history.value->>'form_name', ''),
      NULLIF(duplicate_history.value->'original_data'->>'form_name', ''),
      'Formulario Facebook'
    ) AS form_name,
    COALESCE(
      NULLIF(duplicate_history.value->>'campaign_name', ''),
      'N/A'
    ) AS campaign_name,
    COALESCE(
      NULLIF(duplicate_history.value->'original_data'->>'form_id', ''),
      NULLIF(recovery_event.logged_form_id, ''),
      NULLIF(recovery_event.payload #>> '{entry,0,changes,0,value,form_id}', '')
    ) AS form_id
  FROM facebook_recovery_events AS recovery_event
  JOIN public.leads AS original_lead
    ON original_lead.id = recovery_event.duplicate_of_lead_id
   AND original_lead.organization_id = recovery_event.organization_id
  JOIN LATERAL (
    SELECT history_item.value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(original_lead.duplicate_attempts_history) = 'array'
          THEN original_lead.duplicate_attempts_history
        ELSE '[]'::jsonb
      END
    ) AS history_item(value)
    WHERE history_item.value->'original_data'->>'id' = recovery_event.facebook_lead_id
    ORDER BY NULLIF(history_item.value->>'attempted_at', '') ASC NULLS LAST
    LIMIT 1
  ) AS duplicate_history ON true
), parsed_payload AS (
  SELECT
    recovered_payload.*,
    parsed_fields.field_map,
    parsed_fields.structured_fields,
    parsed_fields.fields_description,
    fuzzy_phone.value AS fuzzy_phone
  FROM recovered_payload
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        jsonb_object_agg(
          lower(regexp_replace(field_item.value->>'name', '\s+', '_', 'g')),
          COALESCE(field_item.value->'values'->>0, '')
          ORDER BY field_item.ordinality
        ) FILTER (WHERE NULLIF(field_item.value->>'name', '') IS NOT NULL),
        '{}'::jsonb
      ) AS field_map,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'name', field_item.value->>'name',
            'value', COALESCE(field_item.value->'values'->>0, '')
          )
          ORDER BY field_item.ordinality
        ) FILTER (
          WHERE NULLIF(field_item.value->>'name', '') IS NOT NULL
            AND NULLIF(field_item.value->'values'->>0, '') IS NOT NULL
        ),
        '[]'::jsonb
      ) AS structured_fields,
      COALESCE(
        string_agg(
          concat(
            field_item.value->>'name',
            ': ',
            field_item.value->'values'->>0
          ),
          E'\n'
          ORDER BY field_item.ordinality
        ) FILTER (
          WHERE NULLIF(field_item.value->>'name', '') IS NOT NULL
            AND NULLIF(field_item.value->'values'->>0, '') IS NOT NULL
        ),
        ''
      ) AS fields_description
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(recovered_payload.lead_data->'field_data') = 'array'
          THEN recovered_payload.lead_data->'field_data'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS field_item(value, ordinality)
  ) AS parsed_fields ON true
  LEFT JOIN LATERAL (
    SELECT field_item.value->'values'->>0 AS value
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(recovered_payload.lead_data->'field_data') = 'array'
          THEN recovered_payload.lead_data->'field_data'
        ELSE '[]'::jsonb
      END
    ) WITH ORDINALITY AS field_item(value, ordinality)
    WHERE lower(field_item.value->>'name') ~ '(whatsapp|celular|fone)'
      AND NULLIF(field_item.value->'values'->>0, '') IS NOT NULL
    ORDER BY field_item.ordinality
    LIMIT 1
  ) AS fuzzy_phone ON true
), routed_payload AS (
  SELECT
    parsed_payload.*,
    COALESCE(source_mapping.funnel_id, fallback_funnel.id, parsed_payload.original_funnel_id) AS target_funnel_id,
    source_mapping.target_stage_id AS mapped_stage_id
  FROM parsed_payload
  LEFT JOIN LATERAL (
    SELECT mapping.funnel_id, mapping.target_stage_id
    FROM public.funnel_source_mappings AS mapping
    WHERE mapping.organization_id = parsed_payload.organization_id
      AND mapping.source_type = 'facebook'
      AND (
        mapping.source_identifier = parsed_payload.form_id
        OR mapping.source_identifier IS NULL
      )
    ORDER BY
      CASE WHEN mapping.source_identifier = parsed_payload.form_id THEN 0 ELSE 1 END,
      mapping.created_at ASC,
      mapping.id ASC
    LIMIT 1
  ) AS source_mapping ON true
  LEFT JOIN LATERAL (
    SELECT funnel.id
    FROM public.sales_funnels AS funnel
    WHERE funnel.organization_id = parsed_payload.organization_id
      AND (funnel.is_default = true OR funnel.is_active = true)
    ORDER BY funnel.is_default DESC, funnel.created_at ASC, funnel.id ASC
    LIMIT 1
  ) AS fallback_funnel ON source_mapping.funnel_id IS NULL
)
SELECT
  gen_random_uuid() AS new_lead_id,
  routed_payload.*,
  COALESCE(
    routed_payload.mapped_stage_id,
    first_stage.id
  ) AS target_stage_id,
  COALESCE(
    NULLIF(routed_payload.field_map->>'phone_number', ''),
    NULLIF(routed_payload.field_map->>'full_phone_number', ''),
    NULLIF(routed_payload.field_map->>'phone', ''),
    NULLIF(routed_payload.field_map->>'telefone', ''),
    NULLIF(routed_payload.field_map->>'celular', ''),
    NULLIF(routed_payload.field_map->>'whatsapp', ''),
    NULLIF(routed_payload.field_map->>'numero', ''),
    NULLIF(routed_payload.field_map->>'numero_telefone', ''),
    NULLIF(routed_payload.fuzzy_phone, ''),
    ''
  ) AS phone_number,
  COALESCE(
    NULLIF(routed_payload.field_map->>'full_name', ''),
    NULLIF(routed_payload.field_map->>'nome_completo', ''),
    NULLIF(routed_payload.field_map->>'first_name', ''),
    NULLIF(routed_payload.field_map->>'name', ''),
    NULLIF(routed_payload.field_map->>'nome', ''),
    'Lead do Facebook'
  ) AS lead_name,
  COALESCE(
    NULLIF(routed_payload.field_map->>'email', ''),
    NULLIF(routed_payload.field_map->>'e_mail', ''),
    NULLIF(routed_payload.field_map->>'e-mail', '')
  ) AS lead_email,
  COALESCE(
    NULLIF(routed_payload.field_map->>'company_name', ''),
    NULLIF(routed_payload.field_map->>'company', ''),
    NULLIF(routed_payload.field_map->>'empresa', '')
  ) AS lead_company
FROM routed_payload
LEFT JOIN LATERAL (
  SELECT funnel_stage.id
  FROM public.funnel_stages AS funnel_stage
  WHERE funnel_stage.funnel_id = routed_payload.target_funnel_id
  ORDER BY funnel_stage.position ASC, funnel_stage.created_at ASC, funnel_stage.id ASC
  LIMIT 1
) AS first_stage ON routed_payload.mapped_stage_id IS NULL;

CREATE TEMP TABLE facebook_recovered_leads ON COMMIT DROP AS
WITH inserted_leads AS (
  INSERT INTO public.leads (
    id,
    organization_id,
    telefone_lead,
    nome_lead,
    email,
    empresa,
    responsavel,
    responsavel_user_id,
    funnel_id,
    funnel_stage_id,
    facebook_lead_id,
    source,
    stage,
    descricao_negocio,
    additional_data,
    data_inicio,
    created_at,
    updated_at
  )
  SELECT
    candidate.new_lead_id,
    candidate.organization_id,
    candidate.phone_number,
    candidate.lead_name,
    candidate.lead_email,
    candidate.lead_company,
    candidate.original_responsavel,
    candidate.original_responsavel_user_id,
    candidate.target_funnel_id,
    candidate.target_stage_id,
    candidate.facebook_lead_id,
    'Facebook Leads',
    'NOVO',
    concat(
      'Lead capturado via Facebook Ads', E'\n\n',
      'Formulario: ', candidate.form_name, E'\n',
      'Campanha: ', candidate.campaign_name, E'\n\n',
      '=== INFORMACOES DO FORMULARIO ===', E'\n',
      candidate.fields_description
    ),
    jsonb_build_object(
      'source', 'facebook',
      'form_id', candidate.form_id,
      'form_name', candidate.form_name,
      'campaign_name', candidate.campaign_name,
      'campaign_id', NULL,
      'facebook_lead_id', candidate.facebook_lead_id,
      'fields', candidate.structured_fields,
      'is_duplicate', true,
      'duplicate_of_lead_id', candidate.duplicate_of_lead_id,
      'duplicate_match_type',
        CASE
          WHEN candidate.error_message ILIKE '%match: email%' THEN 'email'
          ELSE 'phone'
        END,
      'recovered_from_blocked', true,
      'recovered_at', transaction_timestamp(),
      'original_webhook_log_id', candidate.canonical_log_id
    ),
    candidate.received_at,
    candidate.received_at,
    transaction_timestamp()
  FROM facebook_recovery_candidates AS candidate
  ON CONFLICT DO NOTHING
  RETURNING id, organization_id, facebook_lead_id
)
SELECT * FROM inserted_leads;

DO $$
DECLARE
  candidate_count INTEGER;
  inserted_count INTEGER;
BEGIN
  SELECT count(*) INTO candidate_count FROM facebook_recovery_candidates;
  SELECT count(*) INTO inserted_count FROM facebook_recovered_leads;

  IF inserted_count <> candidate_count THEN
    RAISE EXCEPTION
      'Recovery recusado: candidatos=%, inseridos=%',
      candidate_count,
      inserted_count;
  END IF;
END;
$$;

-- O primeiro recebimento vira o log canonico de sucesso do card recuperado.
UPDATE public.facebook_webhook_logs AS webhook_log
SET
  status = 'success',
  lead_id = recovered_lead.id,
  form_id = candidate.form_id,
  error_message = 'Lead recuperado como novo card pela politica de reentrada'
FROM facebook_recovered_leads AS recovered_lead
JOIN facebook_recovery_candidates AS candidate
  ON candidate.organization_id = recovered_lead.organization_id
 AND candidate.facebook_lead_id = recovered_lead.facebook_lead_id
WHERE webhook_log.id = candidate.canonical_log_id;

-- Se houver outras entregas do mesmo ID Meta, elas continuam registradas como
-- duplicate tecnico, mas passam a apontar para o card correto.
UPDATE public.facebook_webhook_logs AS webhook_log
SET
  lead_id = recovered_lead.id,
  error_message = 'Reentrega do evento Meta; card ja recuperado'
FROM facebook_recovered_leads AS recovered_lead
JOIN facebook_recovery_candidates AS candidate
  ON candidate.organization_id = recovered_lead.organization_id
 AND candidate.facebook_lead_id = recovered_lead.facebook_lead_id
WHERE webhook_log.organization_id = recovered_lead.organization_id
  AND webhook_log.facebook_lead_id = recovered_lead.facebook_lead_id
  AND webhook_log.id <> candidate.canonical_log_id
  AND lower(webhook_log.status) = 'duplicate';

SELECT
  count(*) AS recovered_cards,
  count(DISTINCT organization_id) AS affected_organizations,
  min(facebook_lead_id) IS NOT NULL AS all_recovered_ids_present
FROM facebook_recovered_leads;

COMMIT;
