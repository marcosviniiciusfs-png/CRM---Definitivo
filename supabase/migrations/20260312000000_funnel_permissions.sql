-- FUNNEL PERMISSIONS
-- Controle de acesso por funil: permite restringir quais colaboradores veem cada funil.
-- Regra: se um funil não tem nenhuma entrada → todos da org podem ver.
--        Se tem entradas  → apenas os usuários listados + owners/admins podem ver.

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.funnel_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(funnel_id, user_id)
);

ALTER TABLE public.funnel_permissions ENABLE ROW LEVEL SECURITY;

-- 2. RLS POLICIES
DO $$
BEGIN
  -- Owners/admins podem ver todas as permissões da sua org
  DROP POLICY IF EXISTS "Owners can manage funnel_permissions" ON public.funnel_permissions;
  CREATE POLICY "Owners can manage funnel_permissions"
    ON public.funnel_permissions FOR ALL TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    )
    WITH CHECK (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
      )
    );

  -- Membros podem ver as próprias permissões
  DROP POLICY IF EXISTS "Members can view own funnel_permissions" ON public.funnel_permissions;
  CREATE POLICY "Members can view own funnel_permissions"
    ON public.funnel_permissions FOR SELECT TO authenticated
    USING (user_id = auth.uid());
END $$;

-- 3. FUNÇÃO RPC: retorna IDs dos funis acessíveis para o usuário corrente
CREATE OR REPLACE FUNCTION public.get_accessible_funnel_ids(p_organization_id UUID)
RETURNS TABLE(funnel_id UUID)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Descobrir role do usuário na org
  SELECT role INTO v_role
  FROM public.organization_members
  WHERE user_id = auth.uid() AND organization_id = p_organization_id
  LIMIT 1;

  -- Owner/admin vê todos os funis da org
  IF v_role IN ('owner', 'admin') THEN
    RETURN QUERY
      SELECT sf.id FROM public.sales_funnels sf
      WHERE sf.organization_id = p_organization_id AND sf.is_active = true;
    RETURN;
  END IF;

  -- Member: vê funis sem nenhuma permissão configurada (abertos)
  --         OU funis onde tem permissão explícita
  RETURN QUERY
    SELECT sf.id FROM public.sales_funnels sf
    WHERE sf.organization_id = p_organization_id
      AND sf.is_active = true
      AND (
        -- Funil não tem nenhuma permissão → aberto para todos da org
        NOT EXISTS (
          SELECT 1 FROM public.funnel_permissions fp
          WHERE fp.funnel_id = sf.id
        )
        OR
        -- Funil tem permissão explícita para este usuário
        EXISTS (
          SELECT 1 FROM public.funnel_permissions fp
          WHERE fp.funnel_id = sf.id AND fp.user_id = auth.uid()
        )
      );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_accessible_funnel_ids(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
