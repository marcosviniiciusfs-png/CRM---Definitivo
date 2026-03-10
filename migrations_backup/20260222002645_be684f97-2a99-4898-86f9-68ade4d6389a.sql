
-- 1. Create production_expenses table
CREATE TABLE public.production_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  production_block_id UUID NOT NULL REFERENCES public.production_blocks(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.production_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deny public access to production expenses"
  ON public.production_expenses AS RESTRICTIVE FOR ALL USING (false);

CREATE POLICY "Users can view expenses from their organization"
  ON public.production_expenses FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Admins can create expenses"
  ON public.production_expenses FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Admins can update expenses"
  ON public.production_expenses FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

CREATE POLICY "Admins can delete expenses"
  ON public.production_expenses FOR DELETE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- 2. Create trigger for auto-commission on lead won (function already exists)
CREATE TRIGGER trigger_generate_commission_on_won
  AFTER UPDATE OF funnel_stage_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_commission_on_won();

-- 3. Allow admins to upsert goals for any user in their org
DROP POLICY IF EXISTS "Users can create goals in their organization" ON public.goals;
CREATE POLICY "Users can create goals in their organization"
  ON public.goals FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

DROP POLICY IF EXISTS "Users can update their own goals" ON public.goals;
CREATE POLICY "Admins can update goals in their organization"
  ON public.goals FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));
