-- Criar tabela para armazenar integrações do Google Calendar
CREATE TABLE IF NOT EXISTS public.google_calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT DEFAULT 'primary',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Deny public access to google calendar integrations"
  ON public.google_calendar_integrations
  AS RESTRICTIVE
  FOR ALL
  USING (false);

CREATE POLICY "Users can view their organization's Google Calendar integrations"
  ON public.google_calendar_integrations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create Google Calendar integrations in their organization"
  ON public.google_calendar_integrations
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "Users can update their organization's Google Calendar integrations"
  ON public.google_calendar_integrations
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their organization's Google Calendar integrations"
  ON public.google_calendar_integrations
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Adicionar coluna opcional para vincular eventos a leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS calendar_event_id TEXT;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_google_calendar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER update_google_calendar_integrations_updated_at
  BEFORE UPDATE ON public.google_calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_google_calendar_updated_at();