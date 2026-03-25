-- Enable Realtime for organization_custom_roles table
-- This is required so that when an owner updates cargo permissions,
-- collaborators who have that cargo assigned receive the change immediately
-- via the Supabase Realtime postgres_changes subscription in OrganizationContext.

-- Add organization_custom_roles to the supabase_realtime publication
-- so UPDATE events are broadcast to subscribed clients.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'organization_custom_roles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_custom_roles;
  END IF;
END $$;

-- Also ensure organization_members is in the publication (for role/cargo assignment changes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'organization_members'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
  END IF;
END $$;
