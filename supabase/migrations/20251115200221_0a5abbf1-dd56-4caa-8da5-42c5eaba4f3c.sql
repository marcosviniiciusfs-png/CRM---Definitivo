-- Update the handle_new_user function to only create organization if user is not already a member of one
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  existing_member_count INT;
BEGIN
  -- Check if user is already a member of an organization (invited user)
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id;
  
  -- Only create organization if user is NOT already a member (not invited)
  IF existing_member_count = 0 THEN
    -- Create a new organization for the user
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) || '''s Organization')
    RETURNING id INTO new_org_id;
    
    -- Add user as owner of the organization
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (new_org_id, NEW.id, NEW.email, 'owner');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Delete the extra organization created for Marcos (which is empty and not used)
DELETE FROM public.organizations 
WHERE id = 'fe5924d5-33b1-44e2-a238-52705b7cbdf0';