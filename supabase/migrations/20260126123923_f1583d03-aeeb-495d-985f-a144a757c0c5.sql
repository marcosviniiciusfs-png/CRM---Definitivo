-- =====================================================
-- FIX: Restore invited user linking in handle_new_user()
-- This was accidentally removed in migration 20260125174807
-- =====================================================

-- Recreate the function with the correct logic
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
  -- STEP 1: Check if user is already an OWNER (prevent duplicates)
  SELECT COUNT(*) INTO existing_owner_count
  FROM public.organization_members
  WHERE user_id = NEW.id AND role = 'owner';
  
  IF existing_owner_count > 0 THEN
    RAISE LOG 'handle_new_user: User % already owns organization(s). Skipping.', NEW.id;
    RETURN NEW;
  END IF;
  
  -- STEP 2: Check if user was INVITED (record exists with email but no user_id)
  SELECT COUNT(*) INTO invited_member_count
  FROM public.organization_members
  WHERE email = NEW.email AND user_id IS NULL;
  
  IF invited_member_count > 0 THEN
    -- LINK: Update pending records with the new user_id
    UPDATE public.organization_members
    SET user_id = NEW.id,
        is_active = true
    WHERE email = NEW.email AND user_id IS NULL;
    
    RAISE LOG 'handle_new_user: User % linked to % invited membership(s) via email %.', NEW.id, invited_member_count, NEW.email;
    RETURN NEW;
  END IF;
  
  -- STEP 3: Check if already a member of any org (by user_id)
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id;
  
  IF existing_member_count > 0 THEN
    RAISE LOG 'handle_new_user: User % is already a member. Skipping org creation.', NEW.id;
    RETURN NEW;
  END IF;
  
  -- STEP 4: Create new organization for completely new users
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Organization')
  RETURNING id INTO new_org_id;
  
  INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
  VALUES (new_org_id, NEW.id, NEW.email, 'owner', true);
  
  RAISE LOG 'handle_new_user: Created organization % for user %', new_org_id, NEW.id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: Error for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;