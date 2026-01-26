-- Create RPC function to get member custom role permissions
-- This function returns the granular permissions from the custom role assigned to the current user

CREATE OR REPLACE FUNCTION public.get_member_custom_role_permissions(org_id UUID)
RETURNS TABLE (
  can_view_kanban BOOLEAN,
  can_create_tasks BOOLEAN,
  can_edit_own_tasks BOOLEAN,
  can_edit_all_tasks BOOLEAN,
  can_delete_tasks BOOLEAN,
  can_view_all_leads BOOLEAN,
  can_view_assigned_leads BOOLEAN,
  can_create_leads BOOLEAN,
  can_edit_leads BOOLEAN,
  can_delete_leads BOOLEAN,
  can_assign_leads BOOLEAN,
  can_view_pipeline BOOLEAN,
  can_move_leads_pipeline BOOLEAN,
  can_view_chat BOOLEAN,
  can_send_messages BOOLEAN,
  can_view_all_conversations BOOLEAN,
  can_manage_collaborators BOOLEAN,
  can_manage_integrations BOOLEAN,
  can_manage_tags BOOLEAN,
  can_manage_automations BOOLEAN,
  can_view_reports BOOLEAN,
  custom_role_id UUID,
  custom_role_name TEXT,
  custom_role_color TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    COALESCE(ocr.can_view_kanban, false),
    COALESCE(ocr.can_create_tasks, false),
    COALESCE(ocr.can_edit_own_tasks, false),
    COALESCE(ocr.can_edit_all_tasks, false),
    COALESCE(ocr.can_delete_tasks, false),
    COALESCE(ocr.can_view_all_leads, false),
    COALESCE(ocr.can_view_assigned_leads, false),
    COALESCE(ocr.can_create_leads, false),
    COALESCE(ocr.can_edit_leads, false),
    COALESCE(ocr.can_delete_leads, false),
    COALESCE(ocr.can_assign_leads, false),
    COALESCE(ocr.can_view_pipeline, false),
    COALESCE(ocr.can_move_leads_pipeline, false),
    COALESCE(ocr.can_view_chat, false),
    COALESCE(ocr.can_send_messages, false),
    COALESCE(ocr.can_view_all_conversations, false),
    COALESCE(ocr.can_manage_collaborators, false),
    COALESCE(ocr.can_manage_integrations, false),
    COALESCE(ocr.can_manage_tags, false),
    COALESCE(ocr.can_manage_automations, false),
    COALESCE(ocr.can_view_reports, false),
    ocr.id AS custom_role_id,
    ocr.name AS custom_role_name,
    ocr.color AS custom_role_color
  FROM organization_members om
  JOIN organization_custom_roles ocr ON om.custom_role_id = ocr.id
  WHERE om.user_id = auth.uid()
    AND om.organization_id = org_id
    AND om.is_active = true
  LIMIT 1;
$$;