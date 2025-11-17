-- Criar bucket de armazenamento para mídias do chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Criar políticas de acesso ao bucket
CREATE POLICY "Usuários autenticados podem visualizar mídias do chat"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'chat-media');

CREATE POLICY "Usuários autenticados podem fazer upload de mídias do chat"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Usuários autenticados podem atualizar mídias do chat"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'chat-media');

CREATE POLICY "Usuários autenticados podem deletar mídias do chat"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-media');

-- Permitir acesso anônimo para visualização (útil para compartilhamento)
CREATE POLICY "Acesso público para visualização de mídias"
ON storage.objects FOR SELECT
TO anon
USING (bucket_id = 'chat-media');