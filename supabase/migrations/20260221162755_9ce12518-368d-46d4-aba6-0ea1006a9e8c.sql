
-- Allow super_admins to manage subscriptions
CREATE POLICY "Super admins can insert subscriptions"
ON public.subscriptions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update subscriptions"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete subscriptions"
ON public.subscriptions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));
