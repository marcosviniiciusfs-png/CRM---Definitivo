-- Migration: Adicionar funnel_id e funnel_stage_id diretamente em webhook_configs
-- Isso elimina a dependência da tabela funnel_source_mappings para roteamento de webhooks,
-- que causava falhas silenciosas quando havia múltiplos mapeamentos para o mesmo webhook.

-- 1. Adicionar colunas de funil diretamente no webhook_configs
ALTER TABLE webhook_configs
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES sales_funnels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS funnel_stage_id UUID REFERENCES funnel_stages(id) ON DELETE SET NULL;

-- 2. Migrar dados existentes de funnel_source_mappings → webhook_configs
-- Para cada webhook_config que tenha um mapeamento específico (source_identifier = webhook_config.id),
-- copiar o funnel_id e target_stage_id para a tabela webhook_configs.
UPDATE webhook_configs wc
SET
  funnel_id = fsm.funnel_id,
  funnel_stage_id = fsm.target_stage_id
FROM funnel_source_mappings fsm
WHERE
  fsm.source_type = 'webhook'
  AND fsm.source_identifier = wc.id::text
  AND fsm.funnel_id IS NOT NULL
  -- Usar o mapeamento mais recente em caso de duplicatas
  AND fsm.created_at = (
    SELECT MAX(fsm2.created_at)
    FROM funnel_source_mappings fsm2
    WHERE fsm2.source_type = 'webhook'
      AND fsm2.source_identifier = wc.id::text
  );

-- 3. Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_webhook_configs_funnel_id ON webhook_configs(funnel_id)
  WHERE funnel_id IS NOT NULL;

-- 4. Limpar duplicatas em funnel_source_mappings antes de criar o índice único
-- Manter apenas o registro mais recente para cada (source_type, source_identifier)
DELETE FROM funnel_source_mappings
WHERE id NOT IN (
  SELECT DISTINCT ON (source_type, source_identifier) id
  FROM funnel_source_mappings
  WHERE source_identifier IS NOT NULL
  ORDER BY source_type, source_identifier, created_at DESC
);

-- 5. Adicionar constraint UNIQUE em funnel_source_mappings para evitar duplicatas futuras
-- (executa apenas se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'funnel_source_mappings'
      AND indexname = 'funnel_source_mappings_source_unique'
  ) THEN
    CREATE UNIQUE INDEX funnel_source_mappings_source_unique
      ON funnel_source_mappings(source_type, source_identifier)
      WHERE source_identifier IS NOT NULL;
  END IF;
END $$;

-- 5. Comentário explicativo
COMMENT ON COLUMN webhook_configs.funnel_id IS 'Funil de destino dos leads recebidos por este webhook. Tem prioridade sobre funnel_source_mappings.';
COMMENT ON COLUMN webhook_configs.funnel_stage_id IS 'Etapa inicial dentro do funil de destino. Se NULL, usa a primeira etapa do funil.';
