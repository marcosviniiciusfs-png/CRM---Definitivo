-- Create webhook_logs table for form webhook
CREATE TABLE IF NOT EXISTS public.form_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_token TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'form_submission',
  status TEXT NOT NULL DEFAULT 'processing',
  payload JSONB,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.form_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Deny public access to form webhook logs"
  ON public.form_webhook_logs
  FOR ALL
  USING (false);

CREATE POLICY "Users can view form webhook logs from their organization"
  ON public.form_webhook_logs
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete form webhook logs from their organization"
  ON public.form_webhook_logs
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- Index for performance
CREATE INDEX idx_form_webhook_logs_organization ON public.form_webhook_logs(organization_id);
CREATE INDEX idx_form_webhook_logs_created_at ON public.form_webhook_logs(created_at DESC);