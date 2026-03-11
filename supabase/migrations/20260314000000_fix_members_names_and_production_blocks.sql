-- FIX: get_organization_members_masked now returns full_name and avatar_url
-- REASON: The profiles table RLS prevents members from querying other members' profiles.
--         The RPC is SECURITY DEFINER so it can JOIN profiles without RLS restrictions.
--         This makes full_name and avatar_url available to all org members safely.
-- Must DROP first because return type is changing (PostgreSQL restriction).
DROP FUNCTION IF EXISTS public.get_organization_members_masked();

CREATE OR REPLACE FUNCTION public.get_organization_members_masked()
RETURNS TABLE(
  id            UUID,
  user_id       UUID,
  organization_id UUID,
  role          public.organization_role,
  email         TEXT,
  full_name     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_organization_id UUID;
  v_caller_role TEXT;
BEGIN
  -- Discover caller's org and role
  SELECT om.organization_id, om.role
  INTO v_organization_id, v_caller_role
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    om.id,
    om.user_id,
    om.organization_id,
    om.role,
    -- Mask email for regular members (only show own email or if admin/owner)
    CASE
      WHEN v_caller_role IN ('owner', 'admin') THEN COALESCE(om.email, '')
      WHEN om.user_id = auth.uid()             THEN COALESCE(om.email, '')
      ELSE '***@***.***'
    END AS email,
    -- full_name: prefer profiles.full_name, fallback to display_name
    COALESCE(p.full_name, om.display_name)  AS full_name,
    p.avatar_url                             AS avatar_url,
    om.created_at
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.organization_id = v_organization_id
    AND om.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_members_masked() TO authenticated;

-- ============================================================
-- AUTO-CREATE current month production block for all orgs
-- that don't have one yet, bootstrapping existing accounts.
-- ============================================================
DO $$
DECLARE
  v_org       RECORD;
  v_month     INT  := EXTRACT(MONTH FROM NOW())::INT;
  v_year      INT  := EXTRACT(YEAR FROM NOW())::INT;
  v_month_start TIMESTAMPTZ := DATE_TRUNC('month', NOW());
  v_month_end   TIMESTAMPTZ := DATE_TRUNC('month', NOW()) + INTERVAL '1 month';
  v_total_sales INT;
  v_total_revenue NUMERIC;
BEGIN
  FOR v_org IN SELECT id FROM public.organizations LOOP
    -- Skip if block already exists
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.production_blocks
      WHERE organization_id = v_org.id
        AND month = v_month
        AND year  = v_year
    );

    -- Count won leads for this month
    SELECT
      COUNT(*),
      COALESCE(SUM(l.valor), 0)
    INTO v_total_sales, v_total_revenue
    FROM public.leads l
    JOIN public.funnel_stages fs ON fs.id = l.funnel_stage_id
    WHERE l.organization_id = v_org.id
      AND fs.stage_type = 'won'
      AND l.data_conclusao >= v_month_start
      AND l.data_conclusao <  v_month_end;

    INSERT INTO public.production_blocks (
      organization_id, month, year,
      total_sales, total_revenue, total_cost, total_profit,
      previous_month_profit, profit_change_value, profit_change_percentage,
      is_closed
    ) VALUES (
      v_org.id, v_month, v_year,
      COALESCE(v_total_sales, 0),
      COALESCE(v_total_revenue, 0),
      0,
      COALESCE(v_total_revenue, 0),
      NULL, NULL, NULL,
      false
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
