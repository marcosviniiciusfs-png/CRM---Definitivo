-- Remover a política SELECT existente e criar uma nova que restringe ao proprietário do token
DROP POLICY IF EXISTS "Users can view their organization's Google Calendar integration" ON public.google_calendar_integrations;

-- Criar nova política SELECT que permite apenas o proprietário do token ver seus dados
CREATE POLICY "Users can only view their own Google Calendar integrations" 
ON public.google_calendar_integrations 
FOR SELECT 
USING (user_id = auth.uid());