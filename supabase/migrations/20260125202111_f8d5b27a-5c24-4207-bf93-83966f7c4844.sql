-- =============================================
-- SISTEMA DE CARGOS PERSONALIZADOS
-- =============================================

-- Tabela para armazenar cargos personalizados com permissões granulares
CREATE TABLE public.organization_custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',
  
  -- Permissões de Kanban/Tarefas
  can_view_kanban BOOLEAN DEFAULT true,
  can_create_tasks BOOLEAN DEFAULT false,
  can_edit_own_tasks BOOLEAN DEFAULT true,
  can_edit_all_tasks BOOLEAN DEFAULT false,
  can_delete_tasks BOOLEAN DEFAULT false,
  
  -- Permissões de Leads
  can_view_all_leads BOOLEAN DEFAULT false,
  can_view_assigned_leads BOOLEAN DEFAULT true,
  can_create_leads BOOLEAN DEFAULT false,
  can_edit_leads BOOLEAN DEFAULT false,
  can_delete_leads BOOLEAN DEFAULT false,
  can_assign_leads BOOLEAN DEFAULT false,
  
  -- Permissões de Pipeline
  can_view_pipeline BOOLEAN DEFAULT true,
  can_move_leads_pipeline BOOLEAN DEFAULT false,
  
  -- Permissões de Chat
  can_view_chat BOOLEAN DEFAULT true,
  can_send_messages BOOLEAN DEFAULT true,
  can_view_all_conversations BOOLEAN DEFAULT false,
  
  -- Permissões Administrativas
  can_manage_collaborators BOOLEAN DEFAULT false,
  can_manage_integrations BOOLEAN DEFAULT false,
  can_manage_tags BOOLEAN DEFAULT false,
  can_manage_automations BOOLEAN DEFAULT false,
  can_view_reports BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id, name)
);

-- Adicionar coluna de cargo personalizado em organization_members
ALTER TABLE public.organization_members 
ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES public.organization_custom_roles(id) ON DELETE SET NULL;

-- Habilitar RLS
ALTER TABLE public.organization_custom_roles ENABLE ROW LEVEL SECURITY;

-- Política: Bloquear acesso anônimo
CREATE POLICY "Deny public access to custom roles"
ON public.organization_custom_roles
FOR ALL
TO anon
USING (false);

-- Política: Usuários autenticados podem ver cargos da sua organização
CREATE POLICY "Users can view custom roles in their org"
ON public.organization_custom_roles
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Política: Apenas owners podem criar cargos
CREATE POLICY "Only owners can create custom roles"
ON public.organization_custom_roles
FOR INSERT
TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Política: Apenas owners podem atualizar cargos
CREATE POLICY "Only owners can update custom roles"
ON public.organization_custom_roles
FOR UPDATE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Política: Apenas owners podem deletar cargos
CREATE POLICY "Only owners can delete custom roles"
ON public.organization_custom_roles
FOR DELETE
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid() AND role = 'owner'
  )
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_custom_roles_updated_at
BEFORE UPDATE ON public.organization_custom_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários para documentação
COMMENT ON TABLE public.organization_custom_roles IS 'Cargos personalizados com permissões granulares para membros da organização';
COMMENT ON COLUMN public.organization_members.custom_role_id IS 'Cargo personalizado atribuído ao membro. Se NULL, usa permissões padrão do role base (owner/admin/member)';