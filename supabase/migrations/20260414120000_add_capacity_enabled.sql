-- ============================================================
-- Tornar max_capacity OPCIONAL (não bloqueia por padrão)
-- Adiciona coluna capacity_enabled (default: false)
-- Quando false, a capacidade NÃO é verificada na distribuição
-- Quando true, max_capacity é respeitado normalmente
-- ============================================================

-- 1. Adicionar coluna capacity_enabled
ALTER TABLE public.agent_distribution_settings
  ADD COLUMN IF NOT EXISTS capacity_enabled BOOLEAN DEFAULT false;

-- 2. Definir todos como false (sem limite por padrão)
UPDATE public.agent_distribution_settings
  SET capacity_enabled = false
  WHERE capacity_enabled IS NULL;

-- 3. Recriar trigger com capacity_enabled = false
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
      priority_weight,
      capacity_enabled
    )
    VALUES (
      NEW.user_id,
      NEW.organization_id,
      true,
      false,
      200,
      1,
      false
    )
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
