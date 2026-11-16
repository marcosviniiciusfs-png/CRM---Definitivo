-- Fase 4 do modo consórcio (docs/superpowers/plans/2026-11-16-kairoz-consorcio.md): comissões.
--
-- - consortium_commission_rules: regra por organização, administradora (NULL = todas) e tipo de bem
--   (NULL = todos). Vale a mais específica: administradora+bem > administradora > bem > padrão.
--   commission_percent: % sobre o crédito que a administradora paga à corretora.
--   installment_percents: como esse total é pago mês a mês (soma = commission_percent; 0 = mês sem pagamento).
--   chargeback: [{until_installment, percent}]. Se a cota cancela até a parcela N (inclusive), a corretora
--   devolve X% do que já recebeu. Vale a primeira faixa (menor N) que cobre a parcela do cancelamento.
--   seller_share_percent: parte do vendedor. seller_tiers: [{min_monthly_production, share_percent}],
--   a maior faixa cujo mínimo é <= produção contada do vendedor no mês; sem faixa, vale seller_share_percent.
-- - consortium_sales.cancel_at_installment: parcela do cliente em que a cota cancelou.
-- - consortium_commission_installments: parcelas da comissão de cada cota (n >= 1) e uma linha de
--   estorno por cota cancelada (n = 0, valores negativos).
--
-- Como as parcelas nascem e mudam (tudo no servidor, idempotente, em consortium_commission_sync):
-- - Quando a cota passa a contar pela regra da organização (adesão: ao registrar; 1ª parcela: ao ficar
--   'ativa'), e ainda não tem parcelas, gera o cronograma com a regra que casa naquele momento.
--   A 1ª parcela vence no mês da data em que a venda conta. A última parcela absorve o arredondamento.
-- - A parcela n da comissão corresponde à parcela n do cliente. Na cota cancelada na parcela k
--   (cancel_at_installment; sem valor, vale 1), as parcelas 'prevista' com n >= k viram 'cancelada';
--   as anteriores continuam a receber. O estorno é recalculado sempre que muda o que já foi recebido.
-- - A parte do vendedor é recalculada (parcelas 'prevista' e 'recebida') sempre que muda a produção
--   do vendedor no mês em que a cota contou, para a faixa refletir o mês inteiro.
-- - Mudar uma regra NÃO regenera parcelas já geradas. Estorno e faixas leem a regra atual.
--   consortium_commission_generate_pending gera parcelas para cotas que contam e ainda não têm.
-- - Mudar o vendedor, o crédito ou a regra da organização depois da geração não muda as parcelas.

