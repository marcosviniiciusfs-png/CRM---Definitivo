-- Fase 1 do modo consórcio (docs/superpowers/plans/2026-11-16-kairoz-consorcio.md):
-- qualificação do lead, administradoras, cotas vendidas e a regra de quando a venda conta.
--
-- - organization_settings.consortium_sale_counts_on: 'adesao' (conta na adesão; cancelar estorna)
--   ou 'primeira_parcela' (só conta quando a 1ª parcela é confirmada). Muda por set_consortium_sale_rule.
-- - consortium_administrators: administradoras com que a corretora trabalha. Membros leem; owner/admin mantém.
-- - lead_consortium_profiles: bem, crédito desejado, parcela que cabe, prazo, lance, FGTS e urgência.
--   Quem enxerga o lead (RLS de leads) lê e edita o perfil.
-- - consortium_sales: uma linha por cota vendida. A soma do crédito das cotas não canceladas vira
--   leads.valor, para os relatórios que ainda leem o valor do lead.
-- - consortium_sales_summary(): produção por vendedor no período, aplicando a regra da organização.

-- ------------------------------------------------------------
-- 1. Regra de quando a venda conta
-- ------------------------------------------------------------
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS consortium_sale_counts_on text NOT NULL DEFAULT 'adesao';

ALTER TABLE public.organization_settings
  DROP CONSTRAINT IF EXISTS organization_settings_consortium_sale_counts_on_check;
ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_consortium_sale_counts_on_check
  CHECK (consortium_sale_counts_on IN ('adesao', 'primeira_parcela'));

CREATE OR REPLACE FUNCTION public.set_consortium_sale_rule(p_organization_id uuid, p_rule text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para mudar esta configuração.' USING ERRCODE = '42501';
  END IF;
  IF p_rule IS NULL OR p_rule NOT IN ('adesao', 'primeira_parcela') THEN
    RAISE EXCEPTION 'Regra inválida: %', p_rule USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_org_admin(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização pode mudar a regra.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_settings (organization_id, consortium_sale_counts_on, updated_at, updated_by)
  VALUES (p_organization_id, p_rule, now(), v_user)
  ON CONFLICT (organization_id) DO UPDATE
    SET consortium_sale_counts_on = EXCLUDED.consortium_sale_counts_on,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  RETURN p_rule;
END;
$$;

REVOKE ALL ON FUNCTION public.set_consortium_sale_rule(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_consortium_sale_rule(uuid, text) TO authenticated;

-- ------------------------------------------------------------
-- 2. Administradoras
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_administrators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color text CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);

CREATE UNIQUE INDEX IF NOT EXISTS consortium_administrators_org_name_key
  ON public.consortium_administrators (organization_id, lower(btrim(name)));

ALTER TABLE public.consortium_administrators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem as administradoras" ON public.consortium_administrators;
CREATE POLICY "Membros veem as administradoras"
  ON public.consortium_administrators FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins cadastram administradoras" ON public.consortium_administrators;
CREATE POLICY "Admins cadastram administradoras"
  ON public.consortium_administrators FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins editam administradoras" ON public.consortium_administrators;
CREATE POLICY "Admins editam administradoras"
  ON public.consortium_administrators FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins removem administradoras" ON public.consortium_administrators;
CREATE POLICY "Admins removem administradoras"
  ON public.consortium_administrators FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.consortium_administrators FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consortium_administrators TO authenticated;

-- ------------------------------------------------------------
-- 3. Qualificação do lead
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lead_consortium_profiles (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_type text CHECK (asset_type IS NULL OR asset_type IN ('imovel', 'veiculo', 'moto', 'pesados', 'servicos')),
  desired_credit numeric(15,2) CHECK (desired_credit IS NULL OR desired_credit > 0),
  max_installment numeric(15,2) CHECK (max_installment IS NULL OR max_installment > 0),
  desired_term_months integer CHECK (desired_term_months IS NULL OR desired_term_months BETWEEN 1 AND 300),
  bid_amount numeric(15,2) CHECK (bid_amount IS NULL OR bid_amount >= 0),
  bid_percent numeric(5,2) CHECK (bid_percent IS NULL OR bid_percent BETWEEN 0 AND 100),
  uses_fgts boolean,
  purchase_timeframe text CHECK (purchase_timeframe IS NULL OR purchase_timeframe IN ('imediato', 'ate_3_meses', 'ate_6_meses', 'ate_12_meses', 'sem_pressa')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid()
);

ALTER TABLE public.lead_consortium_profiles ENABLE ROW LEVEL SECURITY;

-- O EXISTS em leads roda com a RLS de leads de quem consulta: só passa quem enxerga o lead.
DROP POLICY IF EXISTS "Quem vê o lead vê a qualificação" ON public.lead_consortium_profiles;
CREATE POLICY "Quem vê o lead vê a qualificação"
  ON public.lead_consortium_profiles FOR SELECT TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  );

DROP POLICY IF EXISTS "Quem vê o lead cria a qualificação" ON public.lead_consortium_profiles;
CREATE POLICY "Quem vê o lead cria a qualificação"
  ON public.lead_consortium_profiles FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  );

DROP POLICY IF EXISTS "Quem vê o lead edita a qualificação" ON public.lead_consortium_profiles;
CREATE POLICY "Quem vê o lead edita a qualificação"
  ON public.lead_consortium_profiles FOR UPDATE TO authenticated
  USING (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  )
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  );

