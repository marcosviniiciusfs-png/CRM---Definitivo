-- Create a security definer function to get organization members with field-level access control
-- Emails are only visible to owners and admins, other members see NULL

CREATE OR REPLACE FUNCTION public.get_organization_members_masked()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  user_id uuid,
  email text,
  role organization_role,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_org_id uuid;
  current_user_role organization_role;
BEGIN
  -- Get the current user's organization and role
  SELECT om.organization_id, om.role 
  INTO current_user_org_id, current_user_role
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;
  
  -- Return members with email masked based on role
  RETURN QUERY
  SELECT 
    om.id,
    om.organization_id,
    om.user_id,
    -- Only owners and admins can see emails
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN om.email
      WHEN om.user_id = auth.uid() THEN om.email  -- Users can see their own email
      ELSE NULL
    END as email,
    om.role,
    om.created_at
  FROM public.organization_members om
  WHERE om.organization_id = current_user_org_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_organization_members_masked() TO authenticated;