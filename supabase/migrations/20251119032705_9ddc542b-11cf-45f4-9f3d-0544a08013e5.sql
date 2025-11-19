-- Tabela de etiquetas (tags)
CREATE TABLE public.lead_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, organization_id)
);

-- Tabela de associação entre leads e tags (many-to-many)
CREATE TABLE public.lead_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);

-- Habilitar RLS
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para lead_tags
CREATE POLICY "Users can view tags from their organization"
  ON public.lead_tags FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create tags in their organization"
  ON public.lead_tags FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update tags in their organization"
  ON public.lead_tags FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete tags in their organization"
  ON public.lead_tags FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  ));

-- Políticas RLS para lead_tag_assignments
CREATE POLICY "Users can view tag assignments from their organization leads"
  ON public.lead_tag_assignments FOR SELECT
  USING (lead_id IN (
    SELECT id FROM public.leads WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can create tag assignments for their organization leads"
  ON public.lead_tag_assignments FOR INSERT
  WITH CHECK (lead_id IN (
    SELECT id FROM public.leads WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  ));

CREATE POLICY "Users can delete tag assignments from their organization leads"
  ON public.lead_tag_assignments FOR DELETE
  USING (lead_id IN (
    SELECT id FROM public.leads WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  ));

-- Trigger para updated_at na tabela lead_tags
CREATE TRIGGER update_lead_tags_updated_at
  BEFORE UPDATE ON public.lead_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para melhor performance
CREATE INDEX idx_lead_tags_organization ON public.lead_tags(organization_id);
CREATE INDEX idx_lead_tag_assignments_lead ON public.lead_tag_assignments(lead_id);
CREATE INDEX idx_lead_tag_assignments_tag ON public.lead_tag_assignments(tag_id);