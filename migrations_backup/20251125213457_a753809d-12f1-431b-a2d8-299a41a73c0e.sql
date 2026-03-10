-- Adicionar políticas de negação de acesso público para tabelas que ainda não têm

-- Facebook Integrations: negar acesso público explicitamente
CREATE POLICY "Deny public access to facebook integrations"
ON public.facebook_integrations
FOR ALL
TO public
USING (false);

-- Facebook Webhook Logs: negar acesso público explicitamente  
CREATE POLICY "Deny public access to facebook webhook logs"
ON public.facebook_webhook_logs
FOR ALL
TO public
USING (false);

-- Goals: negar acesso público explicitamente
CREATE POLICY "Deny public access to goals"
ON public.goals
FOR ALL
TO public
USING (false);