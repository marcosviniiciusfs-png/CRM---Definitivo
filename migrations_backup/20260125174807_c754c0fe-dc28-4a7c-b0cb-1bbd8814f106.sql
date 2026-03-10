-- =====================================================
-- MIGRATION: Deletar organizações duplicadas e prevenir novas
-- =====================================================

-- PARTE 1: Deletar as organizações duplicadas do usuário Marcos Vinícius
-- (organizações vazias criadas em 25/01/2026)

-- 1.1 Deletar funis das orgs duplicadas
DELETE FROM public.sales_funnels 
WHERE organization_id IN (
  '47c1ab7d-5e86-46d8-8425-69ea72b10579',
  '2217a0bb-f51b-4dd8-afed-167bc3381eb6'
);

-- 1.2 Deletar memberships das orgs duplicadas
DELETE FROM public.organization_members 
WHERE organization_id IN (
  '47c1ab7d-5e86-46d8-8425-69ea72b10579',
  '2217a0bb-f51b-4dd8-afed-167bc3381eb6'
);

-- 1.3 Deletar as organizações duplicadas
DELETE FROM public.organizations 
WHERE id IN (
  '47c1ab7d-5e86-46d8-8425-69ea72b10579',
  '2217a0bb-f51b-4dd8-afed-167bc3381eb6'
);

-- =====================================================
-- PARTE 2: Atualizar função handle_new_user para prevenir duplicatas
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  existing_owner_count INT;
  existing_member_count INT;
BEGIN
  -- PREVENÇÃO DE DUPLICATAS: Verificar se usuário JÁ É OWNER de alguma organização
  SELECT COUNT(*) INTO existing_owner_count
  FROM public.organization_members
  WHERE user_id = NEW.id AND role = 'owner';
  
  -- Se já for owner de alguma organização, NÃO criar nova
  IF existing_owner_count > 0 THEN
    RAISE LOG 'User % already owns % organization(s). Skipping org creation.', NEW.id, existing_owner_count;
    RETURN NEW;
  END IF;
  
  -- Verificar se é um usuário convidado (já é membro de alguma org)
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id;
  
  -- Se já for membro de alguma organização (convidado), NÃO criar nova
  IF existing_member_count > 0 THEN
    RAISE LOG 'User % is already a member of % organization(s). Skipping org creation.', NEW.id, existing_member_count;
    RETURN NEW;
  END IF;
  
  -- Criar nova organização apenas para usuários completamente novos
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Organization')
  RETURNING id INTO new_org_id;
  
  -- Adicionar usuário como owner da nova organização
  INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
  VALUES (new_org_id, NEW.id, NEW.email, 'owner', true);
  
  RAISE LOG 'Created new organization % for user %', new_org_id, NEW.id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log do erro mas não bloquear criação do usuário
    RAISE WARNING 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;