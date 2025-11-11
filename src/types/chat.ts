export interface Lead {
  id: string;
  telefone_lead: string;
  nome_lead: string;
  created_at: string;
  updated_at: string;
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
