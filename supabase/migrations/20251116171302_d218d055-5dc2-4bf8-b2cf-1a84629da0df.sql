-- Create activities table for lead history
CREATE TABLE public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

-- Users can view activities from their organization leads
CREATE POLICY "Users can view activities from their organization leads"
ON public.lead_activities
FOR SELECT
USING (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Users can create activities for their organization leads
CREATE POLICY "Users can create activities for their organization leads"
ON public.lead_activities
FOR INSERT
WITH CHECK (
  lead_id IN (
    SELECT id FROM public.leads
    WHERE organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  )
  AND auth.uid() = user_id
);

-- Users can update their own activities
CREATE POLICY "Users can update their own activities"
ON public.lead_activities
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own activities
CREATE POLICY "Users can delete their own activities"
ON public.lead_activities
FOR DELETE
USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities(lead_id);
CREATE INDEX idx_lead_activities_created_at ON public.lead_activities(created_at DESC);