-- Remover a política RESTRICTIVE que está bloqueando todo o acesso à tabela
DROP POLICY IF EXISTS "Deny public access to google calendar integrations" ON google_calendar_integrations;