export interface Lead {
  id: string;
  telefone_lead: string;
  nome_lead: string;
  created_at: string;
  updated_at: string;
  organization_id?: string | null;
  last_message_at?: string;
  source?: string;
  stage?: string;
  email?: string;
  empresa?: string;
  valor?: number;
  position?: number;
  avatar_url?: string;
  responsavel?: string;
  responsavel_user_id?: string | null;
  descricao_negocio?: string;
  data_inicio?: string | null;
  data_conclusao?: string | null;
  data_agendamento_venda?: string | null;
  idade?: number | null;
  is_online?: boolean | null;
  last_seen?: string | null;
  funnel_id?: string | null;
  funnel_stage_id?: string | null;
  additional_data?: any;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface PinnedMessage {
  id: string;
  message_id: string;
  lead_id: string;
  pinned_by: string;
  created_at: string;
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
  media_url?: string | null;
  media_type?: string | null;
  media_metadata?: any;
  // Campos para envio otimista
  isOptimistic?: boolean;
  sendError?: boolean;
  errorMessage?: string;
  reactions?: MessageReaction[];
  isPinned?: boolean;
  // Campos para reply/quote
  quoted_message_id?: string | null;
  quoted_message?: {
    corpo_mensagem: string;
    direcao: 'ENTRADA' | 'SAIDA';
    media_type?: string | null;
  } | null;
}

export interface Broadcast {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  message_text: string;
  status: 'draft' | 'sending' | 'completed' | 'cancelled';
  total_contacts: number;
  sent_count: number;
  error_count: number;
  delay_seconds: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BroadcastContact {
  id: string;
  broadcast_id: string;
  lead_id: string;
  phone: string;
  name: string;
  status: 'pending' | 'sent' | 'error' | 'skipped';
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}
