-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Deny public access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Organization members can view other members profiles" ON public.profiles;

-- Create RESTRICTIVE policy to deny ALL unauthenticated access first
-- This blocks anon role completely
CREATE POLICY "Deny unauthenticated access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Create PERMISSIVE policies for authenticated users
CREATE POLICY "Users can view their own profile"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles
AS PERMISSIVE
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Allow organization members to view each other's profiles (for collaboration)
CREATE POLICY "Organization members can view colleague profiles"
ON public.profiles
AS PERMISSIVE
FOR SELECT
TO authenticated
USING (
  user_id IN (
    SELECT om2.user_id
    FROM organization_members om1
    JOIN organization_members om2 ON om1.organization_id = om2.organization_id
    WHERE om1.user_id = auth.uid()
  )
);