-- ------------------------------------------------------------
-- 1. Regras
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  administrator_id uuid REFERENCES public.consortium_administrators(id) ON DELETE CASCADE,
  asset_type text CHECK (asset_type IS NULL OR asset_type IN ('imovel', 'veiculo', 'moto', 'pesados', 'servicos')),
  commission_percent numeric(7,4) NOT NULL CHECK (commission_percent > 0 AND commission_percent <= 100),
  installment_percents numeric[] NOT NULL,
  chargeback jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(chargeback) = 'array'),
  seller_share_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (seller_share_percent BETWEEN 0 AND 100),
  seller_tiers jsonb CHECK (seller_tiers IS NULL OR jsonb_typeof(seller_tiers) = 'array'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS consortium_commission_rules_scope_key
  ON public.consortium_commission_rules (
    organization_id,
    coalesce(administrator_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(asset_type, '')
  );

ALTER TABLE public.consortium_commission_rules ENABLE ROW LEVEL SECURITY;

-- Regras mostram quanto a corretora ganha: só owner/admin.
DROP POLICY IF EXISTS "Admins veem as regras de comissão" ON public.consortium_commission_rules;
CREATE POLICY "Admins veem as regras de comissão"
  ON public.consortium_commission_rules FOR SELECT TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins criam regras de comissão" ON public.consortium_commission_rules;
CREATE POLICY "Admins criam regras de comissão"
  ON public.consortium_commission_rules FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins editam regras de comissão" ON public.consortium_commission_rules;
CREATE POLICY "Admins editam regras de comissão"
  ON public.consortium_commission_rules FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Admins apagam regras de comissão" ON public.consortium_commission_rules;
CREATE POLICY "Admins apagam regras de comissão"
  ON public.consortium_commission_rules FOR DELETE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.consortium_commission_rules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.consortium_commission_rules TO authenticated;

-- Validação: mesma regra de validateCommissionRule em src/lib/consortiumCommission.ts.
CREATE OR REPLACE FUNCTION public.consortium_commission_rules_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_len integer := coalesce(array_length(NEW.installment_percents, 1), 0);
  v_sum numeric := 0;
  v_value numeric;
  v_prev numeric;
  v_entry jsonb;
BEGIN
  IF NEW.administrator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consortium_administrators a
    WHERE a.id = NEW.administrator_id AND a.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'A administradora não pertence a esta organização.' USING ERRCODE = '23514';
  END IF;

  IF v_len < 1 OR v_len > 60 THEN
    RAISE EXCEPTION 'A comissão é paga em 1 a 60 parcelas.' USING ERRCODE = '23514';
  END IF;
  FOREACH v_value IN ARRAY NEW.installment_percents LOOP
    IF v_value IS NULL OR v_value < 0 THEN
      RAISE EXCEPTION 'O percentual de cada parcela não pode ser negativo.' USING ERRCODE = '23514';
    END IF;
    v_sum := v_sum + v_value;
  END LOOP;
  IF abs(v_sum - NEW.commission_percent) > 0.001 THEN
    RAISE EXCEPTION 'A soma das parcelas (%) precisa ser igual à comissão total (%).', v_sum, NEW.commission_percent
      USING ERRCODE = '23514';
  END IF;

  v_prev := 0;
  FOR v_entry IN SELECT e FROM jsonb_array_elements(NEW.chargeback) e
    ORDER BY (e->>'until_installment')::numeric LOOP
    IF jsonb_typeof(v_entry->'until_installment') <> 'number' OR jsonb_typeof(v_entry->'percent') <> 'number'
       OR (v_entry->>'until_installment')::numeric <> trunc((v_entry->>'until_installment')::numeric)
       OR (v_entry->>'until_installment')::numeric < 1 OR (v_entry->>'until_installment')::numeric > 300
       OR (v_entry->>'percent')::numeric < 0 OR (v_entry->>'percent')::numeric > 100 THEN
      RAISE EXCEPTION 'Faixa de estorno inválida: parcela de 1 a 300 e percentual de 0 a 100.' USING ERRCODE = '23514';
    END IF;
    IF (v_entry->>'until_installment')::numeric = v_prev THEN
      RAISE EXCEPTION 'Duas faixas de estorno com a mesma parcela.' USING ERRCODE = '23514';
    END IF;
    v_prev := (v_entry->>'until_installment')::numeric;
  END LOOP;

  IF NEW.seller_tiers IS NOT NULL THEN
    v_prev := -1;
    FOR v_entry IN SELECT e FROM jsonb_array_elements(NEW.seller_tiers) e
      ORDER BY (e->>'min_monthly_production')::numeric LOOP
      IF jsonb_typeof(v_entry->'min_monthly_production') <> 'number' OR jsonb_typeof(v_entry->'share_percent') <> 'number'
         OR (v_entry->>'min_monthly_production')::numeric < 0
         OR (v_entry->>'share_percent')::numeric < 0 OR (v_entry->>'share_percent')::numeric > 100 THEN
        RAISE EXCEPTION 'Faixa do vendedor inválida: produção a partir de 0 e percentual de 0 a 100.' USING ERRCODE = '23514';
      END IF;
      IF (v_entry->>'min_monthly_production')::numeric = v_prev THEN
        RAISE EXCEPTION 'Duas faixas do vendedor com a mesma produção mínima.' USING ERRCODE = '23514';
      END IF;
      v_prev := (v_entry->>'min_monthly_production')::numeric;
    END LOOP;
    IF jsonb_array_length(NEW.seller_tiers) = 0 THEN
      NEW.seller_tiers := NULL;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'Não é possível mudar a organização de uma regra.' USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_commission_rules_before_write ON public.consortium_commission_rules;
CREATE TRIGGER consortium_commission_rules_before_write
  BEFORE INSERT OR UPDATE ON public.consortium_commission_rules
  FOR EACH ROW EXECUTE FUNCTION public.consortium_commission_rules_before_write();

-- Percentual do estorno para a parcela k (0 se nenhuma faixa cobre).
CREATE OR REPLACE FUNCTION public.consortium_commission_chargeback_percent(p_table jsonb, p_installment integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT (e->>'percent')::numeric
    FROM jsonb_array_elements(coalesce(p_table, '[]'::jsonb)) e
    WHERE (e->>'until_installment')::numeric >= p_installment
    ORDER BY (e->>'until_installment')::numeric ASC
    LIMIT 1
  ), 0);
$$;

-- Parte do vendedor para a produção do mês.
CREATE OR REPLACE FUNCTION public.consortium_commission_seller_share(p_base numeric, p_tiers jsonb, p_production numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT (e->>'share_percent')::numeric
    FROM jsonb_array_elements(coalesce(p_tiers, '[]'::jsonb)) e
    WHERE (e->>'min_monthly_production')::numeric <= p_production
    ORDER BY (e->>'min_monthly_production')::numeric DESC
    LIMIT 1
  ), p_base, 0);
