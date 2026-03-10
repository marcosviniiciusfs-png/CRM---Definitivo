-- Atualizar a função handle_new_user para verificar também por email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  existing_member_count INT;
BEGIN
  -- Check if user is already a member of an organization by user_id OR email (invited user)
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id OR email = NEW.email;
  
  -- Only create organization if user is NOT already a member (not invited)
  IF existing_member_count = 0 THEN
    -- Create a new organization for the user
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) || '''s Organization')
    RETURNING id INTO new_org_id;
    
    -- Add user as owner of the organization
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (new_org_id, NEW.id, NEW.email, 'owner');
  ELSE
    -- If user was invited (has email in organization_members), update with user_id
    UPDATE public.organization_members
    SET user_id = NEW.id
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$;