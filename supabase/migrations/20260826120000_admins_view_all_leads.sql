-- Organization admins are operational managers and must have the same
-- organization-wide lead visibility as owners. Custom roles can still grant
-- this visibility to regular members.

CREATE OR REPLACE FUNCTION public.user_can_view_all_leads(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members om
    LEFT JOIN organization_custom_roles ocr
      ON ocr.id = om.custom_role_id
     AND ocr.organization_id = om.organization_id
    WHERE om.organization_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
      AND (
        om.role IN ('owner', 'admin')
        OR COALESCE(ocr.can_view_all_leads, false)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_all_leads(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
