-- Remover constraint de unique em organization_id para permitir múltiplas configs
ALTER TABLE public.lead_distribution_configs 
DROP CONSTRAINT IF EXISTS lead_distribution_configs_organization_id_key;

-- Adicionar novos campos para identificar cada roleta
ALTER TABLE public.lead_distribution_configs
ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT 'Roleta Padrão',
ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'all',
ADD COLUMN IF NOT EXISTS source_identifiers JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS description TEXT;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.lead_distribution_configs.name IS 'Nome identificador da roleta';
COMMENT ON COLUMN public.lead_distribution_configs.source_type IS 'Tipo de fonte: all, whatsapp, facebook, webhook';
COMMENT ON COLUMN public.lead_distribution_configs.source_identifiers IS 'Identificadores específicos: form_ids, page_ids, webhook_tokens, etc.';
COMMENT ON COLUMN public.lead_distribution_configs.description IS 'Descrição da roleta';

-- Criar índice para busca eficiente por organization_id e source_type
CREATE INDEX IF NOT EXISTS idx_lead_distribution_configs_org_source 
ON public.lead_distribution_configs(organization_id, source_type);

-- Criar índice para busca por is_active
CREATE INDEX IF NOT EXISTS idx_lead_distribution_configs_active 
ON public.lead_distribution_configs(organization_id, is_active) 
WHERE is_active = true;