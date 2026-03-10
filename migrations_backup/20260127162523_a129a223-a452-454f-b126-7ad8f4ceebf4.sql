-- Remover constraint unique para permitir múltiplos webhooks por organização
ALTER TABLE webhook_configs 
DROP CONSTRAINT IF EXISTS webhook_configs_organization_id_key;

-- Adicionar nome/título para identificação do webhook
ALTER TABLE webhook_configs 
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Webhook';

-- Adicionar campo para responsável padrão
ALTER TABLE webhook_configs 
ADD COLUMN IF NOT EXISTS default_responsible_user_id UUID;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_webhook_configs_organization 
ON webhook_configs(organization_id);