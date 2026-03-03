
-- Garantir que super admins possam gerenciar completamente as assinaturas
-- Isso resolve o erro 403 ao tentar fazer upsert no painel admin
DO $$
BEGIN
    -- Política para INSERT
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscriptions' 
        AND policyname = 'Super admins can insert subscriptions'
    ) THEN
        CREATE POLICY "Super admins can insert subscriptions"
        ON public.subscriptions
        FOR INSERT
        TO authenticated
        WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
    END IF;

    -- Política para UPDATE
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscriptions' 
        AND policyname = 'Super admins can update subscriptions'
    ) THEN
        CREATE POLICY "Super admins can update subscriptions"
        ON public.subscriptions
        FOR UPDATE
        TO authenticated
        USING (public.has_role(auth.uid(), 'super_admin'))
        WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
    END IF;

    -- Política para DELETE (já que temos exclusão no painel admin)
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'subscriptions' 
        AND policyname = 'Super admins can delete subscriptions'
    ) THEN
        CREATE POLICY "Super admins can delete subscriptions"
        ON public.subscriptions
        FOR DELETE
        TO authenticated
        USING (public.has_role(auth.uid(), 'super_admin'));
    END IF;
END $$;
