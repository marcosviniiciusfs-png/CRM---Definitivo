-- Tabela de configurações de roleta por organização
CREATE TABLE public.lead_distribution_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  distribution_method TEXT NOT NULL DEFAULT 'round_robin', -- round_robin, weighted, load_based, random
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array de triggers: new_lead, whatsapp, facebook, webhook
  auto_redistribute BOOLEAN NOT NULL DEFAULT false,
  redistribution_timeout_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Tabela de configurações de agentes para distribuição
CREATE TABLE public.agent_distribution_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  pause_until TIMESTAMP WITH TIME ZONE,
  max_capacity INTEGER DEFAULT 50,
  priority_weight INTEGER DEFAULT 1, -- Peso para distribuição ponderada (1-10)
  working_hours JSONB, -- {monday: {start: "09:00", end: "18:00"}, ...}
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Tabela de histórico de distribuições
CREATE TABLE public.lead_distribution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id UUID, -- NULL para distribuição inicial
  to_user_id UUID NOT NULL,
  distribution_method TEXT NOT NULL,
  trigger_source TEXT NOT NULL, -- new_lead, whatsapp, facebook, webhook, manual, auto_redistribution
  is_redistribution BOOLEAN NOT NULL DEFAULT false,
  redistribution_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_distribution_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_distribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_distribution_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies para lead_distribution_configs
CREATE POLICY "Users can view their organization's distribution config"
ON public.lead_distribution_configs FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid()
));

CREATE POLICY "Admins can manage distribution config"
ON public.lead_distribution_configs FOR ALL
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- RLS Policies para agent_distribution_settings
CREATE POLICY "Users can view their organization's agent settings"
ON public.agent_distribution_settings FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid()
));

CREATE POLICY "Users can manage their own settings"
ON public.agent_distribution_settings FOR ALL
USING (user_id = auth.uid() OR organization_id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- RLS Policies para lead_distribution_history
CREATE POLICY "Users can view their organization's distribution history"
ON public.lead_distribution_history FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members
  WHERE user_id = auth.uid()
));

CREATE POLICY "Deny public access to distribution configs"
ON public.lead_distribution_configs FOR ALL
USING (false);

CREATE POLICY "Deny public access to agent settings"
ON public.agent_distribution_settings FOR ALL
USING (false);

CREATE POLICY "Deny public access to distribution history"
ON public.lead_distribution_history FOR ALL
USING (false);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lead_distribution_configs_updated_at
BEFORE UPDATE ON public.lead_distribution_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agent_distribution_settings_updated_at
BEFORE UPDATE ON public.agent_distribution_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();