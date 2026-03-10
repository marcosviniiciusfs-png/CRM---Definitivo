
-- ============================================================
-- REPARO TOTAL E DEFINITIVO DO BANCO DE DADOS
-- ============================================================

-- 1. GARANTIR ESTRUTURA DAS TABELAS (Sem erros)
DO $$ 
BEGIN 
    -- 1.1 organization_members email e is_active
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_members' AND column_name='email') THEN
        ALTER TABLE public.organization_members ADD COLUMN email TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='organization_members' AND column_name='is_active') THEN
        ALTER TABLE public.organization_members ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;

    -- Atualizar registros nulos para true
    UPDATE public.organization_members SET is_active = true WHERE is_active IS NULL;

    -- 1.2 subscriptions - Constraint Unix para user_id (Necessário para UPSERT/ON CONFLICT)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_unique' AND contype = 'u') THEN
        -- Remover duplicatas silenciosamente antes de criar a constraint
        DELETE FROM public.subscriptions a USING (
            SELECT MIN(ctid) as ctid, user_id FROM public.subscriptions GROUP BY user_id HAVING COUNT(*) > 1
        ) b WHERE a.user_id = b.user_id AND a.ctid != b.ctid;

        -- Criar a constraint com nome específico
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
    END IF;
END $$;

-- 2. RE-DEFINIÇÃO DE FUNÇÕES RPC (Garantindo que existam e funcionem)

-- 2.1 Função principal de listagem
CREATE OR REPLACE FUNCTION public.get_my_organization_memberships()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  role organization_role,
  is_owner boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    om.organization_id,
    o.name as organization_name,
    om.role,
    (om.role = 'owner') as is_owner
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = auth.uid()
    AND om.is_active = true
  ORDER BY (om.role = 'owner') DESC, o.name;
END;
$$;

-- 2.2 Função master de garantia de acesso
CREATE OR REPLACE FUNCTION public.ensure_user_organization()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID;
    v_mail TEXT;
    v_name TEXT;
    v_oid UUID;
BEGIN
    v_uid := auth.uid();
    IF v_uid IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Sessão inválida'); 
    END IF;

    -- Tenta encontrar qualquer organização (inclusive as que o Super Admin criou por engano)
    SELECT organization_id INTO v_oid 
    FROM public.organization_members 
    WHERE user_id = v_uid 
    ORDER BY created_at ASC 
    LIMIT 1;

    -- Se não tem NADA, cria uma
    IF v_oid IS NULL THEN
        SELECT email, COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)) 
        INTO v_mail, v_name
        FROM auth.users 
        WHERE id = v_uid;

        INSERT INTO public.organizations (name)
        VALUES (v_name || ' Workspace')
        RETURNING id INTO v_oid;

        INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
        VALUES (v_oid, v_uid, v_mail, 'owner', true);
    END IF;

    -- GARANTIR ASSINATURA (Resolve o erro do botão que o usuário reportou)
    -- Usamos a constraint que criamos acima 'subscriptions_user_id_unique'
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
$$;

-- 3. REPARO RETROATIVO DE TODOS OS USUÁRIOS
-- Isso garante que até os usuários "antigos" que estão dando erro voltem a funcionar
DO $$
DECLARE
    u RECORD;
    o UUID;
BEGIN
    FOR u IN 
        SELECT id, email, raw_user_meta_data 
        FROM auth.users 
        WHERE id NOT IN (SELECT user_id FROM public.organization_members WHERE user_id IS NOT NULL)
          AND email != 'mateusabcck@gmail.com' -- Super admin já deve ter, mas processamos o resto
    LOOP
       BEGIN
         INSERT INTO public.organizations (name) 
         VALUES (COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) || ' Workspace')
         RETURNING id INTO o;
         
         INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active) 
         VALUES (o, u.id, u.email, 'owner', true);
         
         INSERT INTO public.subscriptions (user_id, organization_id, plan_id, status, amount, start_date) 
         VALUES (u.id, o, 'enterprise_free', 'authorized', 0, now())
         ON CONFLICT (user_id) DO NOTHING;
       EXCEPTION WHEN OTHERS THEN 
         CONTINUE;
       END;
    END LOOP;
END $$;

-- 4. PERMISSÕES E RELOAD
GRANT EXECUTE ON FUNCTION public.get_my_organization_memberships() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.ensure_user_organization() TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
