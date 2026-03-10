-- Drop existing SELECT policy on google_calendar_integrations
DROP POLICY IF EXISTS "Users can view their organization integrations" ON public.google_calendar_integrations;
DROP POLICY IF EXISTS "Users can view their own calendar integrations" ON public.google_calendar_integrations;

-- Create new restrictive SELECT policy - users can only see their OWN integration
CREATE POLICY "Users can only view their own calendar integration"
ON public.google_calendar_integrations
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Update INSERT policy to ensure users can only insert for themselves
DROP POLICY IF EXISTS "Users can create calendar integrations" ON public.google_calendar_integrations;
CREATE POLICY "Users can create their own calendar integration"
ON public.google_calendar_integrations
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Update UPDATE policy to ensure users can only update their own integration
DROP POLICY IF EXISTS "Users can update their calendar integrations" ON public.google_calendar_integrations;
CREATE POLICY "Users can update their own calendar integration"
ON public.google_calendar_integrations
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Update DELETE policy to ensure users can only delete their own integration
DROP POLICY IF EXISTS "Users can delete their calendar integrations" ON public.google_calendar_integrations;
CREATE POLICY "Users can delete their own calendar integration"
ON public.google_calendar_integrations
FOR DELETE
TO authenticated
USING (user_id = auth.uid());