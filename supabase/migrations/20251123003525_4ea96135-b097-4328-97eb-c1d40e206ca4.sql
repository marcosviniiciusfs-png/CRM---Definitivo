-- Create facebook_webhook_logs table
CREATE TABLE public.facebook_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  facebook_lead_id TEXT,
  page_id TEXT,
  form_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.facebook_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view facebook webhook logs from their organization"
ON public.facebook_webhook_logs
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete facebook webhook logs from their organization"
ON public.facebook_webhook_logs
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Create index for better performance
CREATE INDEX idx_facebook_webhook_logs_organization_id ON public.facebook_webhook_logs(organization_id);
CREATE INDEX idx_facebook_webhook_logs_created_at ON public.facebook_webhook_logs(created_at DESC);
CREATE INDEX idx_facebook_webhook_logs_status ON public.facebook_webhook_logs(status);