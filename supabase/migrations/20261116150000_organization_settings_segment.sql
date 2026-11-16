-- Modo consórcio por organização (Fase 0 de docs/superpowers/plans/2026-11-16-kairoz-consorcio.md).
--
-- organization_settings: uma linha por organização com configurações do produto.
--   segment: 'generico' (padrão) ou 'consorcio'. No modo consórcio o app troca os termos
--   ("Valor" vira "Crédito"), oferece o funil-modelo de consórcio e esconde o catálogo genérico.
-- Sem linha = genérico. Membros leem; só owner/admin muda, pela função set_organization_segment.

CREATE TABLE IF NOT EXISTS public.organization_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  segment text NOT NULL DEFAULT 'generico' CHECK (segment IN ('generico', 'consorcio')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

COMMENT ON TABLE public.organization_settings IS
  'Configurações de produto por organização. segment liga o modo consórcio.';

ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros veem as configurações da organização" ON public.organization_settings;
CREATE POLICY "Membros veem as configurações da organização"
  ON public.organization_settings FOR SELECT TO authenticated
  USING (public.is_org_member(auth.uid(), organization_id));
-- Sem políticas de escrita: tudo passa por set_organization_segment.

REVOKE ALL ON public.organization_settings FROM anon;
GRANT SELECT ON public.organization_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_segment(p_organization_id uuid, p_segment text)
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

  IF p_segment IS NULL OR p_segment NOT IN ('generico', 'consorcio') THEN
    RAISE EXCEPTION 'Segmento inválido: %', p_segment USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_org_admin(v_user, p_organization_id) THEN
    RAISE EXCEPTION 'Só o dono ou um administrador da organização pode mudar o segmento.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.organization_settings (organization_id, segment, updated_at, updated_by)
  VALUES (p_organization_id, p_segment, now(), v_user)
  ON CONFLICT (organization_id) DO UPDATE
    SET segment = EXCLUDED.segment,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by;

  RETURN p_segment;
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_segment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_segment(uuid, text) TO authenticated;
