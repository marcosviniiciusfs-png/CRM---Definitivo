export interface WhatsAppChannel {
  id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  connected_at: string | null;
  accepts_leads?: boolean | null;
  lead_alerts_enabled?: boolean | null;
  lead_alert_group_id?: string | null;
  lead_alert_last_sent_at?: string | null;
  lead_alert_source_filters?: string[] | null;
  lead_alert_interest_rules?: LeadAlertInterestRule[] | null;
}

// type alias (not interface) so it stays assignable to the generated Supabase Json type.
export type LeadAlertInterestRule = {
  interest: string;
  keywords: string[];
};
