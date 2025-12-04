-- 1. SISTEMA DE COMISSÕES
-- Tabela de configuração de comissões por organização
CREATE TABLE public.commission_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'percentage', -- percentage, fixed
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 10, -- 10% ou R$ fixo
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Tabela de comissões geradas
CREATE TABLE public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sale_value NUMERIC(15,2) NOT NULL,
  commission_value NUMERIC(15,2) NOT NULL,
  commission_type TEXT NOT NULL,
  commission_rate NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, cancelled
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para comissões
CREATE INDEX idx_commissions_org_user ON public.commissions(organization_id, user_id);
CREATE INDEX idx_commissions_org_status ON public.commissions(organization_id, status);
CREATE INDEX idx_commissions_created_at ON public.commissions(created_at DESC);

-- RLS para commission_configs
ALTER TABLE public.commission_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org commission config"
ON public.commission_configs FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can manage commission config"
ON public.commission_configs FOR ALL
USING (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- RLS para commissions
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own commissions"
ON public.commissions FOR SELECT
USING (
  user_id = auth.uid() OR
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "System can insert commissions"
ON public.commissions FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can update commissions"
ON public.commissions FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- 2. FILA DE MENSAGENS PARA WEBHOOKS
CREATE TABLE public.webhook_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_type TEXT NOT NULL, -- whatsapp, facebook, form
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para fila
CREATE INDEX idx_webhook_queue_status ON public.webhook_queue(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_queue_created ON public.webhook_queue(created_at);

-- RLS para webhook_queue (apenas sistema pode acessar)
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public access to webhook queue"
ON public.webhook_queue FOR ALL
USING (false);

-- Função para gerar comissão automaticamente quando lead vai para won
CREATE OR REPLACE FUNCTION public.generate_commission_on_won()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  calc_commission NUMERIC(15,2);
BEGIN
  -- Só executa se o lead foi movido para um stage 'won'
  IF NEW.funnel_stage_id IS NOT NULL AND NEW.responsavel_user_id IS NOT NULL AND NEW.valor IS NOT NULL AND NEW.valor > 0 THEN
    -- Verifica se o stage é 'won'
    IF EXISTS (
      SELECT 1 FROM public.funnel_stages 
      WHERE id = NEW.funnel_stage_id AND stage_type = 'won'
    ) THEN
      -- Busca configuração de comissão
      SELECT * INTO config_record 
      FROM public.commission_configs 
      WHERE organization_id = NEW.organization_id AND is_active = true;
      
      IF FOUND THEN
        -- Calcula comissão
        IF config_record.commission_type = 'percentage' THEN
          calc_commission := NEW.valor * (config_record.commission_value / 100);
        ELSE
          calc_commission := config_record.commission_value;
        END IF;
        
        -- Insere comissão (evita duplicatas)
        INSERT INTO public.commissions (
          organization_id, user_id, lead_id, sale_value, 
          commission_value, commission_type, commission_rate
        )
        SELECT 
          NEW.organization_id, NEW.responsavel_user_id, NEW.id, NEW.valor,
          calc_commission, config_record.commission_type, config_record.commission_value
        WHERE NOT EXISTS (
          SELECT 1 FROM public.commissions WHERE lead_id = NEW.id
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para gerar comissão
CREATE TRIGGER trigger_generate_commission
AFTER UPDATE ON public.leads
FOR EACH ROW
WHEN (OLD.funnel_stage_id IS DISTINCT FROM NEW.funnel_stage_id)
EXECUTE FUNCTION public.generate_commission_on_won();