REVOKE ALL ON public.lead_consortium_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.lead_consortium_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.lead_consortium_profiles_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lead_consortium_profiles_touch ON public.lead_consortium_profiles;
CREATE TRIGGER lead_consortium_profiles_touch
  BEFORE INSERT OR UPDATE ON public.lead_consortium_profiles
  FOR EACH ROW EXECUTE FUNCTION public.lead_consortium_profiles_touch();

-- ------------------------------------------------------------
-- 4. Cotas vendidas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  seller_user_id uuid,
  administrator_id uuid REFERENCES public.consortium_administrators(id) ON DELETE SET NULL,
  asset_type text CHECK (asset_type IS NULL OR asset_type IN ('imovel', 'veiculo', 'moto', 'pesados', 'servicos')),
  group_code text CHECK (group_code IS NULL OR char_length(group_code) <= 40),
  quota_number text CHECK (quota_number IS NULL OR char_length(quota_number) <= 40),
  credit_amount numeric(15,2) NOT NULL CHECK (credit_amount > 0),
  term_months integer CHECK (term_months IS NULL OR term_months BETWEEN 1 AND 300),
  installment_amount numeric(15,2) CHECK (installment_amount IS NULL OR installment_amount > 0),
  contract_number text CHECK (contract_number IS NULL OR char_length(contract_number) <= 60),
  adhesion_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  status text NOT NULL DEFAULT 'aguardando_primeira_parcela'
    CHECK (status IN ('aguardando_primeira_parcela', 'ativa', 'cancelada')),
  first_installment_paid_on date,
  cancelled_on date,
  cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT consortium_sales_active_needs_payment CHECK (status <> 'ativa' OR first_installment_paid_on IS NOT NULL),
  CONSTRAINT consortium_sales_cancel_needs_date CHECK (status <> 'cancelada' OR cancelled_on IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS consortium_sales_lead_idx ON public.consortium_sales (lead_id);
CREATE INDEX IF NOT EXISTS consortium_sales_org_adhesion_idx ON public.consortium_sales (organization_id, adhesion_date);
CREATE INDEX IF NOT EXISTS consortium_sales_org_payment_idx ON public.consortium_sales (organization_id, first_installment_paid_on)
  WHERE first_installment_paid_on IS NOT NULL;

ALTER TABLE public.consortium_sales ENABLE ROW LEVEL SECURITY;

-- Toda a equipe lê as cotas da organização (base do ranking e da produção).
DROP POLICY IF EXISTS "Membros veem as cotas" ON public.consortium_sales;
CREATE POLICY "Membros veem as cotas"
  ON public.consortium_sales FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));

-- Registra a cota quem enxerga o lead.
DROP POLICY IF EXISTS "Quem vê o lead registra a cota" ON public.consortium_sales;
CREATE POLICY "Quem vê o lead registra a cota"
  ON public.consortium_sales FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_member(auth.uid(), organization_id)
    AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.organization_id = organization_id)
  );

