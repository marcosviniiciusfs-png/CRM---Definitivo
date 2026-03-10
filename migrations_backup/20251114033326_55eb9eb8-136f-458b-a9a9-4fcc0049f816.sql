-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view members of their organization" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can insert members" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON organization_members;
DROP POLICY IF EXISTS "Owners and admins can delete members" ON organization_members;

-- Create security definer function to get user's organization (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.get_user_organization_role(_user_id uuid)
RETURNS TABLE (organization_id uuid, role organization_role)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id, om.role
  FROM public.organization_members om
  WHERE om.user_id = _user_id
  LIMIT 1;
$$;

-- Create new RLS policies using the security definer function
CREATE POLICY "Users can view members of their organization"
ON organization_members
FOR SELECT
USING (
  organization_id IN (
    SELECT (get_user_organization_role(auth.uid())).organization_id
  )
);

CREATE POLICY "Owners and admins can insert members"
ON organization_members
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT org_data.organization_id
    FROM get_user_organization_role(auth.uid()) AS org_data
    WHERE org_data.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can update members"
ON organization_members
FOR UPDATE
USING (
  organization_id IN (
    SELECT org_data.organization_id
    FROM get_user_organization_role(auth.uid()) AS org_data
    WHERE org_data.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners and admins can delete members"
ON organization_members
FOR DELETE
USING (
  organization_id IN (
    SELECT org_data.organization_id
    FROM get_user_organization_role(auth.uid()) AS org_data
    WHERE org_data.role IN ('owner', 'admin')
  )
);

-- Create organizations for existing users who don't have one
DO $$
DECLARE
  user_record RECORD;
  new_org_id UUID;
BEGIN
  FOR user_record IN 
    SELECT au.id, au.email
    FROM auth.users au
    LEFT JOIN organization_members om ON au.id = om.user_id
    WHERE om.user_id IS NULL
  LOOP
    -- Create organization for user
    INSERT INTO organizations (name)
    VALUES (user_record.email || '''s Organization')
    RETURNING id INTO new_org_id;
    
    -- Add user as owner
    INSERT INTO organization_members (organization_id, user_id, role, email)
    VALUES (new_org_id, user_record.id, 'owner', user_record.email);
  END LOOP;
END $$;