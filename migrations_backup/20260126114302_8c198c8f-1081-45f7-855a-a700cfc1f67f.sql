
-- ============================================================
-- MIGRATION: Fix multi-org RLS for users with multiple organizations
-- Problem: get_user_organization_id/role use LIMIT 1, returning wrong org
-- Solution: Use active_organization_id from user_active_org table
-- ============================================================

-- 1. Create dedicated table for user's active organization selection
-- (using a separate table to avoid conflicts with existing user_sessions)
CREATE TABLE IF NOT EXISTS public.user_active_org (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  active_organization_id UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Enable RLS on user_active_org
ALTER TABLE public.user_active_org ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies for user_active_org - users can only manage their own record
CREATE POLICY "Users can view their own active org"
  ON public.user_active_org
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own active org"
  ON public.user_active_org
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own active org"
  ON public.user_active_org
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Deny anonymous access
CREATE POLICY "Deny anon access to user_active_org"
  ON public.user_active_org
  FOR ALL
  TO anon
  USING (false);

-- 5. REWRITE get_user_organization_id to respect active organization
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_org_id UUID;
  fallback_org_id UUID;
BEGIN
  -- First: try to get the user's selected active organization
  SELECT uao.active_organization_id INTO active_org_id
  FROM public.user_active_org uao
  WHERE uao.user_id = _user_id;

  -- Validate that the user is still an active member of this org
  IF active_org_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = _user_id
        AND om.organization_id = active_org_id
        AND om.status = 'active'
    ) THEN
      RETURN active_org_id;
    END IF;
  END IF;

  -- Fallback: return the first active organization (original behavior)
  SELECT om.organization_id INTO fallback_org_id
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.status = 'active'
  ORDER BY om.created_at ASC
  LIMIT 1;

  RETURN fallback_org_id;
END;
$$;

-- 6. REWRITE get_user_organization_role to respect active organization
CREATE OR REPLACE FUNCTION public.get_user_organization_role(_user_id UUID)
RETURNS TABLE(organization_id UUID, role organization_role)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_org_id UUID;
  active_role organization_role;
BEGIN
  -- First: try to get the user's selected active organization
  SELECT uao.active_organization_id INTO active_org_id
  FROM public.user_active_org uao
  WHERE uao.user_id = _user_id;

  -- Validate and get role for active org
  IF active_org_id IS NOT NULL THEN
    SELECT om.organization_id, om.role INTO organization_id, role
    FROM public.organization_members om
    WHERE om.user_id = _user_id
      AND om.organization_id = active_org_id
      AND om.status = 'active';
    
    IF organization_id IS NOT NULL THEN
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- Fallback: return the first active membership (original behavior)
  SELECT om.organization_id, om.role INTO organization_id, role
  FROM public.organization_members om
  WHERE om.user_id = _user_id
    AND om.status = 'active'
  ORDER BY om.created_at ASC
  LIMIT 1;
  
  IF organization_id IS NOT NULL THEN
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$;

-- 7. Helper function to set active organization (used by frontend)
CREATE OR REPLACE FUNCTION public.set_user_active_organization(_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID;
  is_member BOOLEAN;
BEGIN
  _user_id := auth.uid();
  
  IF _user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verify user is a member of this organization
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = _user_id
      AND om.organization_id = _org_id
      AND om.status = 'active'
  ) INTO is_member;

  IF NOT is_member THEN
    RETURN FALSE;
  END IF;

  -- Upsert the active organization
  INSERT INTO public.user_active_org (user_id, active_organization_id, updated_at)
  VALUES (_user_id, _org_id, now())
  ON CONFLICT (user_id)
  DO UPDATE SET active_organization_id = _org_id, updated_at = now();

  RETURN TRUE;
END;
$$;

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_organization_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_organization_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_active_organization(UUID) TO authenticated;
