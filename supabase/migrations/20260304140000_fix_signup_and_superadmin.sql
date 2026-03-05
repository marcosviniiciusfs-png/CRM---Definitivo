
-- ==========================================================
-- FIX FINAL: SIGNUP E SUPER ADMIN
-- Este script resolve o erro de criação de conta e configura o admin
-- ==========================================================

-- 1. ATUALIZAR SENHA DO SUPER ADMIN (Sistema Customizado)
-- O usuário solicitou mateusabcck@gmail.com com a senha britO151515@
SELECT public.upsert_admin_credential('mateusabcck@gmail.com', 'britO151515@');

-- 2. GARANTIR QUE O MATEUS SEJA SUPER ADMIN NO DATABASE TAMBÉM
-- (Para as políticas de bypass RLS funcionarem)
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'mateusabcck@gmail.com';
    
    IF v_user_id IS NOT NULL THEN
        -- Adicionar na lista de super admins se não estiver
        INSERT INTO public.super_admins_list (user_id, email)
        VALUES (v_user_id, 'mateusabcck@gmail.com')
        ON CONFLICT (user_id) DO UPDATE SET email = EXCLUDED.email;
        
        -- Garantir role
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_roles') THEN
            INSERT INTO public.user_roles (user_id, role)
            VALUES (v_user_id, 'super_admin')
            ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
        END IF;
    END IF;
END $$;

-- 3. RESTAURAR TRIGGER DE CRIAÇÃO DE ORGANIZAÇÃO (SIGNUP)
-- Este trigger foi removido em migrações anteriores, impedindo que novos usuários tivessem organizações.
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
  invited_member_count INT;
BEGIN
  RAISE LOG 'handle_new_user: Iniciando para user % (%)', NEW.id, NEW.email;

  -- PASSO 1: Evitar duplicidade se já for dono
  SELECT COUNT(*) INTO existing_owner_count
  FROM public.organization_members
  WHERE user_id = NEW.id AND role = 'owner';
  
  IF existing_owner_count > 0 THEN
    RETURN NEW;
  END IF;
  
  -- PASSO 2: Verificar se foi convidado por email
  SELECT COUNT(*) INTO invited_member_count
  FROM public.organization_members
  WHERE email = NEW.email AND user_id IS NULL;
  
  IF invited_member_count > 0 THEN
    UPDATE public.organization_members
    SET user_id = NEW.id,
        is_active = true
    WHERE email = NEW.email AND user_id IS NULL;
    
    RETURN NEW;
  END IF;
  
  -- PASSO 3: Verificar se já é membro de alguma org
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id;
  
  IF existing_member_count > 0 THEN
    RETURN NEW;
  END IF;
  
  -- PASSO 4: Criar nova organização
  -- Usamos EXCEPTION block interno para garantir que erro aqui não mate o signup no auth.users
  BEGIN
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Organization')
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
    VALUES (new_org_id, NEW.id, NEW.email, 'owner', true);
    
    RAISE LOG 'handle_new_user: Organização % criada para user %', new_org_id, NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: Erro ao criar org para %: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$function$;

-- Garantir que os dois triggers existam com nomes diferentes
-- 1. Trigger para Perfil
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- 2. Trigger para Organização (RESTORED)
DROP TRIGGER IF EXISTS on_auth_user_created_org ON auth.users;
CREATE TRIGGER on_auth_user_created_org
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. MELHORAR ROBUSTEZ DA ASSINATURA FREE
CREATE OR REPLACE FUNCTION public.ensure_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
    -- Só prossegue se tiver user_id e organization_id
    IF NEW.user_id IS NOT NULL AND NEW.organization_id IS NOT NULL THEN
        INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
        VALUES (NEW.user_id, NEW.organization_id, 'enterprise_free', 'authorized', 0, now())
        ON CONFLICT (user_id) DO UPDATE SET 
            plan_id = 'enterprise_free',
            status = 'authorized',
            updated_at = now();
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Não bloquear o processo principal se o registro da assinatura falhar
    RAISE WARNING 'ensure_free_subscription: Erro para user %: %', NEW.user_id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. CORRIGIR USUÁRIOS QUE FICARAM SEM ORGANIZAÇÃO/ASSINATURA
DO $$
DECLARE
    user_record RECORD;
    new_org_id UUID;
BEGIN
    FOR user_record IN 
        SELECT id, email, raw_user_meta_data 
        FROM auth.users u
        WHERE NOT EXISTS (SELECT 1 FROM public.organization_members om WHERE om.user_id = u.id)
    LOOP
        -- Criar organização manual
        INSERT INTO public.organizations (name)
        VALUES (COALESCE(user_record.raw_user_meta_data->>'name', split_part(user_record.email, '@', 1)) || '''s Organization')
        RETURNING id INTO new_org_id;
        
        -- Adicionar como membro (isso vai disparar o trigger de assinatura)
        INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
        VALUES (new_org_id, user_record.id, user_record.email, 'owner', true);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
