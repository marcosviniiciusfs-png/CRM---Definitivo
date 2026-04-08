-- CORREÇÃO: Funis de Vendas — RLS policies + etapas Ganho/Perdido automáticas
--
-- PROBLEMA 1: RLS está habilitado nas tabelas sales_funnels, funnel_stages e
-- funnel_source_mappings, mas NENHUMA política foi definida. O PostgreSQL nega
-- todo acesso por padrão quando RLS está ativo sem policies — causando 400/403
-- em qualquer leitura ou escrita de funis.
--
-- PROBLEMA 2: Novos funis criados manualmente não recebem as etapas finais
-- "Venda Realizada" (won) e "Perdido" (lost) automaticamente — apenas o funil
-- padrão as tinha (criadas pelo trigger create_default_funnel_for_organization).
--
-- SOLUÇÃO:
-- 1. Criar políticas RLS para sales_funnels, funnel_stages e funnel_source_mappings
--    usando as funções SECURITY DEFINER já existentes (sem recursão).
-- 2. Criar trigger que insere as etapas finais para TODO novo funil não-padrão.
-- 3. Retroativamente inserir etapas Ganho/Perdido em funis existentes sem elas.

-- ============================================================
-- PASSO 1: Políticas RLS para sales_funnels
-- ============================================================

-- Limpar políticas antigas se existirem
DROP POLICY IF EXISTS "Users can view funnels in their org" ON public.sales_funnels;
DROP POLICY IF EXISTS "Users can create funnels in their org" ON public.sales_funnels;
DROP POLICY IF EXISTS "Users can update funnels in their org" ON public.sales_funnels;
DROP POLICY IF EXISTS "Owners can delete funnels in their org" ON public.sales_funnels;

-- SELECT: todos os membros da org podem ver os funis
CREATE POLICY "Users can view funnels in their org"
  ON public.sales_funnels
  FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()));

-- INSERT: todos os membros podem criar funis
CREATE POLICY "Users can create funnels in their org"
  ON public.sales_funnels
  FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- UPDATE: todos os membros podem editar funis
CREATE POLICY "Users can update funnels in their org"
  ON public.sales_funnels
  FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_organization_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_organization_id(auth.uid()));

-- DELETE: apenas owner/admin podem deletar funis não-padrão
CREATE POLICY "Owners can delete funnels in their org"
  ON public.sales_funnels
  FOR DELETE
  TO authenticated
  USING (
    organization_id = public.get_user_organization_id(auth.uid())
    AND is_default = false
    AND public.get_user_role_in_org(auth.uid(), organization_id) IN ('owner', 'admin')
  );

-- ============================================================
-- PASSO 2: Políticas RLS para funnel_stages
-- ============================================================

DROP POLICY IF EXISTS "Users can view stages of their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can create stages for their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can update stages of their org funnels" ON public.funnel_stages;
DROP POLICY IF EXISTS "Users can delete non-final stages of their org funnels" ON public.funnel_stages;

CREATE POLICY "Users can view stages of their org funnels"
  ON public.funnel_stages
  FOR SELECT
  TO authenticated
  USING (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can create stages for their org funnels"
  ON public.funnel_stages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can update stages of their org funnels"
  ON public.funnel_stages
  FOR UPDATE
  TO authenticated
  USING (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can delete non-final stages of their org funnels"
  ON public.funnel_stages
  FOR DELETE
  TO authenticated
  USING (
    is_final = false
    AND funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- ============================================================
-- PASSO 3: Políticas RLS para funnel_source_mappings
-- ============================================================

DROP POLICY IF EXISTS "Users can view source mappings of their org funnels" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can create source mappings for their org funnels" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can update source mappings of their org funnels" ON public.funnel_source_mappings;
DROP POLICY IF EXISTS "Users can delete source mappings of their org funnels" ON public.funnel_source_mappings;

CREATE POLICY "Users can view source mappings of their org funnels"
  ON public.funnel_source_mappings
  FOR SELECT
  TO authenticated
  USING (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can create source mappings for their org funnels"
  ON public.funnel_source_mappings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can update source mappings of their org funnels"
  ON public.funnel_source_mappings
  FOR UPDATE
  TO authenticated
  USING (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  )
  WITH CHECK (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

CREATE POLICY "Users can delete source mappings of their org funnels"
  ON public.funnel_source_mappings
  FOR DELETE
  TO authenticated
  USING (
    funnel_id IN (
      SELECT id FROM public.sales_funnels
      WHERE organization_id = public.get_user_organization_id(auth.uid())
    )
  );

-- ============================================================
-- PASSO 4: Trigger para criar etapas Ganho/Perdido em novos funis
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_default_final_stages_for_funnel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas para funis não-padrão (o funil padrão já tem o trigger
  -- create_default_funnel_for_organization que cria todas as etapas)
  IF NOT NEW.is_default THEN
    INSERT INTO public.funnel_stages
      (funnel_id, name, description, color, icon, position, stage_type, is_final)
    VALUES
      (NEW.id, 'Venda Realizada', 'Negócio fechado com sucesso',  '#10B981', '🎉', 6,   'won',  true),
      (NEW.id, 'Perdido',         'Negócio não concretizado',     '#EF4444', '❌', 999, 'lost', true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_default_final_stages_trigger ON public.sales_funnels;
CREATE TRIGGER create_default_final_stages_trigger
  AFTER INSERT ON public.sales_funnels
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_final_stages_for_funnel();

-- ============================================================
-- PASSO 5: Retroativamente inserir Ganho/Perdido em funis existentes
-- ============================================================

-- Inserir "Venda Realizada" em funis que não têm estágio 'won'
INSERT INTO public.funnel_stages
  (funnel_id, name, description, color, icon, position, stage_type, is_final)
SELECT
  sf.id, 'Venda Realizada', 'Negócio fechado com sucesso', '#10B981', '🎉', 6, 'won', true
FROM public.sales_funnels sf
WHERE sf.is_default = false
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_stages fs
    WHERE fs.funnel_id = sf.id AND fs.stage_type = 'won'
  );

-- Inserir "Perdido" em funis que não têm estágio 'lost'
INSERT INTO public.funnel_stages
  (funnel_id, name, description, color, icon, position, stage_type, is_final)
SELECT
  sf.id, 'Perdido', 'Negócio não concretizado', '#EF4444', '❌', 999, 'lost', true
FROM public.sales_funnels sf
WHERE sf.is_default = false
  AND NOT EXISTS (
    SELECT 1 FROM public.funnel_stages fs
    WHERE fs.funnel_id = sf.id AND fs.stage_type = 'lost'
  );

NOTIFY pgrst, 'reload schema';
