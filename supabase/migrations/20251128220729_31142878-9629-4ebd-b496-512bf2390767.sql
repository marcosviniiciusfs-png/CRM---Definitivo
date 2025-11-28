-- Criar tabela de funis de vendas
CREATE TABLE IF NOT EXISTS public.sales_funnels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de etapas do funil (até 6 customizáveis + 2 obrigatórias)
CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  icon TEXT, -- Nome do ícone Lucide
  position INTEGER NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false, -- Para etapas "Ganho" e "Perdido"
  stage_type TEXT NOT NULL DEFAULT 'custom', -- 'custom', 'won', 'lost'
  default_value NUMERIC DEFAULT 0, -- Valor padrão para leads nesta etapa
  max_days_in_stage INTEGER, -- Limite de dias na etapa para automação
  required_fields JSONB DEFAULT '[]'::jsonb, -- Campos obrigatórios para avançar
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(funnel_id, position)
);

-- Criar tabela de regras de automação por etapa
CREATE TABLE IF NOT EXISTS public.funnel_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL, -- 'on_entry', 'on_exit', 'inactivity'
  trigger_config JSONB, -- Configurações adicionais (ex: tempo de inatividade)
  conditions JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  sequence_order INTEGER DEFAULT 0, -- Ordem na sequência de follow-ups
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de mapeamento de origem para funil
CREATE TABLE IF NOT EXISTS public.funnel_source_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL, -- 'facebook_form', 'webhook', 'whatsapp', 'manual'
  source_identifier TEXT, -- ID do formulário, webhook token, etc.
  target_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_identifier)
);

-- Criar tabela de histórico de movimentação entre etapas
CREATE TABLE IF NOT EXISTS public.funnel_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id),
  from_stage_id UUID REFERENCES public.funnel_stages(id),
  to_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id),
  moved_by UUID, -- user_id que moveu
  moved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  duration_in_previous_stage INTEGER, -- Duração em minutos na etapa anterior
  notes TEXT
);

-- Adicionar campos de funil na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.sales_funnels(id),
ADD COLUMN IF NOT EXISTS funnel_stage_id UUID REFERENCES public.funnel_stages(id);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_sales_funnels_organization ON public.sales_funnels(organization_id);
CREATE INDEX IF NOT EXISTS idx_funnel_stages_funnel ON public.funnel_stages(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_automation_rules_stage ON public.funnel_automation_rules(funnel_stage_id);
CREATE INDEX IF NOT EXISTS idx_funnel_source_mappings_funnel ON public.funnel_source_mappings(funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_stage_history_lead ON public.funnel_stage_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel ON public.leads(funnel_id);
CREATE INDEX IF NOT EXISTS idx_leads_funnel_stage ON public.leads(funnel_stage_id);

-- Habilitar RLS
ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stage_history ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para sales_funnels
CREATE POLICY "Usuários podem ver funis de sua organização"
ON public.sales_funnels FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Admins e Owners podem criar funis"
ON public.sales_funnels FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Admins e Owners podem atualizar funis"
ON public.sales_funnels FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

CREATE POLICY "Owners podem deletar funis"
ON public.sales_funnels FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members
    WHERE user_id = auth.uid()
      AND role = 'owner'
  )
);

-- Políticas RLS para funnel_stages
CREATE POLICY "Usuários podem ver etapas de funis da organização"
ON public.funnel_stages FOR SELECT
USING (
  funnel_id IN (
    SELECT id FROM public.sales_funnels
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins e Owners podem gerenciar etapas"
ON public.funnel_stages FOR ALL
USING (
  funnel_id IN (
    SELECT id FROM public.sales_funnels
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
);

-- Políticas RLS para funnel_automation_rules
CREATE POLICY "Usuários podem ver regras de automação de sua organização"
ON public.funnel_automation_rules FOR SELECT
USING (
  funnel_stage_id IN (
    SELECT fs.id FROM public.funnel_stages fs
    JOIN public.sales_funnels sf ON fs.funnel_id = sf.id
    WHERE sf.organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins e Owners podem gerenciar regras de automação"
ON public.funnel_automation_rules FOR ALL
USING (
  funnel_stage_id IN (
    SELECT fs.id FROM public.funnel_stages fs
    JOIN public.sales_funnels sf ON fs.funnel_id = sf.id
    WHERE sf.organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
);

-- Políticas RLS para funnel_source_mappings
CREATE POLICY "Usuários podem ver mapeamentos de sua organização"
ON public.funnel_source_mappings FOR SELECT
USING (
  funnel_id IN (
    SELECT id FROM public.sales_funnels
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins e Owners podem gerenciar mapeamentos"
ON public.funnel_source_mappings FOR ALL
USING (
  funnel_id IN (
    SELECT id FROM public.sales_funnels
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  )
);

-- Políticas RLS para funnel_stage_history
CREATE POLICY "Members veem apenas histórico de seus leads"
ON public.funnel_stage_history FOR SELECT
USING (
  lead_id IN (
    SELECT l.id FROM public.leads l
    JOIN public.organization_members om ON l.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND (om.role IN ('owner', 'admin') OR l.responsavel = (
        SELECT full_name FROM public.profiles WHERE user_id = auth.uid()
      ))
  )
);

CREATE POLICY "Usuários podem criar histórico para leads que gerenciam"
ON public.funnel_stage_history FOR INSERT
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_funnel_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_sales_funnels_updated_at
BEFORE UPDATE ON public.sales_funnels
FOR EACH ROW EXECUTE FUNCTION update_funnel_updated_at();

CREATE TRIGGER update_funnel_stages_updated_at
BEFORE UPDATE ON public.funnel_stages
FOR EACH ROW EXECUTE FUNCTION update_funnel_updated_at();

CREATE TRIGGER update_funnel_automation_rules_updated_at
BEFORE UPDATE ON public.funnel_automation_rules
FOR EACH ROW EXECUTE FUNCTION update_funnel_updated_at();