
-- 1. Desabilitar as políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Super admins can select subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can insert subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can update subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super admins can delete subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Select All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Insert All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Update All" ON public.subscriptions;
DROP POLICY IF EXISTS "Super Admin Delete All" ON public.subscriptions;

-- 2. Garantir permissões completas para Super Admins via RLS (mais robusto)
DO $$
BEGIN
    -- Permitir SELECT em tudo
    CREATE POLICY "Super Admin Select All" ON public.subscriptions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

    -- Permitir INSERT em tudo
    CREATE POLICY "Super Admin Insert All" ON public.subscriptions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

    -- Permitir UPDATE em tudo
    CREATE POLICY "Super Admin Update All" ON public.subscriptions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

    -- Permitir DELETE em tudo
    CREATE POLICY "Super Admin Delete All" ON public.subscriptions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
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
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_exists BOOLEAN;
BEGIN
    -- Obter o ID do usuário que faz a chamada
    v_admin_id := auth.uid();

    -- Segurança extra: validar se quem chama é realmente um super_admin
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_admin_id AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    -- Se o plano for 'none', deletamos a assinatura
    IF p_plan_id = 'none' THEN
        DELETE FROM public.subscriptions WHERE user_id = p_user_id;
        RETURN jsonb_build_object('status', 'success', 'message', 'Assinatura removida com sucesso', 'action', 'deleted');
    ELSE
        -- Verificamos se já existe para decidir entre INSERT ou UPDATE
        SELECT EXISTS(SELECT 1 FROM public.subscriptions WHERE user_id = p_user_id) INTO v_exists;

        IF v_exists THEN
            -- Update
            UPDATE public.subscriptions 
            SET 
                plan_id = p_plan_id,
                status = 'authorized',
                amount = 0,
                organization_id = COALESCE(p_organization_id, organization_id),
                updated_at = now()
            WHERE user_id = p_user_id;
            
            RETURN jsonb_build_object('status', 'success', 'message', 'Plano atualizado com sucesso', 'plan', p_plan_id, 'action', 'updated');
        ELSE
            -- Insert
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
            );
            
            RETURN jsonb_build_object('status', 'success', 'message', 'Plano criado com sucesso', 'plan', p_plan_id, 'action', 'inserted');
        END IF;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Retornar o erro capturado para o frontend exibir
    RETURN jsonb_build_object('status', 'error', 'message', SQLERRM);
END;
$$;

-- Garantir que o papel authenticated possa executar a função
GRANT EXECUTE ON FUNCTION public.admin_manage_user_subscription(UUID, TEXT, UUID) TO authenticated;

-- 4. Criar função RPC de LEITURA segura para o painel admin
-- Usada para ler o plano atual sem depender de política SELECT de RLS
CREATE OR REPLACE FUNCTION public.admin_get_user_subscription(p_user_id UUID)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID;
    v_sub RECORD;
BEGIN
    v_admin_id := auth.uid();

    -- Validar se quem chama é super_admin
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = v_admin_id AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    SELECT plan_id, status INTO v_sub
    FROM public.subscriptions
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'none', 'plan_id', null);
    END IF;

    RETURN jsonb_build_object('status', v_sub.status, 'plan_id', v_sub.plan_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_user_subscription(UUID) TO authenticated;

-- 5. Criar função RPC para listar todos os planos (usada no dashboard admin)
CREATE OR REPLACE FUNCTION public.admin_get_all_subscriptions()
RETURNS TABLE(user_id UUID, plan_id TEXT, status TEXT)
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    -- Validar super_admin
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_roles.user_id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'Acesso negado: apenas para super administradores.';
    END IF;

    RETURN QUERY
    SELECT s.user_id, s.plan_id, s.status
    FROM public.subscriptions s
    WHERE s.status = 'authorized';
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_all_subscriptions() TO authenticated;
