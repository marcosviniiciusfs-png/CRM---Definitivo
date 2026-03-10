-- Remover políticas antigas que podem estar causando problemas
DROP POLICY IF EXISTS "Users can view their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can create their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can update their own instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Users can delete their own instances" ON public.whatsapp_instances;

-- Criar novas políticas mais permissivas
CREATE POLICY "Users can view their own instances"
  ON public.whatsapp_instances
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own instances"
  ON public.whatsapp_instances
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own instances"
  ON public.whatsapp_instances
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own instances"
  ON public.whatsapp_instances
  FOR DELETE
  USING (auth.uid() = user_id);