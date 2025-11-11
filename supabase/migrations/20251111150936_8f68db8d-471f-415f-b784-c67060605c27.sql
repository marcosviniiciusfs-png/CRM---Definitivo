-- Criar tabela de leads
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone_lead TEXT NOT NULL UNIQUE,
  nome_lead TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Criar tabela de mensagens do chat
CREATE TABLE public.mensagens_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_lead UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('ENTRADA', 'SAIDA')),
  corpo_mensagem TEXT NOT NULL,
  data_hora TIMESTAMPTZ DEFAULT now() NOT NULL,
  evolution_message_id TEXT,
  status_entrega TEXT CHECK (status_entrega IN ('SENT', 'DELIVERED', 'READ')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Criar índices para melhor performance
CREATE INDEX idx_mensagens_lead ON public.mensagens_chat(id_lead);
CREATE INDEX idx_mensagens_data ON public.mensagens_chat(data_hora DESC);
CREATE INDEX idx_mensagens_evolution_id ON public.mensagens_chat(evolution_message_id);

-- Habilitar RLS nas tabelas
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para leads (acesso total para usuários autenticados)
CREATE POLICY "Usuários autenticados podem ver todos os leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar leads"
  ON public.leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar leads"
  ON public.leads FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para mensagens (acesso total para usuários autenticados)
CREATE POLICY "Usuários autenticados podem ver todas as mensagens"
  ON public.mensagens_chat FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar mensagens"
  ON public.mensagens_chat FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar mensagens"
  ON public.mensagens_chat FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem deletar mensagens"
  ON public.mensagens_chat FOR DELETE
  TO authenticated
  USING (true);

-- Função para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger para atualizar updated_at na tabela leads
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();