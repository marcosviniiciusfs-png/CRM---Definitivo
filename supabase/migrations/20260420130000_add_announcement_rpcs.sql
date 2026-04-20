-- Create announcement (admin only)
CREATE OR REPLACE FUNCTION public.admin_create_announcement(
  p_token text,
  p_title text,
  p_content text,
  p_gif_url text DEFAULT NULL,
  p_template_type text DEFAULT NULL,
  p_target_type text DEFAULT 'global',
  p_target_organization_id uuid DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO public.announcements (title, content, gif_url, template_type, target_type, target_organization_id, is_active, scheduled_at)
  VALUES (p_title, p_content, p_gif_url, p_template_type, p_target_type, p_target_organization_id, true, p_scheduled_at)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Update announcement (admin only)
CREATE OR REPLACE FUNCTION public.admin_update_announcement(
  p_token text,
  p_id uuid,
  p_title text DEFAULT NULL,
  p_content text DEFAULT NULL,
  p_gif_url text DEFAULT NULL,
  p_template_type text DEFAULT NULL,
  p_target_type text DEFAULT NULL,
  p_target_organization_id uuid DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_scheduled_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.announcements SET
    title = COALESCE(p_title, title),
    content = COALESCE(p_content, content),
    gif_url = COALESCE(p_gif_url, gif_url),
    template_type = COALESCE(p_template_type, template_type),
    target_type = COALESCE(p_target_type, target_type),
    target_organization_id = COALESCE(p_target_organization_id, target_organization_id),
    is_active = COALESCE(p_is_active, is_active),
    scheduled_at = COALESCE(p_scheduled_at, scheduled_at)
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

-- List announcements (admin only)
CREATE OR REPLACE FUNCTION public.admin_list_announcements(p_token text)
RETURNS TABLE(
  id uuid, title text, content text, gif_url text, template_type text,
  target_type text, target_organization_id uuid, is_active boolean,
  scheduled_at timestamptz, created_by uuid, created_at timestamptz,
  org_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT a.id, a.title, a.content, a.gif_url, a.template_type,
    a.target_type, a.target_organization_id, a.is_active,
    a.scheduled_at, a.created_by, a.created_at,
    o.name as org_name
  FROM public.announcements a
  LEFT JOIN public.organizations o ON o.id = a.target_organization_id
  ORDER BY a.created_at DESC;

  RETURN;
END;
$$;

-- Delete announcement (admin only)
CREATE OR REPLACE FUNCTION public.admin_delete_announcement(p_token text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.validate_admin_token(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  DELETE FROM public.announcements WHERE id = p_id;
  RETURN FOUND;
END;
$$;
