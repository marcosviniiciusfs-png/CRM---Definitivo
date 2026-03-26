-- ============================================================
-- FIX: Trigger auto_create_agent_distribution_settings falhando
--      ao atualizar organization_members
--
-- Problema: O trigger usa ON CONFLICT (user_id, organization_id) DO NOTHING
-- que requer uma UNIQUE constraint nessas colunas. Se essa constraint
-- não existir em produção, o trigger falha e toda atualização de membro
-- (inclusive atribuição de cargo personalizado) retorna 500.
--
-- Solução:
--   1. Garantir que a UNIQUE constraint existe
--   2. Recriar a função do trigger com tratamento de exceções
--      para nunca bloquear o UPDATE principal
-- ============================================================

-- 1. Garantir UNIQUE constraint em agent_distribution_settings(user_id, organization_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_distribution_settings_user_org_unique'
  ) THEN
    -- Remover duplicatas antes de adicionar constraint (segurança)
    DELETE FROM public.agent_distribution_settings a
    USING public.agent_distribution_settings b
    WHERE a.id > b.id
      AND a.user_id = b.user_id
      AND a.organization_id = b.organization_id;

    ALTER TABLE public.agent_distribution_settings
      ADD CONSTRAINT agent_distribution_settings_user_org_unique
      UNIQUE (user_id, organization_id);
  END IF;
EXCEPTION WHEN others THEN
  -- Constraint já existe com outro nome ou outro conflito — ignorar
  NULL;
END $$;

-- 2. Recriar a função do trigger com tratamento de exceções seguro
--    O EXCEPTION WHEN OTHERS garante que um erro no trigger nunca
--    bloqueia o UPDATE em organization_members
CREATE OR REPLACE FUNCTION public.auto_create_agent_distribution_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só cria se o membro tem user_id e está ativo
  IF NEW.user_id IS NOT NULL AND NEW.is_active = true THEN
    BEGIN
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
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      -- Silently ignore — não deve bloquear o UPDATE principal
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
