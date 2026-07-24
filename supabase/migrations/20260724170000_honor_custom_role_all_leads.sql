-- Keep database visibility aligned with the frontend's custom-role permission.
-- Owners retain full access. Admins and members only bypass channel/assignment
-- restrictions when their assigned custom role explicitly grants all leads.

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
        om.role = 'owner'
        OR COALESCE(ocr.can_view_all_leads, false)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM whatsapp_instances wi
    WHERE wi.id = p_channel_id
      AND (
        public.user_can_view_all_leads(wi.organization_id)
        OR EXISTS (
          SELECT 1
          FROM whatsapp_channel_members wcm
          WHERE wcm.whatsapp_instance_id = p_channel_id
            AND wcm.user_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.user_can_access_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM leads l
    JOIN organization_members om
      ON om.organization_id = l.organization_id
     AND om.user_id = auth.uid()
     AND om.is_active = true
    WHERE l.id = p_lead_id
      AND (
        public.user_can_view_all_leads(l.organization_id)
        OR l.whatsapp_instance_id IS NULL
        OR public.user_can_access_channel(l.whatsapp_instance_id)
        OR l.responsavel_user_id = auth.uid()
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_view_all_leads(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_channel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_lead(uuid) TO authenticated;
