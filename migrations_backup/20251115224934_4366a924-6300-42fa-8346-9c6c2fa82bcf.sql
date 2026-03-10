-- Remover políticas antigas
DROP POLICY IF EXISTS "Users can view their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can insert their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can update their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can delete their own instances" ON public.whatsapp_instances;

-- Criar políticas que permitam acesso baseado em organização
-- Permitir que membros da organização vejam as instâncias da sua organização
CREATE POLICY "Organization members can view instances"
  ON public.whatsapp_instances
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id 
      FROM public.organization_members 
      WHERE user_id = auth.uid()
    )
  );

-- Apenas o dono da instância pode criar
CREATE POLICY "Users can insert their own instances"
  ON public.whatsapp_instances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Apenas o dono da instância pode atualizar
CREATE POLICY "Users can update their own instances"
  ON public.whatsapp_instances
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Apenas o dono da instância pode deletar
CREATE POLICY "Users can delete their own instances"
  ON public.whatsapp_instances
  FOR DELETE
  USING (auth.uid() = user_id);