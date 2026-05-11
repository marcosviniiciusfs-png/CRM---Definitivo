-- Bug critico: a RPC get_organization_members_masked() ignora a organization_id
-- que o cliente quer consultar. Internamente faz LIMIT 1 nas orgs do auth.uid(),
-- entao usuarios em multiplas orgs recebem membros da org errada (a primeira
-- encontrada). Resultado pratico: ao criar uma roleta, o modal lista membros
-- de outra organizacao em vez da que esta sendo usada na UI.
--
-- Fix: aceitar parametro opcional p_organization_id. Se passado, valida que o
-- caller e' membro daquela org e retorna seus membros. Se nao passado, mantem
-- o comportamento legado (LIMIT 1) — backward compat com call sites que ainda
-- chamem sem argumentos.

DROP FUNCTION IF EXISTS public.get_organization_members_masked();
DROP FUNCTION IF EXISTS public.get_organization_members_masked(uuid);

CREATE OR REPLACE FUNCTION public.get_organization_members_masked(
  p_organization_id uuid DEFAULT NULL
)
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
  -- Determinar org a consultar
  IF p_organization_id IS NOT NULL THEN
    -- Validar que o caller e' membro da org solicitada
    SELECT om.organization_id INTO v_org_id
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_organization_id
      AND om.is_active = true
    LIMIT 1;

    IF v_org_id IS NULL THEN
      -- Nao e' membro daquela org: nao retorna nada (silencioso, sem leak)
      RETURN;
    END IF;
  ELSE
    -- Fallback legado: primeira org do usuario (LIMIT 1)
    SELECT om.organization_id INTO v_org_id
    FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.is_active = true
    LIMIT 1;

    IF v_org_id IS NULL THEN
      RETURN;
    END IF;
  END IF;

  -- Retornar todos os membros ativos da org escolhida
  RETURN QUERY
  SELECT
    om.id,
    om.organization_id,
    om.user_id,
    om.role,
    om.created_at,
    COALESCE(om.email, u.email) AS email,
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

GRANT EXECUTE ON FUNCTION public.get_organization_members_masked(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