$$;

-- ------------------------------------------------------------
-- 2. Parcela do cancelamento na cota
-- ------------------------------------------------------------
ALTER TABLE public.consortium_sales
  ADD COLUMN IF NOT EXISTS cancel_at_installment integer;

ALTER TABLE public.consortium_sales
  DROP CONSTRAINT IF EXISTS consortium_sales_cancel_at_installment_check;
ALTER TABLE public.consortium_sales
  ADD CONSTRAINT consortium_sales_cancel_at_installment_check
  CHECK (cancel_at_installment IS NULL OR cancel_at_installment BETWEEN 1 AND 300);

COMMENT ON COLUMN public.consortium_sales.cancel_at_installment IS
  'Parcela do cliente em que a cota cancelou. Decide o estorno da comissão. Só existe em cota cancelada.';

CREATE OR REPLACE FUNCTION public.consortium_sales_cancel_installment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'cancelada' THEN
    NEW.cancel_at_installment := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_sales_cancel_installment ON public.consortium_sales;
CREATE TRIGGER consortium_sales_cancel_installment
  BEFORE INSERT OR UPDATE ON public.consortium_sales
  FOR EACH ROW EXECUTE FUNCTION public.consortium_sales_cancel_installment();

-- ------------------------------------------------------------
-- 3. Parcelas da comissão
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consortium_commission_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES public.consortium_sales(id) ON DELETE CASCADE,
  seller_user_id uuid,
  administrator_id uuid REFERENCES public.consortium_administrators(id) ON DELETE SET NULL,
  -- Regra que gerou as parcelas. RESTRICT: regra usada não se apaga, se desliga.
  commission_rule_id uuid REFERENCES public.consortium_commission_rules(id) ON DELETE RESTRICT,
  n integer NOT NULL CHECK (n BETWEEN 0 AND 60),
  due_month date NOT NULL CHECK (extract(day FROM due_month) = 1),
  -- Mês em que a cota contou (base da faixa do vendedor).
  production_month date NOT NULL CHECK (extract(day FROM production_month) = 1),
  amount numeric(15,2) NOT NULL,
  seller_share_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (seller_share_percent BETWEEN 0 AND 100),
  seller_amount numeric(15,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'prevista'
    CHECK (status IN ('prevista', 'recebida', 'paga_vendedor', 'cancelada', 'estorno')),
  received_on date,
  paid_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT consortium_commission_installments_sale_n_key UNIQUE (sale_id, n),
  CONSTRAINT consortium_commission_installments_estorno_n CHECK ((status = 'estorno') = (n = 0)),
  CONSTRAINT consortium_commission_installments_sign CHECK (
    CASE WHEN status = 'estorno' THEN amount <= 0 AND seller_amount <= 0 ELSE amount >= 0 AND seller_amount >= 0 END
  )
);

CREATE INDEX IF NOT EXISTS consortium_commission_installments_org_due_idx
  ON public.consortium_commission_installments (organization_id, due_month);
CREATE INDEX IF NOT EXISTS consortium_commission_installments_seller_idx
  ON public.consortium_commission_installments (organization_id, seller_user_id, production_month);

ALTER TABLE public.consortium_commission_installments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins veem as comissões" ON public.consortium_commission_installments;
CREATE POLICY "Admins veem as comissões"
  ON public.consortium_commission_installments FOR SELECT TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id));

