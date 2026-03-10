
-- ==========================================================
-- LIBERAÇÃO TOTAL - CRM GRATUITO
-- Este script garante que todos os usuários tenham acesso total
-- ==========================================================

-- 1. FUNÇÃO PARA GARANTIR ASSINATURA FREE
CREATE OR REPLACE FUNCTION public.ensure_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
    -- Se for uma nova organização ou membro, garante que o dono/membro tenha um plano ativo
    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (NEW.user_id, NEW.organization_id, 'enterprise_free', 'authorized', 0, now())
    ON CONFLICT (user_id) DO UPDATE SET 
        plan_id = 'enterprise_free',
        status = 'authorized',
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. TRIGGER PARA NOVAS ORGANIZAÇÕES/MEMBROS
DROP TRIGGER IF EXISTS tr_ensure_free_subscription ON public.organization_members;
CREATE TRIGGER tr_ensure_free_subscription
AFTER INSERT ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.ensure_free_subscription();

-- 3. ATUALIZAR TODOS OS USUÁRIOS EXISTENTES
DO $$
DECLARE
    member_record RECORD;
BEGIN
    FOR member_record IN SELECT user_id, organization_id FROM public.organization_members WHERE is_active = true
    LOOP
        INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
        VALUES (member_record.user_id, member_record.organization_id, 'enterprise_free', 'authorized', 0, now())
        ON CONFLICT (user_id) DO UPDATE SET 
            plan_id = 'enterprise_free',
            status = 'authorized',
            updated_at = now();
    END LOOP;
END $$;

-- 4. GARANTIR QUE RLS NÃO BLOQUEIE O ADMIN
-- (Já deve estar no script de bypass global, mas garantimos aqui para a tabela subscriptions)
DROP POLICY IF EXISTS "Super_Admin_Supreme_Bypass" ON public.subscriptions;
CREATE POLICY "Super_Admin_Supreme_Bypass" ON public.subscriptions FOR ALL TO authenticated 
    USING (public.has_role(auth.uid(), 'super_admin')) 
    WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- 5. NOTIFICAR O SCHEMA
NOTIFY pgrst, 'reload schema';
