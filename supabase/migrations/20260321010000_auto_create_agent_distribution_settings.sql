-- ============================================================
-- Auto-criar agent_distribution_settings para membros que não têm
-- Garante que todos os membros ativos da organização estejam
-- disponíveis para distribuição de leads sem configuração manual.
-- ============================================================

-- Inserir settings padrão para membros que ainda não têm
INSERT INTO public.agent_distribution_settings (user_id, organization_id, is_active, is_paused, max_capacity, priority_weight)
SELECT
  om.user_id,
  om.organization_id,
  true  AS is_active,
  false AS is_paused,
  100   AS max_capacity,
  1     AS priority_weight
FROM public.organization_members om
WHERE om.is_active = true
  AND om.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_distribution_settings ads
    WHERE ads.user_id = om.user_id
      AND ads.organization_id = om.organization_id
  )
ON CONFLICT DO NOTHING;

-- Trigger para auto-criar settings quando um novo membro é adicionado
CREATE OR REPLACE FUNCTION public.auto_create_agent_distribution_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só cria se o membro tem user_id e está ativo
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
      100,
      1
    )
    ON CONFLICT (user_id, organization_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trg_auto_create_agent_distribution_settings ON public.organization_members;

-- Criar trigger para novos membros
CREATE TRIGGER trg_auto_create_agent_distribution_settings
  AFTER INSERT OR UPDATE OF user_id, is_active
  ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_agent_distribution_settings();

-- Garantir constraint UNIQUE para evitar duplicatas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_distribution_settings_user_org_unique'
  ) THEN
    ALTER TABLE public.agent_distribution_settings
      ADD CONSTRAINT agent_distribution_settings_user_org_unique
      UNIQUE (user_id, organization_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint pode já existir com nome diferente, ignorar
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