DROP POLICY IF EXISTS "Vendedor vê as próprias comissões" ON public.consortium_commission_installments;
CREATE POLICY "Vendedor vê as próprias comissões"
  ON public.consortium_commission_installments FOR SELECT TO authenticated
  USING (seller_user_id = auth.uid() AND public.is_org_member(auth.uid(), organization_id));

-- Admin muda status e datas (o gatilho abaixo bloqueia o resto). Criar e apagar só pelo servidor.
DROP POLICY IF EXISTS "Admins conciliam as comissões" ON public.consortium_commission_installments;
CREATE POLICY "Admins conciliam as comissões"
  ON public.consortium_commission_installments FOR UPDATE TO authenticated
  USING (public.is_org_admin(auth.uid(), organization_id))
  WITH CHECK (public.is_org_admin(auth.uid(), organization_id));

REVOKE ALL ON public.consortium_commission_installments FROM anon;
GRANT SELECT, UPDATE ON public.consortium_commission_installments TO authenticated;

-- Quem chega pela API (authenticated) só muda status e datas. Funções SECURITY DEFINER rodam como dono
-- e passam direto. Datas acompanham o status.
CREATE OR REPLACE FUNCTION public.consortium_commission_installments_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF (NEW.organization_id, NEW.sale_id, NEW.seller_user_id, NEW.administrator_id, NEW.commission_rule_id,
        NEW.n, NEW.due_month, NEW.production_month, NEW.amount, NEW.seller_share_percent, NEW.seller_amount)
       IS DISTINCT FROM
       (OLD.organization_id, OLD.sale_id, OLD.seller_user_id, OLD.administrator_id, OLD.commission_rule_id,
        OLD.n, OLD.due_month, OLD.production_month, OLD.amount, OLD.seller_share_percent, OLD.seller_amount) THEN
      RAISE EXCEPTION 'Só o status e as datas de recebimento e pagamento mudam.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND (
      OLD.status IN ('cancelada', 'estorno') OR NEW.status NOT IN ('prevista', 'recebida', 'paga_vendedor')
    ) THEN
      RAISE EXCEPTION 'Parcelas canceladas e estornos são calculados pelo sistema.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW.status IN ('prevista', 'cancelada') THEN
    NEW.received_on := NULL;
    NEW.paid_on := NULL;
  ELSIF NEW.status = 'recebida' THEN
    NEW.received_on := coalesce(NEW.received_on, v_today);
    NEW.paid_on := NULL;
  ELSIF NEW.status = 'paga_vendedor' THEN
    NEW.paid_on := coalesce(NEW.paid_on, v_today);
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := coalesce(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS consortium_commission_installments_before_update ON public.consortium_commission_installments;
CREATE TRIGGER consortium_commission_installments_before_update
  BEFORE UPDATE ON public.consortium_commission_installments
  FOR EACH ROW EXECUTE FUNCTION public.consortium_commission_installments_before_update();

-- ------------------------------------------------------------
-- 4. Funções internas (sem EXECUTE para a API)
-- ------------------------------------------------------------

-- Regra da organização para quando a venda conta.
CREATE OR REPLACE FUNCTION public.consortium_sale_counts_on(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT consortium_sale_counts_on FROM public.organization_settings WHERE organization_id = p_organization_id),
    'adesao'
  );
$$;

