-- ============================================================
-- FIX: RLS policies para sales_funnels, funnel_stages e
--      funnel_source_mappings
--
-- Problema 1: enforce_funnel_permissions referenciava a tabela
--   "funnel_permissions" que não existe — a tabela real é
--   "funnel_collaborators". Isso causava erro SQL ao avaliar a
--   policy, bloqueando todos os SELECTs em sales_funnels.
--
-- Problema 2: funnel_stages tinha RLS habilitado mas zero
--   policies → todas as queries retornavam vazio.
--
-- Problema 3: funnel_source_mappings tinha RLS habilitado mas
--   zero policies → FunnelSelector não conseguia ler nem salvar
--   mapeamentos de funil (SELECT/INSERT/UPDATE/DELETE falhavam).
-- ============================================================

-- ============================================================
-- 1. SALES_FUNNELS
-- ============================================================

-- Corrigir a policy restritiva: usar funnel_collaborators (tabela real)
DO $$
BEGIN
  DROP POLICY IF EXISTS "enforce_funnel_permissions" ON public.sales_funnels;

  CREATE POLICY "enforce_funnel_permissions"
    ON public.sales_funnels
    AS RESTRICTIVE
    FOR SELECT TO authenticated
    USING (
      -- Owners e admins sempre enxergam todos os funis da org
      EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE user_id = auth.uid()
          AND organization_id = sales_funnels.organization_id
          AND role IN ('owner', 'admin')
      )
      OR
      -- Funil não está restrito (is_restricted = false ou null)
      NOT COALESCE(sales_funnels.is_restricted, false)
      OR
      -- Usuário está explicitamente na lista de colaboradores do funil
      EXISTS (
        SELECT 1 FROM public.funnel_collaborators fc
        WHERE fc.funnel_id = sales_funnels.id
          AND fc.user_id = auth.uid()
      )
    );
END $$;

-- Adicionar policy permissiva de SELECT (necessária: policy restritiva
-- sozinha bloqueia tudo — precisa de ao menos 1 policy permissiva)
DO $$
BEGIN
  DROP POLICY IF EXISTS "org_members_can_view_funnels" ON public.sales_funnels;

  CREATE POLICY "org_members_can_view_funnels"
    ON public.sales_funnels
    FOR SELECT TO authenticated
    USING (
      organization_id IN (
        SELECT organization_id FROM public.organization_members
        WHERE user_id = auth.uid()
      )
    );
END $$;

-- ============================================================
-- 2. FUNNEL_STAGES — adicionar policies que estavam faltando
-- ============================================================

DO $$
BEGIN
  DROP POLICY IF EXISTS "org_members_can_view_funnel_stages" ON public.funnel_stages;

  CREATE POLICY "org_members_can_view_funnel_stages"
    ON public.funnel_stages
    FOR SELECT TO authenticated
    USING (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "org_admins_can_manage_funnel_stages" ON public.funnel_stages;

  CREATE POLICY "org_admins_can_manage_funnel_stages"
    ON public.funnel_stages
    FOR ALL TO authenticated
    USING (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      )
    )
    WITH CHECK (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
        )
      )
    );
END $$;

-- ============================================================
-- 3. FUNNEL_SOURCE_MAPPINGS — adicionar policies que estavam faltando
--    (FunnelSelector não conseguia ler nem salvar mapeamentos)
-- ============================================================

DO $$
BEGIN
  DROP POLICY IF EXISTS "org_members_can_view_funnel_mappings" ON public.funnel_source_mappings;

  CREATE POLICY "org_members_can_view_funnel_mappings"
    ON public.funnel_source_mappings
    FOR SELECT TO authenticated
    USING (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
    );

  DROP POLICY IF EXISTS "org_members_can_manage_funnel_mappings" ON public.funnel_source_mappings;

  CREATE POLICY "org_members_can_manage_funnel_mappings"
    ON public.funnel_source_mappings
    FOR ALL TO authenticated
    USING (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
    )
    WITH CHECK (
      funnel_id IN (
        SELECT sf.id FROM public.sales_funnels sf
        WHERE sf.organization_id IN (
          SELECT organization_id FROM public.organization_members
          WHERE user_id = auth.uid()
        )
      )
    );
END $$;

NOTIFY pgrst, 'reload schema';
