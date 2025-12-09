export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      agent_distribution_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_paused: boolean
          max_capacity: number | null
          organization_id: string
          pause_reason: string | null
          pause_until: string | null
          priority_weight: number | null
          updated_at: string
          user_id: string
          working_hours: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_paused?: boolean
          max_capacity?: number | null
          organization_id: string
          pause_reason?: string | null
          pause_until?: string | null
          priority_weight?: number | null
          updated_at?: string
          user_id: string
          working_hours?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_paused?: boolean
          max_capacity?: number | null
          organization_id?: string
          pause_reason?: string | null
          pause_until?: string | null
          priority_weight?: number | null
          updated_at?: string
          user_id?: string
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_distribution_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          config_key: string
          config_value: string
          created_at: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_value: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_value?: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          actions_executed: Json | null
          conditions_met: boolean
          created_at: string
          error_message: string | null
          id: string
          lead_id: string | null
          organization_id: string
          rule_id: string
          status: string
          trigger_data: Json | null
        }
        Insert: {
          actions_executed?: Json | null
          conditions_met: boolean
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          rule_id: string
          status?: string
          trigger_data?: Json | null
        }
        Update: {
          actions_executed?: Json | null
          conditions_met?: boolean
          created_at?: string
          error_message?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          rule_id?: string
          status?: string
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_configs: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          updated_at: string
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          updated_at?: string
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          commission_rate: number
          commission_type: string
          commission_value: number
          created_at: string
          id: string
          lead_id: string | null
          organization_id: string
          paid_at: string | null
          sale_value: number
          status: string
          user_id: string
        }
        Insert: {
          commission_rate: number
          commission_type: string
          commission_value: number
          created_at?: string
          id?: string
          lead_id?: string | null
          organization_id: string
          paid_at?: string | null
          sale_value: number
          status?: string
          user_id: string
        }
        Update: {
          commission_rate?: number
          commission_type?: string
          commission_value?: number
          created_at?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          paid_at?: string | null
          sale_value?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_integrations: {
        Row: {
          access_token: string
          ad_account_id: string | null
          ad_accounts: Json | null
          business_id: string | null
          business_name: string | null
          created_at: string
          expires_at: string | null
          id: string
          organization_id: string
          page_access_token: string | null
          page_id: string | null
          page_name: string | null
          selected_form_id: string | null
          selected_form_name: string | null
          updated_at: string
          user_id: string
          webhook_verified: boolean | null
        }
        Insert: {
          access_token: string
          ad_account_id?: string | null
          ad_accounts?: Json | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id: string
          page_access_token?: string | null
          page_id?: string | null
          page_name?: string | null
          selected_form_id?: string | null
          selected_form_name?: string | null
          updated_at?: string
          user_id: string
          webhook_verified?: boolean | null
        }
        Update: {
          access_token?: string
          ad_account_id?: string | null
          ad_accounts?: Json | null
          business_id?: string | null
          business_name?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          page_access_token?: string | null
          page_id?: string | null
          page_name?: string | null
          selected_form_id?: string | null
          selected_form_name?: string | null
          updated_at?: string
          user_id?: string
          webhook_verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          facebook_lead_id: string | null
          form_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          page_id: string | null
          payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          facebook_lead_id?: string | null
          form_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          page_id?: string | null
          payload?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          facebook_lead_id?: string | null
          form_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          page_id?: string | null
          payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "facebook_webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facebook_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_webhook_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          lead_id: string | null
          organization_id: string
          payload: Json | null
          status: string
          webhook_token: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          organization_id: string
          payload?: Json | null
          status?: string
          webhook_token: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          organization_id?: string
          payload?: Json | null
          status?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_webhook_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_automation_rules: {
        Row: {
          actions: Json | null
          conditions: Json | null
          created_at: string
          funnel_stage_id: string
          id: string
          is_active: boolean
          sequence_order: number | null
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json | null
          conditions?: Json | null
          created_at?: string
          funnel_stage_id: string
          id?: string
          is_active?: boolean
          sequence_order?: number | null
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json | null
          conditions?: Json | null
          created_at?: string
          funnel_stage_id?: string
          id?: string
          is_active?: boolean
          sequence_order?: number | null
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_automation_rules_funnel_stage_id_fkey"
            columns: ["funnel_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_source_mappings: {
        Row: {
          created_at: string
          funnel_id: string
          id: string
          source_identifier: string | null
          source_type: string
          target_stage_id: string
        }
        Insert: {
          created_at?: string
          funnel_id: string
          id?: string
          source_identifier?: string | null
          source_type: string
          target_stage_id: string
        }
        Update: {
          created_at?: string
          funnel_id?: string
          id?: string
          source_identifier?: string | null
          source_type?: string
          target_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_source_mappings_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_source_mappings_target_stage_id_fkey"
            columns: ["target_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stage_history: {
        Row: {
          duration_in_previous_stage: number | null
          from_stage_id: string | null
          funnel_id: string
          id: string
          lead_id: string
          moved_at: string
          moved_by: string | null
          notes: string | null
          to_stage_id: string
        }
        Insert: {
          duration_in_previous_stage?: number | null
          from_stage_id?: string | null
          funnel_id: string
          id?: string
          lead_id: string
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          to_stage_id: string
        }
        Update: {
          duration_in_previous_stage?: number | null
          from_stage_id?: string | null
          funnel_id?: string
          id?: string
          lead_id?: string
          moved_at?: string
          moved_by?: string | null
          notes?: string | null
          to_stage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_history_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funnel_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_stages: {
        Row: {
          color: string
          created_at: string
          default_value: number | null
          description: string | null
          funnel_id: string
          icon: string | null
          id: string
          is_final: boolean
          max_days_in_stage: number | null
          name: string
          position: number
          required_fields: Json | null
          stage_config: Json | null
          stage_type: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          default_value?: number | null
          description?: string | null
          funnel_id: string
          icon?: string | null
          id?: string
          is_final?: boolean
          max_days_in_stage?: number | null
          name: string
          position: number
          required_fields?: Json | null
          stage_config?: Json | null
          stage_type?: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          default_value?: number | null
          description?: string | null
          funnel_id?: string
          icon?: string | null
          id?: string
          is_final?: boolean
          max_days_in_stage?: number | null
          name?: string
          position?: number
          required_fields?: Json | null
          stage_config?: Json | null
          stage_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          current_value: number
          deadline: string | null
          id: string
          organization_id: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          organization_id: string
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_value?: number
          deadline?: string | null
          id?: string
          organization_id?: string
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_integrations: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          refresh_token: string
          token_expires_at: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          refresh_token: string
          token_expires_at: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          created_at: string | null
          encrypted_access_token: string
          encrypted_refresh_token: string
          id: string
          integration_id: string
          token_expires_at: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          encrypted_access_token: string
          encrypted_refresh_token: string
          id?: string
          integration_id: string
          token_expires_at: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          encrypted_access_token?: string
          encrypted_refresh_token?: string
          id?: string
          integration_id?: string
          token_expires_at?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      items: {
        Row: {
          cost_price: number
          created_at: string
          description: string | null
          duration: string | null
          icon: string | null
          id: string
          item_type: string
          name: string
          organization_id: string
          profit_margin: number | null
          resource: string | null
          sale_price: number
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          icon?: string | null
          id?: string
          item_type: string
          name: string
          organization_id: string
          profit_margin?: number | null
          resource?: string | null
          sale_price?: number
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          description?: string | null
          duration?: string | null
          icon?: string | null
          id?: string
          item_type?: string
          name?: string
          organization_id?: string
          profit_margin?: number | null
          resource?: string | null
          sale_price?: number
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_boards: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_boards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_cards: {
        Row: {
          calendar_event_id: string | null
          calendar_event_link: string | null
          column_id: string
          content: string
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          estimated_time: number | null
          id: string
          lead_id: string | null
          position: number
          timer_started_at: string | null
          updated_at: string
        }
        Insert: {
          calendar_event_id?: string | null
          calendar_event_link?: string | null
          column_id: string
          content: string
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          estimated_time?: number | null
          id?: string
          lead_id?: string | null
          position?: number
          timer_started_at?: string | null
          updated_at?: string
        }
        Update: {
          calendar_event_id?: string | null
          calendar_event_link?: string | null
          column_id?: string
          content?: string
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          estimated_time?: number | null
          id?: string
          lead_id?: string | null
          position?: number
          timer_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_cards_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "kanban_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kanban_cards_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      kanban_columns: {
        Row: {
          board_id: string
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "kanban_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "kanban_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          attachment_name: string | null
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          lead_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_type: string
          attachment_name?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_type?: string
          attachment_name?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_distribution_configs: {
        Row: {
          auto_redistribute: boolean
          created_at: string
          description: string | null
          distribution_method: string
          eligible_agents: string[] | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          redistribution_timeout_minutes: number | null
          source_identifiers: Json | null
          source_type: string
          team_id: string | null
          triggers: Json
          updated_at: string
        }
        Insert: {
          auto_redistribute?: boolean
          created_at?: string
          description?: string | null
          distribution_method?: string
          eligible_agents?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id: string
          redistribution_timeout_minutes?: number | null
          source_identifiers?: Json | null
          source_type?: string
          team_id?: string | null
          triggers?: Json
          updated_at?: string
        }
        Update: {
          auto_redistribute?: boolean
          created_at?: string
          description?: string | null
          distribution_method?: string
          eligible_agents?: string[] | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          redistribution_timeout_minutes?: number | null
          source_identifiers?: Json | null
          source_type?: string
          team_id?: string | null
          triggers?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_distribution_configs_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_distribution_history: {
        Row: {
          created_at: string
          distribution_method: string
          from_user_id: string | null
          id: string
          is_redistribution: boolean
          lead_id: string
          organization_id: string
          redistribution_reason: string | null
          to_user_id: string
          trigger_source: string
        }
        Insert: {
          created_at?: string
          distribution_method: string
          from_user_id?: string | null
          id?: string
          is_redistribution?: boolean
          lead_id: string
          organization_id: string
          redistribution_reason?: string | null
          to_user_id: string
          trigger_source: string
        }
        Update: {
          created_at?: string
          distribution_method?: string
          from_user_id?: string | null
          id?: string
          is_redistribution?: boolean
          lead_id?: string
          organization_id?: string
          redistribution_reason?: string | null
          to_user_id?: string
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_distribution_history_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_distribution_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          lead_id: string
          quantity: number
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          lead_id: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          lead_id?: string
          quantity?: number
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tag_assignments: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tag_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          additional_data: Json | null
          avatar_url: string | null
          calendar_event_id: string | null
          created_at: string
          data_conclusao: string | null
          data_inicio: string | null
          descricao_negocio: string | null
          duplicate_attempts_count: number | null
          duplicate_attempts_history: Json | null
          email: string | null
          empresa: string | null
          funnel_id: string | null
          funnel_stage_id: string | null
          id: string
          idade: number | null
          is_online: boolean | null
          last_duplicate_attempt_at: string | null
          last_message_at: string | null
          last_seen: string | null
          nome_lead: string
          organization_id: string | null
          position: number | null
          responsavel: string | null
          responsavel_user_id: string | null
          source: string | null
          stage: string | null
          telefone_lead: string
          updated_at: string
          valor: number | null
        }
        Insert: {
          additional_data?: Json | null
          avatar_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao_negocio?: string | null
          duplicate_attempts_count?: number | null
          duplicate_attempts_history?: Json | null
          email?: string | null
          empresa?: string | null
          funnel_id?: string | null
          funnel_stage_id?: string | null
          id?: string
          idade?: number | null
          is_online?: boolean | null
          last_duplicate_attempt_at?: string | null
          last_message_at?: string | null
          last_seen?: string | null
          nome_lead: string
          organization_id?: string | null
          position?: number | null
          responsavel?: string | null
          responsavel_user_id?: string | null
          source?: string | null
          stage?: string | null
          telefone_lead: string
          updated_at?: string
          valor?: number | null
        }
        Update: {
          additional_data?: Json | null
          avatar_url?: string | null
          calendar_event_id?: string | null
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao_negocio?: string | null
          duplicate_attempts_count?: number | null
          duplicate_attempts_history?: Json | null
          email?: string | null
          empresa?: string | null
          funnel_id?: string | null
          funnel_stage_id?: string | null
          id?: string
          idade?: number | null
          is_online?: boolean | null
          last_duplicate_attempt_at?: string | null
          last_message_at?: string | null
          last_seen?: string | null
          nome_lead?: string
          organization_id?: string | null
          position?: number | null
          responsavel?: string | null
          responsavel_user_id?: string | null
          source?: string | null
          stage?: string | null
          telefone_lead?: string
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_funnel_stage_id_fkey"
            columns: ["funnel_stage_id"]
            isOneToOne: false
            referencedRelation: "funnel_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_chat: {
        Row: {
          corpo_mensagem: string
          created_at: string
          data_hora: string
          direcao: string
          evolution_message_id: string | null
          id: string
          id_lead: string
          media_metadata: Json | null
          media_type: string | null
          media_url: string | null
          quoted_message_id: string | null
          status_entrega: string | null
        }
        Insert: {
          corpo_mensagem: string
          created_at?: string
          data_hora?: string
          direcao: string
          evolution_message_id?: string | null
          id?: string
          id_lead: string
          media_metadata?: Json | null
          media_type?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          status_entrega?: string | null
        }
        Update: {
          corpo_mensagem?: string
          created_at?: string
          data_hora?: string
          direcao?: string
          evolution_message_id?: string | null
          id?: string
          id_lead?: string
          media_metadata?: Json | null
          media_type?: string | null
          media_url?: string | null
          quoted_message_id?: string | null
          status_entrega?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_chat_id_lead_fkey"
            columns: ["id_lead"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagens_chat_quoted_message_id_fkey"
            columns: ["quoted_message_id"]
            isOneToOne: false
            referencedRelation: "mensagens_chat"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mensagens_chat"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_conversion_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_id: string | null
          event_name: string
          events_received: number | null
          funnel_id: string | null
          id: string
          lead_id: string | null
          organization_id: string
          pixel_id: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_name: string
          events_received?: number | null
          funnel_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id: string
          pixel_id: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_id?: string | null
          event_name?: string
          events_received?: number | null
          funnel_id?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string
          pixel_id?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_conversion_logs_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_conversion_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pixel_integrations: {
        Row: {
          access_token: string
          created_at: string
          funnel_id: string | null
          id: string
          is_active: boolean
          organization_id: string
          pixel_id: string
          updated_at: string
        }
        Insert: {
          access_token: string
          created_at?: string
          funnel_id?: string | null
          id?: string
          is_active?: boolean
          organization_id: string
          pixel_id: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          created_at?: string
          funnel_id?: string | null
          id?: string
          is_active?: boolean
          organization_id?: string
          pixel_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_pixel_integrations_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_pixel_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          card_id: string | null
          created_at: string
          due_date: string | null
          from_user_id: string | null
          id: string
          lead_id: string | null
          message: string
          read: boolean
          time_estimate: number | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_id?: string | null
          created_at?: string
          due_date?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string | null
          message: string
          read?: boolean
          time_estimate?: number | null
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_id?: string | null
          created_at?: string
          due_date?: string | null
          from_user_id?: string | null
          id?: string
          lead_id?: string | null
          message?: string
          read?: boolean
          time_estimate?: number | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "kanban_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          email: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      pinned_messages: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message_id: string
          pinned_by: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message_id: string
          pinned_by: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message_id?: string
          pinned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "mensagens_chat"
            referencedColumns: ["id"]
          },
        ]
      }
      production_blocks: {
        Row: {
          created_at: string | null
          id: string
          is_closed: boolean | null
          month: number
          notes: string | null
          organization_id: string
          previous_month_profit: number | null
          profit_change_percentage: number | null
          profit_change_value: number | null
          total_cost: number | null
          total_profit: number | null
          total_revenue: number | null
          total_sales: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          month: number
          notes?: string | null
          organization_id: string
          previous_month_profit?: number | null
          profit_change_percentage?: number | null
          profit_change_value?: number | null
          total_cost?: number | null
          total_profit?: number | null
          total_revenue?: number | null
          total_sales?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_closed?: boolean | null
          month?: number
          notes?: string | null
          organization_id?: string
          previous_month_profit?: number | null
          profit_change_percentage?: number | null
          profit_change_value?: number | null
          total_cost?: number | null
          total_profit?: number | null
          total_revenue?: number | null
          total_sales?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_blocks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          button_click_sound_enabled: boolean | null
          created_at: string
          full_name: string | null
          id: string
          job_title: string | null
          notification_sound_enabled: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          button_click_sound_enabled?: boolean | null
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          notification_sound_enabled?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          button_click_sound_enabled?: boolean | null
          created_at?: string
          full_name?: string | null
          id?: string
          job_title?: string | null
          notification_sound_enabled?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_funnels: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          icon_color: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          icon_color?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_funnels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      system_activities: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          lead_id: string | null
          metadata: Json | null
          organization_id: string
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          organization_id: string
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      team_goals: {
        Row: {
          created_at: string
          current_value: number
          end_date: string
          goal_type: string
          id: string
          organization_id: string
          period_type: string
          start_date: string
          target_value: number
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          end_date: string
          goal_type: string
          id?: string
          organization_id: string
          period_type?: string
          start_date: string
          target_value?: number
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          end_date?: string
          goal_type?: string
          id?: string
          organization_id?: string
          period_type?: string
          start_date?: string
          target_value?: number
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_goals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_goals_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          role: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          role?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          role?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          avatar_url: string | null
          color: string | null
          created_at: string
          description: string | null
          id: string
          leader_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string
          duration_minutes: number | null
          id: string
          login_at: string
          logout_at: string | null
          organization_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          login_at?: string
          logout_at?: string | null
          organization_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          id?: string
          login_at?: string
          logout_at?: string | null
          organization_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_configs: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          tag_id: string | null
          updated_at: string
          webhook_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          tag_id?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          tag_id?: string | null
          updated_at?: string
          webhook_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_configs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_configs_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "lead_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_logs: {
        Row: {
          created_at: string
          direction: string | null
          error_message: string | null
          event_type: string
          id: string
          instance_name: string
          message_content: string | null
          message_type: string | null
          organization_id: string
          payload: Json | null
          remote_jid: string | null
          sender_name: string | null
          status: string
        }
        Insert: {
          created_at?: string
          direction?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          instance_name: string
          message_content?: string | null
          message_type?: string | null
          organization_id: string
          payload?: Json | null
          remote_jid?: string | null
          sender_name?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          direction?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          instance_name?: string
          message_content?: string | null
          message_type?: string | null
          organization_id?: string
          payload?: Json | null
          remote_jid?: string | null
          sender_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_queue: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          id: string
          max_attempts: number
          organization_id: string | null
          payload: Json
          processed_at: string | null
          status: string
          webhook_type: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          organization_id?: string | null
          payload: Json
          processed_at?: string | null
          status?: string
          webhook_type: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          id?: string
          max_attempts?: number
          organization_id?: string | null
          payload?: Json
          processed_at?: string | null
          status?: string
          webhook_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          connected_at: string | null
          created_at: string
          id: string
          instance_name: string
          organization_id: string | null
          phone_number: string | null
          qr_code: string | null
          status: string
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          id?: string
          instance_name: string
          organization_id?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          id?: string
          instance_name?: string
          organization_id?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      google_calendar_integrations_public: {
        Row: {
          calendar_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          organization_id: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          calendar_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      count_main_users: { Args: never; Returns: number }
      decrypt_oauth_token: {
        Args: { encrypted_token: string; encryption_key: string }
        Returns: string
      }
      encrypt_oauth_token: {
        Args: { encryption_key: string; plain_token: string }
        Returns: string
      }
      get_facebook_integrations_masked: {
        Args: never
        Returns: {
          access_token: string
          ad_account_id: string
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          page_access_token: string
          page_id: string
          page_name: string
          selected_form_id: string
          selected_form_name: string
          updated_at: string
          user_id: string
          webhook_verified: boolean
        }[]
      }
      get_google_calendar_integrations_masked: {
        Args: never
        Returns: {
          calendar_id: string
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          token_expires_at: string
          updated_at: string
          user_id: string
        }[]
      }
      get_google_calendar_tokens_for_user: {
        Args: { target_user_id: string }
        Returns: {
          access_token: string
          calendar_id: string
          id: string
          organization_id: string
          refresh_token: string
          token_expires_at: string
          user_id: string
        }[]
      }
      get_google_calendar_tokens_secure: {
        Args: { target_user_id: string }
        Returns: {
          calendar_id: string
          encrypted_access_token: string
          encrypted_refresh_token: string
          integration_id: string
          token_expires_at: string
        }[]
      }
      get_meta_pixel_integrations_masked: {
        Args: never
        Returns: {
          access_token: string
          created_at: string
          funnel_id: string
          id: string
          is_active: boolean
          organization_id: string
          pixel_id: string
          updated_at: string
        }[]
      }
      get_organization_members: {
        Args: { _organization_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          last_sign_in_at: string
          member_id: string
          role: string
          user_id: string
        }[]
      }
      get_organization_members_masked: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }[]
      }
      get_user_details: {
        Args: { _target_user_id: string }
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          email_confirmed_at: string
          full_name: string
          job_title: string
          last_sign_in_at: string
          organization_id: string
          organization_name: string
          user_id: string
          user_role: string
        }[]
      }
      get_user_organization_id: { Args: { _user_id: string }; Returns: string }
      get_user_organization_role: {
        Args: { _user_id: string }
        Returns: {
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
        }[]
      }
      get_webhook_configs_masked: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          tag_id: string
          updated_at: string
          webhook_token: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_same_organization: {
        Args: { _organization_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      list_all_users: {
        Args: never
        Returns: {
          created_at: string
          email: string
          email_confirmed_at: string
          id: string
          last_sign_in_at: string
        }[]
      }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "admin" | "member"
      organization_role: "owner" | "admin" | "member"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "owner", "admin", "member"],
      organization_role: ["owner", "admin", "member"],
    },
  },
} as const
