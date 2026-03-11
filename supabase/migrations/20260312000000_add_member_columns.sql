-- Adiciona colunas faltantes em organization_members
-- is_active, display_name e custom_role_id são necessárias para criação e gestão de colaboradores

DO $$
BEGIN
  -- Coluna is_active: controla se o colaborador está ativo ou inativo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'is_active'
  ) THEN
    ALTER TABLE public.organization_members
      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;
  END IF;

  -- Coluna display_name: armazena o nome do colaborador (especialmente antes de ter account criada)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.organization_members
      ADD COLUMN display_name TEXT;
  END IF;

  -- Coluna custom_role_id: cargo personalizado (FK para organization_custom_roles)
  -- Só adiciona se a tabela organization_custom_roles já existir
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organization_members'
      AND column_name = 'custom_role_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_custom_roles'
  ) THEN
    ALTER TABLE public.organization_members
      ADD COLUMN custom_role_id UUID REFERENCES public.organization_custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
