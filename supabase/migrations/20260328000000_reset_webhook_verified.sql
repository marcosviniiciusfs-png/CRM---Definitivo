-- Reset webhook_verified para forçar nova assinatura de webhook no Meta
-- Contexto: leads do Facebook não chegam. Resetar webhook_verified para que
-- o frontend dispare subscribePageWebhook na próxima vez que o usuário
-- abrir "Gerenciar Formulários" ou clicar no botão "Reativar Webhook".
UPDATE public.facebook_integrations
SET webhook_verified = false
WHERE webhook_verified = true;

NOTIFY pgrst, 'reload schema';
