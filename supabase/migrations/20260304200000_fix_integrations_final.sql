
-- ============================================================
-- REPARO FINAL DE INTEGRAÇÕES (FACEBOOK & WHATSAPP)
-- ============================================================

-- 1. GARANTIR TABELAS (Caso tenham sumido ou estejam corrompidas)
CREATE TABLE IF NOT EXISTS public.facebook_integrations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    organization_id uuid REFERENCES public.organizations(id),
    webhook_verified boolean DEFAULT false,
    access_token text,
    page_id text,
    page_name text,
    page_access_token text,
    ad_account_id text,
    ad_accounts jsonb,
    business_id text,
    business_name text,
    selected_form_id text,
    selected_form_name text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.facebook_integration_tokens (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    integration_id uuid UNIQUE REFERENCES public.facebook_integrations(id) ON DELETE CASCADE,
    encrypted_access_token text,
    encrypted_page_access_token text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid REFERENCES auth.users(id),
    organization_id uuid REFERENCES public.organizations(id),
    instance_name text UNIQUE,
    status text DEFAULT 'CREATING',
    qr_code jsonb,
    phone_number text,
    webhook_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    connected_at timestamptz
);

-- 2. LIMPEZA DE FUNÇÕES QUE ESTAVAM DANDO 404
DROP FUNCTION IF EXISTS public.get_facebook_integrations_masked();
DROP FUNCTION IF EXISTS public.get_facebook_tokens_secure(uuid);
DROP FUNCTION IF EXISTS public.update_facebook_tokens_secure(uuid, text, text);

-- 3. RE-CRIAR FUNÇÕES FACEBOOK (Bypass RLS para carregar dados)
CREATE OR REPLACE FUNCTION public.get_facebook_integrations_masked()
RETURNS TABLE (
  id uuid, user_id uuid, organization_id uuid, webhook_verified boolean,
  created_at timestamptz, updated_at timestamptz, expires_at timestamptz,
  selected_form_id text, selected_form_name text, page_id text,
  page_name text, ad_account_id text, ad_accounts jsonb,
  business_id text, business_name text
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT 
    fi.id, fi.user_id, fi.organization_id, fi.webhook_verified,
    fi.created_at, fi.updated_at, fi.expires_at,
    fi.selected_form_id, fi.selected_form_name, fi.page_id,
    fi.page_name, fi.ad_account_id, fi.ad_accounts,
    fi.business_id, fi.business_name
  FROM public.facebook_integrations fi
  WHERE fi.organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.get_facebook_tokens_secure(p_organization_id UUID)
RETURNS TABLE (integration_id UUID, encrypted_access_token TEXT, encrypted_page_access_token TEXT, page_id TEXT, ad_account_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT fi.id, fit.encrypted_access_token, fit.encrypted_page_access_token, fi.page_id, fi.ad_account_id
  FROM public.facebook_integrations fi
  LEFT JOIN public.facebook_integration_tokens fit ON fit.integration_id = fi.id
  WHERE fi.organization_id = p_organization_id
  ORDER BY fi.created_at DESC LIMIT 1;
END; $$;

-- 4. RE-CRIAR FUNÇÃO WHATSAPP (Garante que instâncias do usuário/org sejam carregadas)
CREATE OR REPLACE FUNCTION public.get_my_whatsapp_instances()
RETURNS SETOF public.whatsapp_instances LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.whatsapp_instances 
  WHERE organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid())
  OR user_id = auth.uid();
END; $$;

-- 5. RLS POSITIVA (Garante que o frontend consiga ler as tabelas)
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Access my org facebook" ON public.facebook_integrations;
CREATE POLICY "Access my org facebook" ON public.facebook_integrations FOR ALL 
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Access my org whatsapp" ON public.whatsapp_instances;
CREATE POLICY "Access my org whatsapp" ON public.whatsapp_instances FOR ALL 
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()) OR user_id = auth.uid());

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "View my org members" ON public.organization_members;
CREATE POLICY "View my org members" ON public.organization_members FOR SELECT 
USING (organization_id IN (SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()));

-- 6. PERMISSÕES FINAIS
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;

NOTIFY pgrst, 'reload schema';
