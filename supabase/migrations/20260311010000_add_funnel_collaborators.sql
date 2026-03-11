-- Adiciona suporte a permissões de acesso por colaborador em funis
-- Um funil pode ser "restrito" (is_restricted = true), nesse caso apenas
-- colaboradores listados em funnel_collaborators podem visualizá-lo/acessá-lo.
-- Owners e Admins sempre têm acesso, independentemente de configuração.

-- 1. Adiciona coluna is_restricted na tabela sales_funnels
ALTER TABLE public.sales_funnels
  ADD COLUMN IF NOT EXISTS is_restricted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Cria tabela funnel_collaborators (whitelist de acesso por usuário)
CREATE TABLE IF NOT EXISTS public.funnel_collaborators (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id       UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(funnel_id, user_id)
);

-- 3. Habilita RLS
ALTER TABLE public.funnel_collaborators ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS

-- Membros da organização podem ler registros de acesso
CREATE POLICY "funnel_collaborators_select"
  ON public.funnel_collaborators
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
    )
  );

-- Apenas owners/admins podem inserir
CREATE POLICY "funnel_collaborators_insert"
  ON public.funnel_collaborators
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Apenas owners/admins podem atualizar
CREATE POLICY "funnel_collaborators_update"
  ON public.funnel_collaborators
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- Apenas owners/admins podem deletar
CREATE POLICY "funnel_collaborators_delete"
  ON public.funnel_collaborators
  FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.organization_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'admin')
    )
  );

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS funnel_collaborators_funnel_id_idx
  ON public.funnel_collaborators(funnel_id);

CREATE INDEX IF NOT EXISTS funnel_collaborators_user_id_idx
  ON public.funnel_collaborators(user_id);

CREATE INDEX IF NOT EXISTS funnel_collaborators_org_id_idx
  ON public.funnel_collaborators(organization_id);
