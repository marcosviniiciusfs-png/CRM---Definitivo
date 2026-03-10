-- Create a security definer function to get google calendar integrations with field-level access control
-- Access tokens and refresh tokens are only visible to owners and admins, other members see NULL

CREATE OR REPLACE FUNCTION public.get_google_calendar_integrations_masked()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  organization_id uuid,
  is_active boolean,
  calendar_id text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
  
  -- Return integrations with tokens masked based on role
  RETURN QUERY
  SELECT 
    gci.id,
    gci.user_id,
    gci.organization_id,
    gci.is_active,
    gci.calendar_id,
    -- Only owners and admins can see access tokens
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN gci.access_token
      ELSE NULL
    END as access_token,
    -- Only owners and admins can see refresh tokens
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN gci.refresh_token
      ELSE NULL
    END as refresh_token,
    gci.token_expires_at,
    gci.created_at,
    gci.updated_at
  FROM public.google_calendar_integrations gci
  WHERE gci.organization_id = current_user_org_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_google_calendar_integrations_masked() TO authenticated;