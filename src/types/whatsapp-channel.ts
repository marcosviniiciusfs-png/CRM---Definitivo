export interface WhatsAppChannel {
  id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  connected_at: string | null;
}
