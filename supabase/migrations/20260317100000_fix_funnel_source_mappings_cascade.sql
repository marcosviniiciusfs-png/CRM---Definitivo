-- Fix: funnel_source_mappings com funnel_id órfão causam leads sempre caindo no funil padrão.
-- Problema: quando um funil é deletado, os mapeamentos de formulários Facebook ficam órfãos
-- (funnel_id inválido). O webhook filtra .in('funnel_id', funnelIds) e não os encontra,
-- caindo no funil padrão independente da configuração do usuário.
--
-- Solução:
-- 1. Deletar mapeamentos órfãos (funnel_id que não existe em sales_funnels)
-- 2. Recriar a FK com ON DELETE CASCADE para evitar órfãos no futuro

-- 1. Deletar mapeamentos cujo funnel_id não existe mais
DELETE FROM public.funnel_source_mappings
WHERE funnel_id NOT IN (SELECT id FROM public.sales_funnels);

-- 2. Recriar a FK com CASCADE (drop antiga se existir, cria nova)
DO $$
BEGIN
  -- Remover FK existente (pode ter nomes variados)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'funnel_source_mappings'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name LIKE '%funnel_id%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE public.funnel_source_mappings DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'funnel_source_mappings'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%funnel_id%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE public.funnel_source_mappings
  ADD CONSTRAINT funnel_source_mappings_funnel_id_fkey
  FOREIGN KEY (funnel_id)
  REFERENCES public.sales_funnels(id)
  ON DELETE CASCADE;
