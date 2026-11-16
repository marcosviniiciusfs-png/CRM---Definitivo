-- Fase 3 do modo consórcio (docs/superpowers/plans/2026-11-16-kairoz-consorcio.md):
-- planos por administradora, proposta por link e avanço do lead para "Proposta enviada".
--
-- - consortium_plans: condições de cada plano (faixa de crédito, prazos, taxa de administração,
--   fundo de reserva, seguro, reajuste, redutor e limites de lance). Membros leem; owner/admin mantém.
-- - consortium_proposals: retrato imutável de uma proposta (Plano A e B com os valores calculados).
--   O token é gerado aqui (64 caracteres hexadecimais, 244 bits aleatórios) e o cliente abre a
--   proposta sem login por view_consortium_proposal(token), que conta as aberturas.
--   Nome da organização, do vendedor, do cliente e o aviso são preenchidos pelo banco.
-- - Ao criar a proposta, o lead vai para a etapa "Proposta enviada" do funil dele, se ela existir
--   depois da etapa atual. Nunca volta etapa e nunca tira o lead de etapa final.

-- ------------------------------------------------------------
-- 0. Apoio
-- ------------------------------------------------------------
-- Nome sem acento, minúsculo e com espaços simples ("Proposta  Enviada" -> "proposta enviada").
CREATE OR REPLACE FUNCTION public.consortium_normalize_name(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    lower(translate(
      btrim(coalesce(p_value, '')),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
    )),
    '\s+', ' ', 'g'
  );
$$;

REVOKE ALL ON FUNCTION public.consortium_normalize_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consortium_normalize_name(text) TO authenticated;

-- Token da proposta: dois UUID v4 sem hífen (gen_random_uuid é do core, sem pgcrypto).
CREATE OR REPLACE FUNCTION public.consortium_new_proposal_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

REVOKE ALL ON FUNCTION public.consortium_new_proposal_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consortium_new_proposal_token() TO authenticated;

