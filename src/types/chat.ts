export interface Lead {
  id: string;
  telefone_lead: string;
  nome_lead: string;
  created_at: string;
  updated_at: string;
  last_message_at?: string;
  source?: string;
  stage?: string;
  email?: string;
  empresa?: string;
  valor?: number;
  position?: number;
}

export interface Message {
  id: string;
  id_lead: string;
  direcao: 'ENTRADA' | 'SAIDA';
  corpo_mensagem: string;
  data_hora: string;
  evolution_message_id: string | null;
  status_entrega: 'SENT' | 'DELIVERED' | 'READ' | null;
  created_at: string;
}
