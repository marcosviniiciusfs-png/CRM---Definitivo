-- Migração para associar leads antigos (sem organization_id) à organização correta

-- Atualizar leads que não têm organization_id
-- Estratégia: Associar à primeira organização disponível no sistema
-- (Assumindo que é um sistema novo com um único usuário/organização)

UPDATE public.leads
SET organization_id = (
  SELECT id 
  FROM public.organizations 
  ORDER BY created_at ASC 
  LIMIT 1
)
WHERE organization_id IS NULL
  AND EXISTS (SELECT 1 FROM public.organizations LIMIT 1);

-- Log dos leads atualizados
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Leads atualizados: %', updated_count;
END $$;