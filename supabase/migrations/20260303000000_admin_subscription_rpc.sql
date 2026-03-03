
-- 1. Desabilitar as políticas antigas para evitar conflitos (opcional, mas recomendado se as novas falharem)
-- DROP POLICY IF EXISTS "Super admins can select subscriptions" ON public.subscriptions;
-- DROP POLICY IF EXISTS "Super admins can insert subscriptions" ON public.subscriptions;
-- DROP POLICY IF EXISTS "Super admins can update subscriptions" ON public.subscriptions;
-- DROP POLICY IF EXISTS "Super admins can delete subscriptions" ON public.subscriptions;

-- 2. Garantir permissões completas para Super Admins via RLS (mais robusto)
DO $$
BEGIN
    -- Permitir SELECT em tudo
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Super Admin Select All') THEN
        CREATE POLICY "Super Admin Select All" ON public.subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
    END IF;

    -- Permitir INSERT em tudo
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Super Admin Insert All') THEN
        CREATE POLICY "Super Admin Insert All" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
    END IF;

    -- Permitir UPDATE em tudo
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Super Admin Update All') THEN
        CREATE POLICY "Super Admin Update All" ON public.subscriptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
    END IF;

    -- Permitir DELETE em tudo
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscriptions' AND policyname = 'Super Admin Delete All') THEN
        CREATE POLICY "Super Admin Delete All" ON public.subscriptions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
    END IF;
END $$;

-- 3. Criar função RPC SECURITY DEFINER para gestão de planos (BYPASS TOTAL DE RLS E MAIS SEGURO)
-- Esta função deve ser chamada via supabase.rpc('admin_manage_user_subscription', { ... })
CREATE OR REPLACE FUNCTION public.admin_manage_user_subscription(
    p_user_id UUID,
    p_plan_id TEXT,
    p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER -- Crucial: pula RLS e usa privilégio de quem criou a função
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
BEGIN
    -- Obter o ID do usuário que faz a chamada
    v_admin_id := auth.uid();

    -- Segurança extra: validar se quem chama é realmente um super_admin
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    -- Se o plano for 'none', deletamos a assinatura
    IF p_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = p_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Assinatura removida com sucesso', 'action', 'deleted');
    ELSE
        -- Upsert da assinatura (Amount sempre 0 para admin)
        INSERT INTO public.subscriptions (
            user_id, 
            plan_id, 
            status, 
            amount, 
            organization_id, 
            start_date, 
            updated_at
        )
        VALUES (
            p_user_id,
            p_plan_id,
            'authorized',
            0,
            p_organization_id,
            now(),
            now()
        )
        ON CONFLICT (user_id) 
        DO UPDATE SET
            plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            amount = 0,
            organization_id = COALESCE(p_organization_id, subscriptions.organization_id),
            updated_at = now();
            
        RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado com sucesso', 'plan', p_plan_id);
    END IF;
END;
$$;
