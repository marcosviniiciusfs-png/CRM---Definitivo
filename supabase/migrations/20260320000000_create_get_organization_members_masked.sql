-- ============================================================
-- Cria a função get_organization_members_masked
-- Retorna todos os membros da organização do usuário atual,
-- enriquecidos com full_name e avatar_url vindos de profiles
-- (ou fallback em auth.users.raw_user_meta_data / display_name).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_organization_members_masked();

CREATE OR REPLACE FUNCTION public.get_organization_members_masked()
RETURNS TABLE (
  id              UUID,
  organization_id UUID,
  user_id         UUID,
  role            public.organization_role,
  created_at      TIMESTAMPTZ,
  email           TEXT,
  full_name       TEXT,
  avatar_url      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- 1. Descobrir a organização do usuário atual
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.user_id = auth.uid()
    AND om.is_active = true
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  -- 2. Retornar todos os membros ativos da organização
  RETURN QUERY
  SELECT
    om.id,
    om.organization_id,
    om.user_id,
    om.role,
    om.created_at,
    -- Email: retorna o valor da tabela (pode ser mascarado via trigger no futuro)
    COALESCE(om.email, u.email) AS email,
    -- full_name: profiles > auth.users metadata > display_name da tabela
    COALESCE(
      NULLIF(TRIM(p.full_name), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(om.display_name), ''),
      NULLIF(TRIM(SPLIT_PART(COALESCE(om.email, u.email), '@', 1)), '')
    ) AS full_name,
    p.avatar_url
  FROM public.organization_members om
  LEFT JOIN auth.users u ON u.id = om.user_id
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.organization_id = v_org_id
    AND om.is_active = true
  ORDER BY om.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_members_masked() TO authenticated;

NOTIFY pgrst, 'reload schema';
