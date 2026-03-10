-- Create table for appointment goals per organization/period
CREATE TABLE public.appointment_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  year INTEGER NOT NULL CHECK (year >= 2020 AND year <= 2100),
  target_value INTEGER NOT NULL DEFAULT 10,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure only one goal per org/month/year
  UNIQUE(organization_id, month, year)
);

-- Enable RLS
ALTER TABLE public.appointment_goals ENABLE ROW LEVEL SECURITY;

-- Policy: Members can view their organization's goals
CREATE POLICY "Members can view appointment goals"
ON public.appointment_goals
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = appointment_goals.organization_id
    AND om.user_id = auth.uid()
    AND om.is_active = true
  )
);

-- Policy: Only owners and admins can manage goals
CREATE POLICY "Owners and admins can manage appointment goals"
ON public.appointment_goals
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = appointment_goals.organization_id
    AND om.user_id = auth.uid()
    AND om.is_active = true
    AND om.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = appointment_goals.organization_id
    AND om.user_id = auth.uid()
    AND om.is_active = true
    AND om.role IN ('owner', 'admin')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_appointment_goals_updated_at
BEFORE UPDATE ON public.appointment_goals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();