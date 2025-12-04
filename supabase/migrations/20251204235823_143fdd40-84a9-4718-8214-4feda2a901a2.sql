-- Create a security definer function to get meta pixel integrations with field-level access control
-- Access tokens are only visible to owners and admins, other members see NULL

CREATE OR REPLACE FUNCTION public.get_meta_pixel_integrations_masked()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  funnel_id uuid,
  pixel_id text,
  access_token text,
  is_active boolean,
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
    mpi.id,
    mpi.organization_id,
    mpi.funnel_id,
    mpi.pixel_id,
    -- Only owners and admins can see access tokens
    CASE 
      WHEN current_user_role IN ('owner', 'admin') THEN mpi.access_token
      ELSE NULL
    END as access_token,
    mpi.is_active,
    mpi.created_at,
    mpi.updated_at
  FROM public.meta_pixel_integrations mpi
  WHERE mpi.organization_id = current_user_org_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_meta_pixel_integrations_masked() TO authenticated;