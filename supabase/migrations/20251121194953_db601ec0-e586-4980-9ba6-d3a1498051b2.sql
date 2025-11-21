-- Criar tabela para relacionar leads com produtos/serviços
CREATE TABLE IF NOT EXISTS public.lead_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, item_id)
);

-- Habilitar RLS
ALTER TABLE public.lead_items ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view lead items from their organization"
ON public.lead_items FOR SELECT
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can create lead items in their organization"
ON public.lead_items FOR INSERT
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update lead items in their organization"
ON public.lead_items FOR UPDATE
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete lead items in their organization"
ON public.lead_items FOR DELETE
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Deny public access to lead items"
ON public.lead_items FOR ALL
USING (false);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lead_items_updated_at
BEFORE UPDATE ON public.lead_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();