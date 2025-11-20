-- Remove a constraint única antiga que só considera telefone_lead
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_telefone_lead_key;

-- Adiciona constraint única composta considerando telefone_lead E organization_id
-- Isso permite que diferentes organizações tenham leads com o mesmo telefone
-- mas impede duplicatas dentro da mesma organização
ALTER TABLE public.leads 
ADD CONSTRAINT leads_telefone_organization_unique 
UNIQUE (telefone_lead, organization_id);