-- Muda a cota o vendedor, quem registrou ou owner/admin.
DROP POLICY IF EXISTS "Vendedor ou admin muda a cota" ON public.consortium_sales;
CREATE POLICY "Vendedor ou admin muda a cota"
  ON public.consortium_sales FOR UPDATE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), organization_id)
    OR (public.is_org_member(auth.uid(), organization_id) AND (seller_user_id = auth.uid() OR created_by = auth.uid()))
  )
  WITH CHECK (public.is_org_member(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admin apaga a cota" ON public.consortium_sales;
CREATE POLICY "Admin apaga a cota"
  ON public.consortium_sales FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.consortium_sales FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consortium_sales TO authenticated;

-- Consistência: organização da cota = do lead; administradora e vendedor da mesma organização;
-- vendedor padrão = responsável do lead; datas de pagamento e cancelamento coerentes com o status.
CREATE OR REPLACE FUNCTION public.consortium_sales_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_org uuid;
  v_lead_owner uuid;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT organization_id, responsavel_user_id INTO v_lead_org, v_lead_owner
  FROM public.leads WHERE id = NEW.lead_id;

  IF v_lead_org IS NULL OR v_lead_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'O lead não pertence a esta organização.' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.lead_id <> OLD.lead_id OR NEW.organization_id <> OLD.organization_id) THEN
    RAISE EXCEPTION 'Não é possível mudar o lead ou a organização de uma cota.' USING ERRCODE = '23514';
  END IF;

  IF NEW.administrator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consortium_administrators a
    WHERE a.id = NEW.administrator_id AND a.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'A administradora não pertence a esta organização.' USING ERRCODE = '23514';
  END IF;

  IF NEW.seller_user_id IS NULL THEN
    NEW.seller_user_id := v_lead_owner;
  END IF;
  IF NEW.seller_user_id IS NOT NULL AND NOT public.is_org_member(NEW.seller_user_id, NEW.organization_id) THEN
    RAISE EXCEPTION 'O vendedor não faz parte desta organização.' USING ERRCODE = '23514';
  END IF;

  IF NEW.status = 'ativa' AND NEW.first_installment_paid_on IS NULL THEN
    NEW.first_installment_paid_on := v_today;
  END IF;
  IF NEW.status = 'cancelada' AND NEW.cancelled_on IS NULL THEN
    NEW.cancelled_on := v_today;
  END IF;
  IF NEW.status <> 'cancelada' THEN
    NEW.cancelled_on := NULL;
    NEW.cancel_reason := NULL;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  IF TG_OP = 'INSERT' AND NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_sales_before_write ON public.consortium_sales;
CREATE TRIGGER consortium_sales_before_write
  BEFORE INSERT OR UPDATE ON public.consortium_sales
  FOR EACH ROW EXECUTE FUNCTION public.consortium_sales_before_write();

-- leads.valor acompanha a soma do crédito das cotas não canceladas (se houver alguma).
CREATE OR REPLACE FUNCTION public.consortium_sales_sync_lead_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead uuid := coalesce(NEW.lead_id, OLD.lead_id);
  v_total numeric(15,2);
BEGIN
  SELECT sum(credit_amount) INTO v_total
  FROM public.consortium_sales
  WHERE lead_id = v_lead AND status <> 'cancelada';

  IF v_total IS NOT NULL AND v_total > 0 THEN
    UPDATE public.leads SET valor = v_total
    WHERE id = v_lead AND valor IS DISTINCT FROM v_total;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consortium_sales_sync_lead_value ON public.consortium_sales;
CREATE TRIGGER consortium_sales_sync_lead_value
  AFTER INSERT OR UPDATE OR DELETE ON public.consortium_sales
  FOR EACH ROW EXECUTE FUNCTION public.consortium_sales_sync_lead_value();

-- ------------------------------------------------------------
-- 5. Produção por vendedor no período (datas no horário de Brasília)
-- ------------------------------------------------------------
-- Regra 'adesao': conta pela data de adesão, cotas não canceladas.
-- Regra 'primeira_parcela': conta pela data da 1ª parcela, só cotas ativas.
CREATE OR REPLACE FUNCTION public.consortium_sales_summary(p_organization_id uuid, p_from date, p_to date)
RETURNS TABLE (seller_user_id uuid, sales_count integer, credit_total numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH rule AS (
    SELECT coalesce(
      (SELECT consortium_sale_counts_on FROM public.organization_settings WHERE organization_id = p_organization_id),
      'adesao'
    ) AS counts_on
  )
  SELECT s.seller_user_id, count(*)::integer, coalesce(sum(s.credit_amount), 0)
  FROM public.consortium_sales s
  CROSS JOIN rule
  WHERE s.organization_id = p_organization_id
    AND CASE
      WHEN rule.counts_on = 'primeira_parcela'
        THEN s.status = 'ativa' AND s.first_installment_paid_on BETWEEN p_from AND p_to
      ELSE s.status <> 'cancelada' AND s.adhesion_date BETWEEN p_from AND p_to
    END
  GROUP BY s.seller_user_id;
$$;

REVOKE ALL ON FUNCTION public.consortium_sales_summary(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consortium_sales_summary(uuid, date, date) TO authenticated;
