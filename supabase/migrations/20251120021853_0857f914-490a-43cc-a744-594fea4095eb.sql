-- Criar tabela de logs de webhook
CREATE TABLE public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  remote_jid TEXT,
  sender_name TEXT,
  message_content TEXT,
  message_type TEXT,
  direction TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_webhook_logs_organization_id ON public.webhook_logs(organization_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX idx_webhook_logs_status ON public.webhook_logs(status);

-- RLS Policies
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public access to webhook logs"
  ON public.webhook_logs
  FOR ALL
  USING (false);

CREATE POLICY "Users can view webhook logs from their organization"
  ON public.webhook_logs
  FOR SELECT
  USING (organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can delete webhook logs from their organization"
  ON public.webhook_logs
  FOR DELETE
  USING (organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));