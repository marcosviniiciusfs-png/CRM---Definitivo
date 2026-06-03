ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS accepts_leads boolean NOT NULL DEFAULT true;

UPDATE public.whatsapp_instances
SET accepts_leads = false
WHERE organization_id IS NOT NULL;

WITH ranked_instances AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY organization_id
      ORDER BY
        CASE WHEN status = 'CONNECTED' THEN 0 ELSE 1 END,
        created_at ASC
    ) AS rn
  FROM public.whatsapp_instances
  WHERE organization_id IS NOT NULL
)
UPDATE public.whatsapp_instances wi
SET accepts_leads = ranked_instances.rn = 1
FROM ranked_instances
WHERE wi.id = ranked_instances.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_whatsapp_lead_capture_per_org
  ON public.whatsapp_instances (organization_id)
  WHERE accepts_leads IS TRUE
    AND organization_id IS NOT NULL;
