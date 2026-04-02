-- CORREÇÃO: Colaboradores convidados não devem ter organização própria
--
-- PROBLEMA: O trigger handle_new_user() cria automaticamente uma organização
-- para todo novo usuário do auth.users. Quando criamos um colaborador via
-- add-organization-member, o trigger disparava ANTES de inserir o membro
-- na organização correta, então criava uma org própria desnecessária.
--
-- SOLUÇÃO:
-- 1. Atualizar handle_new_user() para respeitar o flag is_collaborator
--    no raw_user_meta_data — se true, pula a criação de org própria.
-- 2. Limpar organizações órfãs criadas para colaboradores de teste.

-- ============================================================
-- PASSO 1: Atualizar handle_new_user para respeitar is_collaborator
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  existing_member_count INT;
BEGIN
  -- Se é um colaborador convidado (criado via edge function add-organization-member),
  -- NÃO criar organização própria — ele já será inserido na org do convite.
  IF (NEW.raw_user_meta_data->>'is_collaborator')::BOOLEAN IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Para usuários normais (auto-cadastro), verificar se já tem vínculo
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id OR email = NEW.email;

  IF existing_member_count = 0 THEN
    -- Criar organização própria para o novo dono
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) || '''s Organization')
    RETURNING id INTO new_org_id;

    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (new_org_id, NEW.id, NEW.email, 'owner');
  ELSE
    -- Vincular user_id a um convite de email já existente
    UPDATE public.organization_members
    SET user_id = NEW.id
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- PASSO 2: Limpar organizações órfãs criadas para colaboradores
-- (organizações com apenas 1 membro owner, que também é membro
--  não-owner de outra organização — típico de colaboradores)
-- ============================================================
DO $$
DECLARE
  orphan_org_ids UUID[];
  deleted_count INT;
BEGIN
  -- Encontrar organizações onde:
  -- 1. O único membro ativo é o owner
  -- 2. Esse owner é também membro (não-owner) de outra organização
  SELECT ARRAY_AGG(DISTINCT o.id) INTO orphan_org_ids
  FROM public.organizations o
  WHERE (
    SELECT COUNT(*) FROM public.organization_members
    WHERE organization_id = o.id AND is_active = true
  ) = 1
  AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = o.id
      AND om.is_active = true
      AND om.role = 'owner'
      AND om.user_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.organization_members om2
        WHERE om2.user_id = om.user_id
          AND om2.organization_id != o.id
          AND om2.role != 'owner'
          AND om2.is_active = true
      )
  );

  IF orphan_org_ids IS NOT NULL AND ARRAY_LENGTH(orphan_org_ids, 1) > 0 THEN
    deleted_count := ARRAY_LENGTH(orphan_org_ids, 1);

    -- Remover membros das orgs órfãs
    DELETE FROM public.organization_members
    WHERE organization_id = ANY(orphan_org_ids);

    -- Remover subscriptions das orgs órfãs
    DELETE FROM public.subscriptions
    WHERE organization_id = ANY(orphan_org_ids);

    -- Remover as orgs órfãs
    DELETE FROM public.organizations
    WHERE id = ANY(orphan_org_ids);

    RAISE NOTICE 'Limpeza concluída: % organização(ões) órfã(s) removida(s)', deleted_count;
  ELSE
    RAISE NOTICE 'Nenhuma organização órfã encontrada.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
