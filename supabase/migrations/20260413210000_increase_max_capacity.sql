-- ============================================================
-- Aumentar max_capacity padrão para 200 (era 50/100)
- Permite ajuste manual até 1000
- Leads em estágios won/lost já são excluídos da contagem
  pelo distribute-lead (inner join funnel_stages + NOT IN won/lost)
-- ============================================================

-- 1. Atualizar registros existentes com max_capacity <= 100 para 200
UPDATE public.agent_distribution_settings
SET max_capacity = 200
WHERE max_capacity <= 100;

-- 2. Recriar trigger com novo default de 200
CREATE OR REPLACE FUNCTION public.auto_create_agent_distribution_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.is_active = true THEN
    INSERT INTO public.agent_distribution_settings (
      user_id,
      organization_id,
      is_active,
      is_paused,
      max_capacity,
      priority_weight
    )
    VALUES (
      NEW.user_id,
      NEW.organization_id,
      true,
      false,
      200,
      1
    )
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Adicionar constraint de range (1 a 1000)
ALTER TABLE public.agent_distribution_settings
  DROP CONSTRAINT IF EXISTS chk_max_capacity_range;

ALTER TABLE public.agent_distribution_settings
  ADD CONSTRAINT chk_max_capacity_range
  CHECK (max_capacity >= 1 AND max_capacity <= 1000);

NOTIFY pgrst, 'reload schema';
