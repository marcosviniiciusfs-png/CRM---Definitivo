-- Fix: get_my_organization_memberships now returns created_at AND orders
-- deterministically (owner > admin > member, then created_at ASC).
--
-- Root cause: when a user has 2+ organization_members rows (rare but observed
-- in production due to past bugs in getOrCreateOrganizationId), the RPC
-- returned them in non-deterministic order. The frontend picks "first" after
-- a partial sort by role, but ties were broken arbitrarily — sometimes the
-- frontend pointed to org A while the backend just inserted a channel into
-- org B (because backend used .maybeSingle() which returns null on multiple
-- matches, falling through to "create new org" — creating yet ANOTHER org).
--
-- Fix combines with backend update (create-whatsapp-instance now uses
-- order(created_at).limit(1)) so frontend and backend always agree on which
-- org is "primary".

DROP FUNCTION IF EXISTS public.get_my_organization_memberships();

CREATE OR REPLACE FUNCTION public.get_my_organization_memberships()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  role text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    om.organization_id,
    COALESCE(o.name, 'Workspace') AS organization_name,
    om.role::TEXT,
    om.created_at
  FROM public.organization_members om
  LEFT JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid()
  ORDER BY
    CASE om.role::TEXT
      WHEN 'owner' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END ASC,
    om.created_at ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated;