-- ------------------------------------------------------------
-- 1. Planos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  administrator_id uuid NOT NULL REFERENCES public.consortium_administrators(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  asset_type text NOT NULL CHECK (asset_type IN ('imovel', 'veiculo', 'moto', 'pesados', 'servicos')),
  credit_min numeric(15,2) NOT NULL CHECK (credit_min > 0),
  credit_max numeric(15,2) NOT NULL,
  terms integer[] NOT NULL,
  admin_fee_percent numeric(6,3) NOT NULL CHECK (admin_fee_percent BETWEEN 0 AND 100),
  reserve_fund_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (reserve_fund_percent BETWEEN 0 AND 100),
  insurance_monthly_percent numeric(7,4) NOT NULL DEFAULT 0 CHECK (insurance_monthly_percent BETWEEN 0 AND 5),
  adjustment_index text NOT NULL DEFAULT 'nenhum'
    CHECK (adjustment_index IN ('INCC', 'IPCA', 'INPC', 'IGP-M', 'nenhum')),
  reduced_installment_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (reduced_installment_percent BETWEEN 0 AND 60),
  max_embedded_bid_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (max_embedded_bid_percent BETWEEN 0 AND 100),
  fixed_bid_percent numeric(5,2) CHECK (fixed_bid_percent IS NULL OR (fixed_bid_percent > 0 AND fixed_bid_percent <= 100)),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT consortium_plans_credit_range CHECK (credit_max >= credit_min),
  CONSTRAINT consortium_plans_terms_valid CHECK (
    cardinality(terms) BETWEEN 1 AND 40
    AND array_position(terms, NULL) IS NULL
    AND 1 <= ALL (terms)
    AND 300 >= ALL (terms)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS consortium_plans_org_admin_name_key
  ON public.consortium_plans (organization_id, administrator_id, asset_type, lower(btrim(name)));
CREATE INDEX IF NOT EXISTS consortium_plans_org_asset_idx
  ON public.consortium_plans (organization_id, asset_type) WHERE is_active;

ALTER TABLE public.consortium_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem os planos" ON public.consortium_plans;
CREATE POLICY "Membros veem os planos"
  ON public.consortium_plans FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins cadastram planos" ON public.consortium_plans;
CREATE POLICY "Admins cadastram planos"
  ON public.consortium_plans FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins editam planos" ON public.consortium_plans;
CREATE POLICY "Admins editam planos"
  ON public.consortium_plans FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins removem planos" ON public.consortium_plans;
CREATE POLICY "Admins removem planos"
  ON public.consortium_plans FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.consortium_plans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consortium_plans TO authenticated;

-- Administradora da mesma organização; prazos sem repetição e em ordem; carimbo de alteração.
CREATE OR REPLACE FUNCTION public.consortium_plans_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.consortium_administrators a
    WHERE a.id = NEW.administrator_id AND a.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'A administradora não pertence a esta organização.' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de um plano.' USING ERRCODE = '23514';
  END IF;

  NEW.name := btrim(NEW.name);
  NEW.terms := ARRAY(SELECT DISTINCT t FROM unnest(NEW.terms) AS t WHERE t IS NOT NULL ORDER BY t);
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_plans_before_write ON public.consortium_plans;
CREATE TRIGGER consortium_plans_before_write
  BEFORE INSERT OR UPDATE ON public.consortium_plans
  FOR EACH ROW EXECUTE FUNCTION public.consortium_plans_before_write();

-- ------------------------------------------------------------
-- 2. Propostas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  token text NOT NULL DEFAULT public.consortium_new_proposal_token()
    CONSTRAINT consortium_proposals_token_key UNIQUE
    CHECK (token ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 60000),
  view_count integer NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE INDEX IF NOT EXISTS consortium_proposals_lead_idx
  ON public.consortium_proposals (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS consortium_proposals_org_created_idx
  ON public.consortium_proposals (organization_id, created_at DESC);

ALTER TABLE public.consortium_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem as propostas" ON public.consortium_proposals;
CREATE POLICY "Membros veem as propostas"
  ON public.consortium_proposals FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- Cria a proposta quem enxerga o lead (o EXISTS roda com a RLS de leads de quem insere).
DROP POLICY IF EXISTS "Quem vê o lead cria a proposta" ON public.consortium_proposals;
CREATE POLICY "Quem vê o lead cria a proposta"
  ON public.consortium_proposals FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  );

-- Sem UPDATE e DELETE para o app: a proposta é um retrato. As aberturas são contadas por
-- view_consortium_proposal, que roda como dono da tabela.
REVOKE ALL ON public.consortium_proposals FROM anon;
GRANT SELECT, INSERT ON public.consortium_proposals TO authenticated;

-- Na criação: token gerado aqui, contadores zerados, validade entre 1 e 180 dias (padrão 30),
-- 1 ou 2 planos, e os nomes e o aviso vindos do banco (ninguém assina por outra corretora).
CREATE OR REPLACE FUNCTION public.consortium_proposals_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_org uuid;
  v_lead_name text;
  v_org_name text;
  v_seller_name text;
  v_plan_count integer;
BEGIN
  SELECT organization_id, nome_lead INTO v_lead_org, v_lead_name
  FROM public.leads WHERE id = NEW.lead_id;

  IF v_lead_org IS NULL OR v_lead_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'O lead não pertence a esta organização.' USING ERRCODE = '23514';
  END IF;

  IF jsonb_typeof(NEW.payload -> 'plans') <> 'array' THEN
    RAISE EXCEPTION 'A proposta precisa de 1 ou 2 planos.' USING ERRCODE = '22023';
  END IF;
  v_plan_count := jsonb_array_length(NEW.payload -> 'plans');
  IF v_plan_count NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'A proposta precisa de 1 ou 2 planos.' USING ERRCODE = '22023';
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = NEW.organization_id;
  IF auth.uid() IS NOT NULL THEN
    SELECT nullif(btrim(full_name), '') INTO v_seller_name
    FROM public.profiles WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;

  NEW.created_by := coalesce(auth.uid(), NEW.created_by);
  NEW.token := public.consortium_new_proposal_token();
  NEW.view_count := 0;
  NEW.first_viewed_at := NULL;
  NEW.last_viewed_at := NULL;
  NEW.created_at := now();
  IF NEW.expires_at IS NULL OR NEW.expires_at <= now() + interval '1 day' OR NEW.expires_at > now() + interval '180 days' THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;

  NEW.payload := NEW.payload || jsonb_build_object(
    'organization', jsonb_build_object('name', v_org_name),
    'seller', jsonb_build_object('name', v_seller_name),
    'client', jsonb_build_object('name', v_lead_name),
    'disclaimer', 'Valores estimados a partir das condições cadastradas pela corretora. As condições finais são as da administradora.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_proposals_before_insert ON public.consortium_proposals;
CREATE TRIGGER consortium_proposals_before_insert
  BEFORE INSERT ON public.consortium_proposals
  FOR EACH ROW EXECUTE FUNCTION public.consortium_proposals_before_insert();

-- Leva o lead para "Proposta enviada" (sem acento e sem diferenciar maiúsculas), se essa etapa
-- vier depois da etapa atual no mesmo funil. Roda com as permissões de quem criou a proposta
-- (SECURITY INVOKER): o UPDATE respeita a RLS de leads, e o trigger leads_record_stage_move
-- grava o histórico. Uma falha aqui não impede a proposta.
CREATE OR REPLACE FUNCTION public.consortium_proposals_advance_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_stage uuid;
  v_current record;
  v_target uuid;
  v_target_position integer;
BEGIN
  BEGIN
    SELECT funnel_stage_id INTO v_current_stage FROM public.leads WHERE id = NEW.lead_id;
    IF v_current_stage IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT funnel_id, position, is_final INTO v_current
    FROM public.funnel_stages WHERE id = v_current_stage;
    IF NOT FOUND OR v_current.is_final THEN
      RETURN NULL;
    END IF;

    SELECT s.id INTO v_target
    FROM public.funnel_stages s
    WHERE s.funnel_id = v_current.funnel_id
      AND NOT s.is_final
      AND s.position > v_current.position
      AND public.consortium_normalize_name(s.name) = 'proposta enviada'
    ORDER BY s.position
    LIMIT 1;
    IF v_target IS NULL THEN
      RETURN NULL;
    END IF;

    SELECT coalesce(max(position), -1) + 1 INTO v_target_position
    FROM public.leads WHERE funnel_stage_id = v_target;

    UPDATE public.leads
       SET funnel_stage_id = v_target,
           position = v_target_position
     WHERE id = NEW.lead_id
       AND funnel_stage_id = v_current_stage;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[proposta] Não foi possível mover o lead % para Proposta enviada: %', NEW.lead_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consortium_proposals_advance_lead ON public.consortium_proposals;
CREATE TRIGGER consortium_proposals_advance_lead
  AFTER INSERT ON public.consortium_proposals
  FOR EACH ROW EXECUTE FUNCTION public.consortium_proposals_advance_lead();

-- ------------------------------------------------------------
-- 3. Abertura pública da proposta
-- ------------------------------------------------------------
-- Devolve só o retrato da proposta (mais criação e validade). Null se o token não existir ou
-- se a proposta venceu. Aberturas feitas por membros da própria organização não contam.
CREATE OR REPLACE FUNCTION public.view_consortium_proposal(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.consortium_proposals%ROWTYPE;
  v_user uuid := auth.uid();
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.consortium_proposals
  WHERE token = p_token AND expires_at > now();
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_user IS NULL OR NOT public.is_org_member(v_user, v_row.organization_id) THEN
    UPDATE public.consortium_proposals
       SET view_count = view_count + 1,
           first_viewed_at = coalesce(first_viewed_at, now()),
           last_viewed_at = now()
     WHERE id = v_row.id;
  END IF;

  RETURN v_row.payload || jsonb_build_object(
    'created_at', v_row.created_at,
    'expires_at', v_row.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.view_consortium_proposal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.view_consortium_proposal(text) TO anon, authenticated;
