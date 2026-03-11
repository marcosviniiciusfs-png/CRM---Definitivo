-- Fix webhook_configs: RLS policies, remove UNIQUE(organization_id), add name column
-- Fix lead_tags: add INSERT/UPDATE/DELETE RLS policies

-- ============================================================
-- 1. webhook_configs: adicionar coluna name se não existir
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'webhook_configs'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE public.webhook_configs ADD COLUMN name TEXT;
  END IF;
END $$;

-- ============================================================
-- 2. webhook_configs: remover constraint UNIQUE(organization_id)
--    para permitir múltiplos webhooks por organização
-- ============================================================
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.webhook_configs'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 1
    AND conkey[1] = (
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.webhook_configs'::regclass
        AND attname = 'organization_id'
    );

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.webhook_configs DROP CONSTRAINT ' || quote_ident(constraint_name);
    RAISE NOTICE 'Constraint % removida de webhook_configs', constraint_name;
  END IF;
END $$;

-- ============================================================
-- 3. webhook_configs: criar políticas RLS completas
-- ============================================================
DO $$
BEGIN
  -- SELECT
  DROP POLICY IF EXISTS "Users can view their org webhooks" ON public.webhook_configs;
  CREATE POLICY "Users can view their org webhooks" ON public.webhook_configs
    FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

  -- INSERT (apenas owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can create webhooks" ON public.webhook_configs;
  CREATE POLICY "Owners and admins can create webhooks" ON public.webhook_configs
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

  -- UPDATE (apenas owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can update webhooks" ON public.webhook_configs;
  CREATE POLICY "Owners and admins can update webhooks" ON public.webhook_configs
    FOR UPDATE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

  -- DELETE (apenas owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can delete webhooks" ON public.webhook_configs;
  CREATE POLICY "Owners and admins can delete webhooks" ON public.webhook_configs
    FOR DELETE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));
END $$;

-- ============================================================
-- 4. lead_tags: criar políticas RLS de INSERT/UPDATE/DELETE
-- ============================================================
DO $$
BEGIN
  -- SELECT (todos da org podem ver)
  DROP POLICY IF EXISTS "Users can view their org tags" ON public.lead_tags;
  CREATE POLICY "Users can view their org tags" ON public.lead_tags
    FOR SELECT TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    ));

  -- INSERT (owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can create tags" ON public.lead_tags;
  CREATE POLICY "Owners and admins can create tags" ON public.lead_tags
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

  -- UPDATE (owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can update tags" ON public.lead_tags;
  CREATE POLICY "Owners and admins can update tags" ON public.lead_tags
    FOR UPDATE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));

  -- DELETE (owner e admin)
  DROP POLICY IF EXISTS "Owners and admins can delete tags" ON public.lead_tags;
  CREATE POLICY "Owners and admins can delete tags" ON public.lead_tags
    FOR DELETE TO authenticated
    USING (organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ));
END $$;

-- ============================================================
-- 5. lead_tag_assignments: garantir políticas RLS
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view tag assignments in their org" ON public.lead_tag_assignments;
  CREATE POLICY "Users can view tag assignments in their org" ON public.lead_tag_assignments
    FOR SELECT TO authenticated
    USING (lead_id IN (
      SELECT id FROM public.leads WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    ));

  DROP POLICY IF EXISTS "Users can create tag assignments in their org" ON public.lead_tag_assignments;
  CREATE POLICY "Users can create tag assignments in their org" ON public.lead_tag_assignments
    FOR INSERT TO authenticated
    WITH CHECK (lead_id IN (
      SELECT id FROM public.leads WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    ));

  DROP POLICY IF EXISTS "Users can delete tag assignments in their org" ON public.lead_tag_assignments;
  CREATE POLICY "Users can delete tag assignments in their org" ON public.lead_tag_assignments
    FOR DELETE TO authenticated
    USING (lead_id IN (
      SELECT id FROM public.leads WHERE organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
    ));
END $$;

NOTIFY pgrst, 'reload schema';
