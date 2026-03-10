-- Fix RLS policies for user_sessions table
DROP POLICY IF EXISTS "Deny public access to sessions" ON public.user_sessions;

CREATE POLICY "Users can create own sessions"
ON public.user_sessions
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own sessions"
ON public.user_sessions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own sessions"
ON public.user_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Fix RLS policies for whatsapp_instances table
DROP POLICY IF EXISTS "Deny public access to whatsapp instances" ON public.whatsapp_instances;

CREATE POLICY "Deny anonymous access to whatsapp instances"
ON public.whatsapp_instances
AS RESTRICTIVE
FOR ALL
TO anon
USING (false);