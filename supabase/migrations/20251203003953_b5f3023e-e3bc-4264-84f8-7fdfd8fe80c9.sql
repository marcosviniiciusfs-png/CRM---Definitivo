-- Create table for Meta Pixel conversion event logs
CREATE TABLE public.meta_conversion_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE SET NULL,
  pixel_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  events_received INTEGER,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meta_conversion_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for organization members
CREATE POLICY "Users can view their organization meta logs"
ON public.meta_conversion_logs FOR SELECT
TO authenticated
USING (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "System can insert meta logs"
ON public.meta_conversion_logs FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (
  SELECT organization_id FROM organization_members 
  WHERE user_id = auth.uid()
));

-- Index for faster queries
CREATE INDEX idx_meta_conversion_logs_org_created ON public.meta_conversion_logs(organization_id, created_at DESC);
CREATE INDEX idx_meta_conversion_logs_status ON public.meta_conversion_logs(status);