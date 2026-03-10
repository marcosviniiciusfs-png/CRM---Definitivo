
-- Insert super_admin role for mateusabcck@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('d70f265d-0fc6-4ef9-800d-7734bd2ea107', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- RLS policies for super_admins to manage user_roles
CREATE POLICY "Super admins can insert user_roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete user_roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can view all user_roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin') OR user_id = auth.uid());