-- Estorno de uma cota: uma linha (n = 0) sobre o que já foi recebido. Some se não houver o que devolver.
CREATE OR REPLACE FUNCTION public.consortium_commission_sync_chargeback(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.consortium_sales%ROWTYPE;
  v_rule public.consortium_commission_rules%ROWTYPE;
  v_rule_id uuid;
  v_production_month date;
  v_pct numeric;
  v_received numeric;
  v_received_seller numeric;
  v_amount numeric(15,2);
  v_seller numeric(15,2);
BEGIN
  SELECT * INTO s FROM public.consortium_sales WHERE id = p_sale_id;
  IF NOT FOUND OR s.status <> 'cancelada' THEN
    DELETE FROM public.consortium_commission_installments WHERE sale_id = p_sale_id AND n = 0;
    RETURN;
  END IF;

  SELECT commission_rule_id, production_month INTO v_rule_id, v_production_month
  FROM public.consortium_commission_installments
  WHERE sale_id = p_sale_id AND n > 0
  ORDER BY n
  LIMIT 1;

  SELECT * INTO v_rule FROM public.consortium_commission_rules WHERE id = v_rule_id;
  IF NOT FOUND THEN
    DELETE FROM public.consortium_commission_installments WHERE sale_id = p_sale_id AND n = 0;
    RETURN;
  END IF;

  v_pct := public.consortium_commission_chargeback_percent(v_rule.chargeback, coalesce(s.cancel_at_installment, 1));

  SELECT coalesce(sum(amount), 0), coalesce(sum(seller_amount), 0)
  INTO v_received, v_received_seller
  FROM public.consortium_commission_installments
  WHERE sale_id = p_sale_id AND n > 0 AND status IN ('recebida', 'paga_vendedor');

  v_amount := round(v_received * v_pct / 100, 2);
  v_seller := round(v_received_seller * v_pct / 100, 2);

  IF v_amount <= 0 THEN
    DELETE FROM public.consortium_commission_installments WHERE sale_id = p_sale_id AND n = 0;
    RETURN;
  END IF;

  INSERT INTO public.consortium_commission_installments (
    organization_id, sale_id, seller_user_id, administrator_id, commission_rule_id,
    n, due_month, production_month, amount, seller_share_percent, seller_amount, status
  ) VALUES (
    s.organization_id, s.id, s.seller_user_id, s.administrator_id, v_rule.id,
    0, date_trunc('month', coalesce(s.cancelled_on, (now() AT TIME ZONE 'America/Sao_Paulo')::date))::date,
    v_production_month, -v_amount,
    CASE WHEN v_received > 0 THEN least(100, round(v_received_seller / v_received * 100, 2)) ELSE 0 END,
    -v_seller, 'estorno'
  )
  ON CONFLICT (sale_id, n) DO UPDATE
    SET amount = EXCLUDED.amount,
        seller_amount = EXCLUDED.seller_amount,
        seller_share_percent = EXCLUDED.seller_share_percent,
        due_month = EXCLUDED.due_month,
        updated_at = now()
    WHERE (consortium_commission_installments.amount, consortium_commission_installments.seller_amount,
           consortium_commission_installments.due_month)
          IS DISTINCT FROM (EXCLUDED.amount, EXCLUDED.seller_amount, EXCLUDED.due_month);
END;
$$;

-- Parte do vendedor nas cotas que contaram no mês, pela produção do mês inteiro.
-- Parcelas já pagas ao vendedor não mudam. Estornos do mês são recalculados.
CREATE OR REPLACE FUNCTION public.consortium_commission_refresh_seller_shares(
  p_organization_id uuid, p_seller_user_id uuid, p_month date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts_on text := public.consortium_sale_counts_on(p_organization_id);
  v_next date := (p_month + interval '1 month')::date;
  v_production numeric;
  v_sale uuid;
BEGIN
  IF p_seller_user_id IS NULL OR p_month IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(s.credit_amount), 0) INTO v_production
  FROM public.consortium_sales s
  WHERE s.organization_id = p_organization_id
    AND s.seller_user_id = p_seller_user_id
    AND CASE
      WHEN v_counts_on = 'primeira_parcela'
        THEN s.status = 'ativa' AND s.first_installment_paid_on >= p_month AND s.first_installment_paid_on < v_next
      ELSE s.status <> 'cancelada' AND s.adhesion_date >= p_month AND s.adhesion_date < v_next
    END;

  UPDATE public.consortium_commission_installments i
  SET seller_share_percent = x.share,
      seller_amount = round(i.amount * x.share / 100, 2),
      updated_at = now()
  FROM (
    SELECT DISTINCT ON (i2.sale_id)
      i2.sale_id,
      public.consortium_commission_seller_share(r.seller_share_percent, r.seller_tiers, v_production) AS share
    FROM public.consortium_commission_installments i2
    JOIN public.consortium_commission_rules r ON r.id = i2.commission_rule_id
    WHERE i2.organization_id = p_organization_id
      AND i2.seller_user_id = p_seller_user_id
      AND i2.production_month = p_month
      AND i2.n > 0
  ) x
  WHERE i.sale_id = x.sale_id
    AND i.n > 0
    AND i.status IN ('prevista', 'recebida')
    AND (i.seller_share_percent IS DISTINCT FROM x.share
         OR i.seller_amount IS DISTINCT FROM round(i.amount * x.share / 100, 2));

  FOR v_sale IN
    SELECT DISTINCT i.sale_id
    FROM public.consortium_commission_installments i
    JOIN public.consortium_sales s ON s.id = i.sale_id
    WHERE i.organization_id = p_organization_id
      AND i.seller_user_id = p_seller_user_id
      AND i.production_month = p_month
      AND s.status = 'cancelada'
  LOOP
    PERFORM public.consortium_commission_sync_chargeback(v_sale);
  END LOOP;
END;
$$;

-- Estado completo das comissões de uma cota. Idempotente: rodar de novo não duplica nada.
CREATE OR REPLACE FUNCTION public.consortium_commission_sync(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.consortium_sales%ROWTYPE;
  r public.consortium_commission_rules%ROWTYPE;
  v_counts_on text;
  v_count_date date;
  v_month date;
  v_total numeric(15,2);
  v_acc numeric(15,2) := 0;
  v_amount numeric(15,2);
  v_len integer;
  v_last integer := 0;
  v_k integer;
  i integer;
BEGIN
  SELECT * INTO s FROM public.consortium_sales WHERE id = p_sale_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_counts_on := public.consortium_sale_counts_on(s.organization_id);
  v_count_date := CASE
    WHEN s.status = 'cancelada' THEN NULL
    WHEN v_counts_on = 'primeira_parcela' THEN CASE WHEN s.status = 'ativa' THEN s.first_installment_paid_on END
    ELSE s.adhesion_date
  END;

  -- 1. Geração (só se ainda não há parcelas)
  IF v_count_date IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.consortium_commission_installments WHERE sale_id = s.id AND n > 0
  ) THEN
    SELECT * INTO r
    FROM public.consortium_commission_rules cr
    WHERE cr.organization_id = s.organization_id
      AND cr.is_active
      AND (cr.administrator_id IS NULL OR cr.administrator_id = s.administrator_id)
      AND (cr.asset_type IS NULL OR cr.asset_type = s.asset_type)
    ORDER BY (cr.administrator_id IS NOT NULL)::int * 2 + (cr.asset_type IS NOT NULL)::int DESC
    LIMIT 1;

    IF FOUND THEN
      v_month := date_trunc('month', v_count_date)::date;
      v_total := round(s.credit_amount * r.commission_percent / 100, 2);
      v_len := coalesce(array_length(r.installment_percents, 1), 0);
      FOR i IN 1..v_len LOOP
        IF r.installment_percents[i] > 0 THEN
          v_last := i;
        END IF;
      END LOOP;

      FOR i IN 1..v_len LOOP
        CONTINUE WHEN r.installment_percents[i] <= 0;
        IF i = v_last THEN
          v_amount := greatest(v_total - v_acc, 0);
        ELSE
          v_amount := round(s.credit_amount * r.installment_percents[i] / 100, 2);
        END IF;
        v_acc := v_acc + v_amount;

        INSERT INTO public.consortium_commission_installments (
          organization_id, sale_id, seller_user_id, administrator_id, commission_rule_id,
          n, due_month, production_month, amount, seller_share_percent, seller_amount, status
        ) VALUES (
          s.organization_id, s.id, s.seller_user_id, s.administrator_id, r.id,
          i, (v_month + make_interval(months => i - 1))::date, v_month, v_amount, 0, 0, 'prevista'
        )
        ON CONFLICT (sale_id, n) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  -- 2. Cancelamento: parcela n da comissão = parcela n do cliente
  IF s.status = 'cancelada' THEN
    v_k := coalesce(s.cancel_at_installment, 1);
    UPDATE public.consortium_commission_installments
    SET status = 'cancelada'
    WHERE sale_id = s.id AND n >= v_k AND status = 'prevista';
    UPDATE public.consortium_commission_installments
    SET status = 'prevista'
    WHERE sale_id = s.id AND n > 0 AND n < v_k AND status = 'cancelada';
  ELSE
    UPDATE public.consortium_commission_installments
    SET status = 'prevista'
    WHERE sale_id = s.id AND status = 'cancelada';
  END IF;

  -- 3. Parte do vendedor no mês em que a cota contou (também recalcula estornos do mês)
  SELECT production_month INTO v_month
  FROM public.consortium_commission_installments
  WHERE sale_id = s.id AND n > 0
  LIMIT 1;
  IF v_month IS NOT NULL AND s.seller_user_id IS NOT NULL THEN
    PERFORM public.consortium_commission_refresh_seller_shares(s.organization_id, s.seller_user_id, v_month);
  END IF;

  -- 4. Estorno
  PERFORM public.consortium_commission_sync_chargeback(s.id);
END;
$$;

REVOKE ALL ON FUNCTION public.consortium_sale_counts_on(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consortium_commission_sync_chargeback(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consortium_commission_refresh_seller_shares(uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consortium_commission_sync(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Gatilhos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consortium_sales_commission_after_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts_on text;
  v_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- As parcelas já saíram em cascata; a produção do vendedor no mês mudou.
    v_counts_on := public.consortium_sale_counts_on(OLD.organization_id);
    v_date := CASE WHEN v_counts_on = 'primeira_parcela' THEN OLD.first_installment_paid_on ELSE OLD.adhesion_date END;
    IF OLD.seller_user_id IS NOT NULL AND v_date IS NOT NULL THEN
      PERFORM public.consortium_commission_refresh_seller_shares(
        OLD.organization_id, OLD.seller_user_id, date_trunc('month', v_date)::date
      );
    END IF;
    RETURN NULL;
  END IF;

  PERFORM public.consortium_commission_sync(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consortium_sales_commission_after_write ON public.consortium_sales;
CREATE TRIGGER consortium_sales_commission_after_write
  AFTER INSERT OR DELETE OR UPDATE OF status, first_installment_paid_on, cancel_at_installment, cancelled_on, adhesion_date
  ON public.consortium_sales
  FOR EACH ROW EXECUTE FUNCTION public.consortium_sales_commission_after_write();

-- Recebido mudou numa cota cancelada: o estorno acompanha.
CREATE OR REPLACE FUNCTION public.consortium_commission_installments_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.consortium_sales WHERE id = NEW.sale_id AND status = 'cancelada') THEN
    PERFORM public.consortium_commission_sync_chargeback(NEW.sale_id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS consortium_commission_installments_after_update ON public.consortium_commission_installments;
CREATE TRIGGER consortium_commission_installments_after_update
  AFTER UPDATE OF status ON public.consortium_commission_installments
  FOR EACH ROW
  WHEN (NEW.n > 0 AND (OLD.status IN ('recebida', 'paga_vendedor')) IS DISTINCT FROM (NEW.status IN ('recebida', 'paga_vendedor')))
  EXECUTE FUNCTION public.consortium_commission_installments_after_update();

-- ------------------------------------------------------------
-- 6. Gerar parcelas para cotas que contam e ainda não têm (ex.: vendidas antes da primeira regra)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consortium_commission_generate_pending(p_organization_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_counts_on text;
  v_sale uuid;
  v_generated integer := 0;
BEGIN
  IF v_user IS NULL OR NOT public.is_org_admin(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização gera comissões.' USING ERRCODE = '42501';
  END IF;

  v_counts_on := public.consortium_sale_counts_on(p_organization_id);

  FOR v_sale IN
    SELECT s.id
    FROM public.consortium_sales s
    WHERE s.organization_id = p_organization_id
      AND CASE WHEN v_counts_on = 'primeira_parcela' THEN s.status = 'ativa' ELSE s.status <> 'cancelada' END
      AND NOT EXISTS (
        SELECT 1 FROM public.consortium_commission_installments i WHERE i.sale_id = s.id AND i.n > 0
      )
  LOOP
    PERFORM public.consortium_commission_sync(v_sale);
    IF EXISTS (SELECT 1 FROM public.consortium_commission_installments i WHERE i.sale_id = v_sale AND i.n > 0) THEN
      v_generated := v_generated + 1;
    END IF;
  END LOOP;

  RETURN v_generated;
END;
$$;

REVOKE ALL ON FUNCTION public.consortium_commission_generate_pending(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consortium_commission_generate_pending(uuid) TO authenticated;
