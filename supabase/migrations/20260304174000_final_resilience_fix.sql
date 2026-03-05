
-- ============================================================
-- FIX DEFINITIVO: CONSTRAINT DE UNICIDADE + RPC RESILIENTE
-- ============================================================

-- 1. Garantir que subscriptions tenha um índice único em user_id para o ON CONFLICT funcionar
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'subscriptions_user_id_key' 
          AND contype = 'u'
    ) THEN
        -- Tentar remover duplicatas antes de criar o índice
        DELETE FROM public.subscriptions a USING (
          SELECT MIN(ctid) as ctid, user_id 
          FROM public.subscriptions 
          GROUP BY user_id HAVING COUNT(*) > 1
        ) b WHERE a.user_id = b.user_id AND a.ctid != b.ctid;

        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- 2. Atualizar a RPC para ser ultra-resiliente
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $body$
DECLARE
    v_uid UUID;
    v_mail TEXT;
    v_name TEXT;
    v_oid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Sessão expirada. Por favor, faça login novamente.'); 
    END IF;

    -- 1. Tentar encontrar organização onde o usuário já é membro
    SELECT organization_id INTO v_oid 
    FROM public.organization_members 
    WHERE user_id = v_uid 
    ORDER BY created_at ASC 
    LIMIT 1;

    -- 2. Se não encontrou, vamos criar uma nova
    IF v_oid IS NULL THEN
        SELECT email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)) 
        INTO v_mail, v_name
        FROM auth.users 
        WHERE id = v_uid;

        -- Criar organização
        INSERT INTO public.organizations (name)
        VALUES (v_name || ' Workspace')
        RETURNING id INTO v_oid;

        -- Adicionar como dono
        INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
        VALUES (v_oid, v_uid, v_mail, 'owner', true);
    END IF;

    -- 3. Garantir que existe uma assinatura para este usuário vinculada à organização
    -- Usamos UPSERT agora que temos o índice único em user_id
    INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date)
    VALUES (v_uid, v_oid, 'enterprise_free', 'authorized', 0, now())
    ON CONFLICT (user_id) DO UPDATE SET 
        organization_id = EXCLUDED.organization_id,
        plan_id = 'enterprise_free',
        status = 'authorized',
        updated_at = now();

    RETURN jsonb_build_object('success', true, 'organization_id', v_oid);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$body$;

-- 3. Re-garantir permissões
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
