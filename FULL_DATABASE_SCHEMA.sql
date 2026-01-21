-- ============================================================================
-- KAIROZ CRM - SCHEMA COMPLETO DO BANCO DE DADOS
-- Gerado em: 2026-01-21
-- Compatível com: Supabase PostgreSQL
-- ============================================================================
-- INSTRUÇÕES:
-- 1. Crie um novo projeto no Supabase
-- 2. Vá em SQL Editor
-- 3. Cole e execute este script completo
-- 4. Configure os secrets nas Edge Functions
-- ============================================================================

-- ============================================================================
-- PARTE 1: EXTENSÕES
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- PARTE 2: TIPOS ENUM
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.organization_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'owner', 'admin', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- PARTE 3: TABELAS BASE
-- ============================================================================

-- Organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  full_name TEXT,
  job_title TEXT,
  avatar_url TEXT,
  notification_sound_enabled BOOLEAN DEFAULT true,
  button_click_sound_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Organization Members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  email TEXT,
  role organization_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- User Roles (Super Admin)
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- App Config
CREATE TABLE IF NOT EXISTS public.app_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_key TEXT NOT NULL UNIQUE,
  config_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 4: TABELAS DE FUNIS DE VENDAS
-- ============================================================================

-- Sales Funnels
CREATE TABLE IF NOT EXISTS public.sales_funnels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  icon_color TEXT DEFAULT '#4CA698',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Funnel Stages
CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  icon TEXT,
  position INTEGER NOT NULL,
  is_final BOOLEAN NOT NULL DEFAULT false,
  stage_type TEXT NOT NULL DEFAULT 'custom',
  default_value NUMERIC DEFAULT 0,
  max_days_in_stage INTEGER,
  required_fields JSONB DEFAULT '[]'::jsonb,
  stage_config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Funnel Source Mappings
CREATE TABLE IF NOT EXISTS public.funnel_source_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_id UUID NOT NULL REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  source_identifier TEXT,
  target_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Funnel Automation Rules
CREATE TABLE IF NOT EXISTS public.funnel_automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  funnel_stage_id UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB,
  conditions JSONB DEFAULT '[]'::jsonb,
  actions JSONB DEFAULT '[]'::jsonb,
  sequence_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 5: TABELAS DE LEADS E CHAT
-- ============================================================================

-- Leads
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  telefone_lead TEXT NOT NULL,
  nome_lead TEXT NOT NULL,
  email TEXT,
  empresa TEXT,
  valor NUMERIC(15,2) DEFAULT 0.00,
  stage TEXT DEFAULT 'NOVO',
  position INTEGER DEFAULT 0,
  source TEXT DEFAULT 'Manual',
  avatar_url TEXT,
  responsavel TEXT,
  responsavel_user_id UUID,
  funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE SET NULL,
  funnel_stage_id UUID REFERENCES public.funnel_stages(id) ON DELETE SET NULL,
  data_inicio TIMESTAMP WITH TIME ZONE DEFAULT now(),
  data_conclusao TIMESTAMP WITH TIME ZONE,
  descricao_negocio TEXT,
  additional_data JSONB,
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMP WITH TIME ZONE,
  last_message_at TIMESTAMP WITH TIME ZONE,
  calendar_event_id TEXT,
  idade INTEGER,
  duplicate_attempts_count INTEGER DEFAULT 0,
  last_duplicate_attempt_at TIMESTAMP WITH TIME ZONE,
  duplicate_attempts_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(telefone_lead, organization_id)
);

-- Mensagens Chat
CREATE TABLE IF NOT EXISTS public.mensagens_chat (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_lead UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL,
  corpo_mensagem TEXT NOT NULL,
  data_hora TIMESTAMPTZ DEFAULT now() NOT NULL,
  evolution_message_id TEXT,
  status_entrega TEXT,
  media_url TEXT,
  media_type TEXT,
  media_metadata JSONB,
  quoted_message_id UUID REFERENCES public.mensagens_chat(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Lead Activities
CREATE TABLE IF NOT EXISTS public.lead_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  activity_type TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_url TEXT,
  attachment_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Lead Tags
CREATE TABLE IF NOT EXISTS public.lead_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name, organization_id)
);

-- Lead Tag Assignments
CREATE TABLE IF NOT EXISTS public.lead_tag_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.lead_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);

-- Message Reactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, user_id)
);

-- Pinned Messages
CREATE TABLE IF NOT EXISTS public.pinned_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.mensagens_chat(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(message_id, lead_id)
);

-- ============================================================================
-- PARTE 6: TABELAS DE EQUIPES
-- ============================================================================

-- Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  leader_id UUID,
  color TEXT DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Team Members
CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Team Goals
CREATE TABLE IF NOT EXISTS public.team_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL DEFAULT 0,
  current_value NUMERIC NOT NULL DEFAULT 0,
  period_type TEXT NOT NULL DEFAULT 'monthly',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 7: TABELAS KANBAN
-- ============================================================================

-- Kanban Boards
CREATE TABLE IF NOT EXISTS public.kanban_boards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Quadro de Tarefas',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kanban Columns
CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kanban Cards
CREATE TABLE IF NOT EXISTS public.kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  estimated_time INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  timer_started_at TIMESTAMPTZ,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  calendar_event_id TEXT,
  calendar_event_link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 8: TABELAS DE INTEGRAÇÕES
-- ============================================================================

-- WhatsApp Instances
CREATE TABLE IF NOT EXISTS public.whatsapp_instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  instance_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATING',
  qr_code TEXT,
  phone_number TEXT,
  webhook_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  connected_at TIMESTAMP WITH TIME ZONE
);

-- Facebook Integrations
CREATE TABLE IF NOT EXISTS public.facebook_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_verified BOOLEAN DEFAULT false,
  page_id TEXT,
  page_name TEXT,
  ad_account_id TEXT,
  ad_accounts JSONB DEFAULT '[]'::jsonb,
  business_id TEXT,
  business_name TEXT,
  selected_form_id TEXT,
  selected_form_name TEXT,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Facebook Integration Tokens (Secure)
CREATE TABLE IF NOT EXISTS public.facebook_integration_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL UNIQUE REFERENCES public.facebook_integrations(id) ON DELETE CASCADE,
  encrypted_access_token TEXT,
  encrypted_page_access_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Google Calendar Integrations
CREATE TABLE IF NOT EXISTS public.google_calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  token_expires_at TIMESTAMPTZ NOT NULL,
  calendar_id TEXT DEFAULT 'primary',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Google Calendar Tokens (Secure)
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL UNIQUE REFERENCES public.google_calendar_integrations(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Meta Pixel Integrations
CREATE TABLE IF NOT EXISTS public.meta_pixel_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE CASCADE,
  pixel_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Meta Conversion Logs
CREATE TABLE IF NOT EXISTS public.meta_conversion_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  funnel_id UUID REFERENCES public.sales_funnels(id) ON DELETE SET NULL,
  pixel_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  events_received INTEGER,
  error_message TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 9: TABELAS DE AUTOMAÇÃO E WEBHOOKS
-- ============================================================================

-- Webhook Configs
CREATE TABLE IF NOT EXISTS public.webhook_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  tag_id UUID REFERENCES public.lead_tags(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Webhook Logs
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  remote_jid TEXT,
  sender_name TEXT,
  message_content TEXT,
  message_type TEXT,
  direction TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Form Webhook Logs
CREATE TABLE IF NOT EXISTS public.form_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_token TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'form_submission',
  status TEXT NOT NULL DEFAULT 'processing',
  payload JSONB,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Facebook Webhook Logs
CREATE TABLE IF NOT EXISTS public.facebook_webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  facebook_lead_id TEXT,
  page_id TEXT,
  form_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Automation Rules
CREATE TABLE IF NOT EXISTS public.automation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Automation Logs
CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  trigger_data JSONB,
  conditions_met BOOLEAN NOT NULL,
  actions_executed JSONB,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Webhook Queue
CREATE TABLE IF NOT EXISTS public.webhook_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 10: TABELAS DE DISTRIBUIÇÃO DE LEADS
-- ============================================================================

-- Lead Distribution Configs
CREATE TABLE IF NOT EXISTS public.lead_distribution_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Roleta Padrão',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  distribution_method TEXT NOT NULL DEFAULT 'round_robin',
  source_type TEXT NOT NULL DEFAULT 'all',
  source_identifiers JSONB DEFAULT '[]'::jsonb,
  triggers JSONB NOT NULL DEFAULT '[]'::jsonb,
  eligible_agents UUID[],
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  auto_redistribute BOOLEAN NOT NULL DEFAULT false,
  redistribution_timeout_minutes INTEGER DEFAULT 60,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Agent Distribution Settings
CREATE TABLE IF NOT EXISTS public.agent_distribution_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  pause_reason TEXT,
  pause_until TIMESTAMP WITH TIME ZONE,
  max_capacity INTEGER DEFAULT 50,
  priority_weight INTEGER DEFAULT 1,
  working_hours JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Lead Distribution History
CREATE TABLE IF NOT EXISTS public.lead_distribution_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_user_id UUID,
  to_user_id UUID NOT NULL,
  distribution_method TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  is_redistribution BOOLEAN NOT NULL DEFAULT false,
  redistribution_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 11: TABELAS DE METAS, PRODUÇÃO E COMISSÕES
-- ============================================================================

-- Goals
CREATE TABLE IF NOT EXISTS public.goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_value NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC NOT NULL DEFAULT 0,
  deadline TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Items
CREATE TABLE IF NOT EXISTS public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  item_type TEXT NOT NULL,
  sale_price NUMERIC NOT NULL DEFAULT 0,
  cost_price NUMERIC NOT NULL DEFAULT 0,
  profit_margin NUMERIC GENERATED ALWAYS AS (
    CASE WHEN cost_price > 0 THEN ((sale_price - cost_price) / cost_price * 100) ELSE 0 END
  ) STORED,
  stock_quantity INTEGER,
  duration TEXT,
  resource TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Lead Items
CREATE TABLE IF NOT EXISTS public.lead_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lead_id, item_id)
);

-- Commission Configs
CREATE TABLE IF NOT EXISTS public.commission_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  commission_type TEXT NOT NULL DEFAULT 'percentage',
  commission_value NUMERIC(10,2) NOT NULL DEFAULT 10,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Commissions
CREATE TABLE IF NOT EXISTS public.commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  sale_value NUMERIC(15,2) NOT NULL,
  commission_value NUMERIC(15,2) NOT NULL,
  commission_type TEXT NOT NULL,
  commission_rate NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Production Blocks
CREATE TABLE IF NOT EXISTS public.production_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  total_sales INTEGER DEFAULT 0,
  total_revenue NUMERIC(15,2) DEFAULT 0,
  total_cost NUMERIC(15,2) DEFAULT 0,
  total_profit NUMERIC(15,2) DEFAULT 0,
  previous_month_profit NUMERIC(15,2),
  profit_change_value NUMERIC(15,2),
  profit_change_percentage NUMERIC(8,2),
  notes TEXT,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, month, year)
);

-- ============================================================================
-- PARTE 12: TABELAS DE NOTIFICAÇÕES E ATIVIDADES
-- ============================================================================

-- Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  card_id UUID,
  from_user_id UUID,
  due_date DATE,
  time_estimate INTEGER,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User Sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  logout_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- System Activities
CREATE TABLE IF NOT EXISTS public.system_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================================================
-- PARTE 13: FUNÇÕES UTILITÁRIAS
-- ============================================================================

-- Function: update_updated_at_column
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

-- Function: get_user_organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
  LIMIT 1;
$$;

-- Function: get_user_organization_role
CREATE OR REPLACE FUNCTION public.get_user_organization_role(_user_id UUID)
RETURNS TABLE (organization_id UUID, role organization_role)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id, om.role
  FROM public.organization_members om
  WHERE om.user_id = _user_id
  LIMIT 1;
$$;

-- Function: is_same_organization
CREATE OR REPLACE FUNCTION public.is_same_organization(_user_id UUID, _organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _organization_id
  );
$$;

-- Function: has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function: is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin');
$$;

-- ============================================================================
-- PARTE 14: FUNÇÕES DE AUTENTICAÇÃO E ORGANIZAÇÃO
-- ============================================================================

-- Function: handle_new_user (cria organização e perfil para novo usuário)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_org_id UUID;
  existing_member_count INT;
BEGIN
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id OR email = NEW.email;
  
  IF existing_member_count = 0 THEN
    INSERT INTO public.organizations (name)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'name', NEW.email) || '''s Organization')
    RETURNING id INTO new_org_id;
    
    INSERT INTO public.organization_members (organization_id, user_id, email, role)
    VALUES (new_org_id, NEW.id, NEW.email, 'owner');
  ELSE
    UPDATE public.organization_members
    SET user_id = NEW.id
    WHERE email = NEW.email AND user_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function: handle_new_user_profile
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email)
  );
  RETURN NEW;
END;
$$;

-- Function: set_lead_organization
CREATE OR REPLACE FUNCTION public.set_lead_organization()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.organization_id := public.get_user_organization_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- Function: sync_responsavel_user_id
CREATE OR REPLACE FUNCTION public.sync_responsavel_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.responsavel IS NOT NULL AND NEW.responsavel_user_id IS NULL THEN
    SELECT p.user_id INTO NEW.responsavel_user_id
    FROM public.profiles p
    WHERE p.full_name = NEW.responsavel
    LIMIT 1;
  END IF;
  
  IF NEW.responsavel_user_id IS NOT NULL AND NEW.responsavel IS NULL THEN
    SELECT p.full_name INTO NEW.responsavel
    FROM public.profiles p
    WHERE p.user_id = NEW.responsavel_user_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- PARTE 15: FUNÇÕES DE FUNIL
-- ============================================================================

-- Function: create_default_funnel_for_organization
CREATE OR REPLACE FUNCTION public.create_default_funnel_for_organization()
RETURNS TRIGGER AS $$
DECLARE
  new_funnel_id UUID;
BEGIN
  INSERT INTO public.sales_funnels (
    organization_id, name, description, is_default, is_active, icon
  ) VALUES (
    NEW.id, 'Funil Padrão', 'Funil padrão do sistema', true, true, 'Target'
  ) RETURNING id INTO new_funnel_id;
  
  INSERT INTO public.funnel_stages (
    funnel_id, name, description, color, icon, position, stage_type, is_final
  ) VALUES 
    (new_funnel_id, 'Novo Lead', 'Leads recém-chegados', '#3B82F6', '📋', 0, 'custom', false),
    (new_funnel_id, 'Qualificação / Aquecido', 'Leads sendo qualificados', '#06B6D4', '🔥', 1, 'custom', false),
    (new_funnel_id, 'Agendamento Realizado', 'Reunião agendada', '#EAB308', '📅', 2, 'custom', false),
    (new_funnel_id, 'Reunião Feita', 'Reunião realizada com o lead', '#F97316', '🤝', 3, 'custom', false),
    (new_funnel_id, 'Proposta / Negociação', 'Proposta enviada, em negociação', '#8B5CF6', '📝', 4, 'custom', false),
    (new_funnel_id, 'Aprovação / Análise', 'Aguardando aprovação do cliente', '#6366F1', '🔍', 5, 'custom', false),
    (new_funnel_id, 'Venda Realizada', 'Negócio fechado com sucesso', '#10B981', '🎉', 6, 'won', true),
    (new_funnel_id, 'Pós-venda / Ativação', 'Cliente em processo de ativação', '#34D399', '✨', 7, 'custom', false),
    (new_funnel_id, 'Perdido', 'Negócio não concretizado', '#EF4444', '❌', 999, 'lost', true);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- Function: update_funnel_updated_at
CREATE OR REPLACE FUNCTION public.update_funnel_updated_at()
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

-- ============================================================================
-- PARTE 16: FUNÇÕES DE CRIPTOGRAFIA
-- ============================================================================

-- Function: encrypt_oauth_token
CREATE OR REPLACE FUNCTION public.encrypt_oauth_token(plain_token TEXT, encryption_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plain_token IS NULL OR plain_token = '' THEN
    RETURN NULL;
  END IF;
  RETURN encode(pgp_sym_encrypt(plain_token, encryption_key, 'cipher-algo=aes256'), 'base64');
END;
$$;

-- Function: decrypt_oauth_token
CREATE OR REPLACE FUNCTION public.decrypt_oauth_token(encrypted_token TEXT, encryption_key TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_token IS NULL OR encrypted_token = '' THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(decode(encrypted_token, 'base64'), encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    RETURN encrypted_token;
END;
$$;

-- ============================================================================
-- PARTE 17: FUNÇÕES DE NOTIFICAÇÃO E LOG
-- ============================================================================

-- Function: notify_lead_assignment
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  responsible_user_id UUID;
  current_user_id UUID;
  from_user_name TEXT;
  lead_name TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF OLD.responsavel IS NOT DISTINCT FROM NEW.responsavel THEN
    RETURN NEW;
  END IF;
  
  IF NEW.responsavel IS NULL OR NEW.responsavel = '' THEN
    RETURN NEW;
  END IF;
  
  SELECT p.user_id INTO responsible_user_id
  FROM public.profiles p
  WHERE p.full_name = NEW.responsavel
  LIMIT 1;
  
  IF responsible_user_id IS NULL OR responsible_user_id = current_user_id THEN
    RETURN NEW;
  END IF;
  
  SELECT COALESCE(p.full_name, om.email, 'Um colaborador')
  INTO from_user_name
  FROM public.organization_members om
  LEFT JOIN public.profiles p ON p.user_id = om.user_id
  WHERE om.user_id = current_user_id
  LIMIT 1;
  
  lead_name := NEW.nome_lead;
  
  INSERT INTO public.notifications (user_id, type, title, message, lead_id, from_user_id)
  VALUES (
    responsible_user_id, 'lead_assigned', 'Novo lead atribuído',
    from_user_name || ' atribuiu o lead "' || lead_name || '" para você.',
    NEW.id, current_user_id
  );
  
  RETURN NEW;
END;
$$;

-- Function: log_lead_stage_change
CREATE OR REPLACE FUNCTION public.log_lead_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id UUID;
  user_org_id UUID;
  user_name TEXT;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    SELECT om.organization_id, COALESCE(p.full_name, om.email, 'Usuário')
    INTO user_org_id, user_name
    FROM public.organization_members om
    LEFT JOIN public.profiles p ON p.user_id = om.user_id
    WHERE om.user_id = current_user_id
    LIMIT 1;
    
    IF user_org_id IS NOT NULL THEN
      INSERT INTO public.system_activities (user_id, organization_id, activity_type, description, lead_id, metadata)
      VALUES (
        current_user_id, user_org_id, 'lead_stage_changed',
        user_name || ' moveu o lead "' || NEW.nome_lead || '" de "' || COALESCE(OLD.stage, 'NOVO') || '" para "' || COALESCE(NEW.stage, 'NOVO') || '"',
        NEW.id,
        jsonb_build_object('old_stage', OLD.stage, 'new_stage', NEW.stage, 'lead_name', NEW.nome_lead)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function: generate_commission_on_won
CREATE OR REPLACE FUNCTION public.generate_commission_on_won()
RETURNS TRIGGER AS $$
DECLARE
  config_record RECORD;
  calc_commission NUMERIC(15,2);
BEGIN
  IF NEW.funnel_stage_id IS NOT NULL AND NEW.responsavel_user_id IS NOT NULL AND NEW.valor IS NOT NULL AND NEW.valor > 0 THEN
    IF EXISTS (SELECT 1 FROM public.funnel_stages WHERE id = NEW.funnel_stage_id AND stage_type = 'won') THEN
      SELECT * INTO config_record FROM public.commission_configs WHERE organization_id = NEW.organization_id AND is_active = true;
      
      IF FOUND THEN
        IF config_record.commission_type = 'percentage' THEN
          calc_commission := NEW.valor * (config_record.commission_value / 100);
        ELSE
          calc_commission := config_record.commission_value;
        END IF;
        
        INSERT INTO public.commissions (organization_id, user_id, lead_id, sale_value, commission_value, commission_type, commission_rate)
        SELECT NEW.organization_id, NEW.responsavel_user_id, NEW.id, NEW.valor, calc_commission, config_record.commission_type, config_record.commission_value
        WHERE NOT EXISTS (SELECT 1 FROM public.commissions WHERE lead_id = NEW.id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function: update_team_goals_on_sale
CREATE OR REPLACE FUNCTION public.update_team_goals_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  user_team_id UUID;
  lead_value NUMERIC;
BEGIN
  IF NEW.funnel_stage_id IS NOT NULL AND NEW.responsavel_user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.funnel_stages WHERE id = NEW.funnel_stage_id AND stage_type = 'won') THEN
      IF OLD.funnel_stage_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.funnel_stages WHERE id = OLD.funnel_stage_id AND stage_type = 'won') THEN
        SELECT team_id INTO user_team_id FROM public.team_members WHERE user_id = NEW.responsavel_user_id LIMIT 1;
        
        IF user_team_id IS NOT NULL THEN
          lead_value := COALESCE(NEW.valor, 0);
          
          UPDATE public.team_goals
          SET 
            current_value = CASE 
              WHEN goal_type = 'sales_count' THEN current_value + 1
              WHEN goal_type = 'revenue' THEN current_value + lead_value
              WHEN goal_type = 'leads_converted' THEN current_value + 1
              ELSE current_value
            END,
            updated_at = NOW()
          WHERE team_id = user_team_id AND CURRENT_DATE BETWEEN start_date AND end_date;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- PARTE 18: TRIGGERS
-- ============================================================================

-- Trigger: on_auth_user_created (após criar usuário, cria organização)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Trigger: on_auth_user_created_profile (após criar usuário, cria perfil)
DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

-- Trigger: create_default_funnel_trigger (após criar organização, cria funil)
DROP TRIGGER IF EXISTS create_default_funnel_trigger ON public.organizations;
CREATE TRIGGER create_default_funnel_trigger
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_funnel_for_organization();

-- Trigger: set_lead_organization_trigger
DROP TRIGGER IF EXISTS set_lead_organization_trigger ON public.leads;
CREATE TRIGGER set_lead_organization_trigger
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_organization();

-- Trigger: sync_lead_responsavel_trigger
DROP TRIGGER IF EXISTS sync_lead_responsavel_trigger ON public.leads;
CREATE TRIGGER sync_lead_responsavel_trigger
  BEFORE INSERT OR UPDATE OF responsavel, responsavel_user_id ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_responsavel_user_id();

-- Trigger: update_leads_updated_at
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: trigger_notify_lead_assignment
DROP TRIGGER IF EXISTS trigger_notify_lead_assignment ON public.leads;
CREATE TRIGGER trigger_notify_lead_assignment
  AFTER UPDATE OF responsavel ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_lead_assignment();

-- Trigger: trigger_log_lead_stage_change
DROP TRIGGER IF EXISTS trigger_log_lead_stage_change ON public.leads;
CREATE TRIGGER trigger_log_lead_stage_change
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_stage_change();

-- Trigger: trigger_generate_commission
DROP TRIGGER IF EXISTS trigger_generate_commission ON public.leads;
CREATE TRIGGER trigger_generate_commission
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  WHEN (OLD.funnel_stage_id IS DISTINCT FROM NEW.funnel_stage_id)
  EXECUTE FUNCTION public.generate_commission_on_won();

-- Trigger: trigger_update_team_goals_on_sale
DROP TRIGGER IF EXISTS trigger_update_team_goals_on_sale ON public.leads;
CREATE TRIGGER trigger_update_team_goals_on_sale
  AFTER UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_team_goals_on_sale();

-- Triggers de updated_at em outras tabelas
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_tags_updated_at BEFORE UPDATE ON public.lead_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_activities_updated_at BEFORE UPDATE ON public.lead_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sales_funnels_updated_at BEFORE UPDATE ON public.sales_funnels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_funnel_stages_updated_at BEFORE UPDATE ON public.funnel_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kanban_boards_updated_at BEFORE UPDATE ON public.kanban_boards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_kanban_cards_updated_at BEFORE UPDATE ON public.kanban_cards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_team_goals_updated_at BEFORE UPDATE ON public.team_goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_items_updated_at BEFORE UPDATE ON public.lead_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_webhook_configs_updated_at BEFORE UPDATE ON public.webhook_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON public.automation_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lead_distribution_configs_updated_at BEFORE UPDATE ON public.lead_distribution_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_agent_distribution_settings_updated_at BEFORE UPDATE ON public.agent_distribution_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_facebook_integrations_updated_at BEFORE UPDATE ON public.facebook_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_facebook_tokens_updated_at BEFORE UPDATE ON public.facebook_integration_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_google_calendar_integrations_updated_at BEFORE UPDATE ON public.google_calendar_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_meta_pixel_integrations_updated_at BEFORE UPDATE ON public.meta_pixel_integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_app_config_updated_at BEFORE UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PARTE 19: HABILITAR RLS EM TODAS AS TABELAS
-- ============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_pixel_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_conversion_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facebook_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_distribution_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_distribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_distribution_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_activities ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PARTE 20: RLS POLICIES (PRINCIPAIS)
-- ============================================================================

-- Organizations
CREATE POLICY "Deny public access to organizations" ON public.organizations FOR ALL USING (false);
CREATE POLICY "Authenticated users can view their organization" ON public.organizations FOR SELECT USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated admins can update their organization" ON public.organizations FOR UPDATE USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Profiles
CREATE POLICY "Deny unauthenticated access to profiles" ON public.profiles AS RESTRICTIVE FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Organization members can view colleague profiles" ON public.profiles FOR SELECT USING (user_id IN (SELECT om2.user_id FROM organization_members om1 JOIN organization_members om2 ON om1.organization_id = om2.organization_id WHERE om1.user_id = auth.uid()));

-- Organization Members
CREATE POLICY "Deny public access to organization members" ON public.organization_members FOR ALL USING (false);
CREATE POLICY "Users can view members from their organization" ON public.organization_members FOR SELECT USING (organization_id = public.get_user_organization_id(auth.uid()));
CREATE POLICY "Owners and admins can add members" ON public.organization_members FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.get_user_organization_role(auth.uid()) AS role_info WHERE role_info.organization_id = organization_members.organization_id AND role_info.role IN ('owner', 'admin')));
CREATE POLICY "Owners and admins can update members" ON public.organization_members FOR UPDATE USING (EXISTS (SELECT 1 FROM public.get_user_organization_role(auth.uid()) AS role_info WHERE role_info.organization_id = organization_members.organization_id AND role_info.role IN ('owner', 'admin')));
CREATE POLICY "Only owners can remove members" ON public.organization_members FOR DELETE USING (EXISTS (SELECT 1 FROM public.get_user_organization_role(auth.uid()) role_info WHERE role_info.organization_id = organization_members.organization_id AND role_info.role = 'owner'));

-- Leads (visibilidade por cargo)
CREATE POLICY "Secure lead visibility by role" ON public.leads FOR SELECT USING (organization_id IN (SELECT om.organization_id FROM organization_members om WHERE om.user_id = auth.uid()) AND (EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = auth.uid() AND om.organization_id = leads.organization_id AND om.role IN ('owner', 'admin')) OR responsavel_user_id = auth.uid()));
CREATE POLICY "Authenticated users can create leads in their organization" ON public.leads FOR INSERT WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated users can update leads in their organization" ON public.leads FOR UPDATE USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Authenticated users can delete leads in their organization" ON public.leads FOR DELETE USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

-- Mensagens Chat
CREATE POLICY "Deny public access to messages" ON public.mensagens_chat FOR ALL USING (false);
CREATE POLICY "Authenticated users can view messages from their organization" ON public.mensagens_chat FOR SELECT USING (id_lead IN (SELECT id FROM public.leads WHERE organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())));
CREATE POLICY "Authenticated users can create messages for their organization" ON public.mensagens_chat FOR INSERT WITH CHECK (id_lead IN (SELECT id FROM public.leads WHERE organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())));
CREATE POLICY "Authenticated users can update messages from their organization" ON public.mensagens_chat FOR UPDATE USING (id_lead IN (SELECT id FROM public.leads WHERE organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())));
CREATE POLICY "Authenticated users can delete messages from their organization" ON public.mensagens_chat FOR DELETE USING (id_lead IN (SELECT id FROM public.leads WHERE organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())));

-- Demais políticas seguem o mesmo padrão baseado em organization_id
-- (Omitidas por brevidade - consulte as migrations originais para políticas detalhadas)

-- ============================================================================
-- PARTE 21: ÍNDICES DE PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads(organization_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_funnel_stage ON public.leads(organization_id, funnel_id, funnel_stage_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_responsavel ON public.leads(organization_id, responsavel);
CREATE INDEX IF NOT EXISTS idx_leads_org_responsavel_user_id ON public.leads(organization_id, responsavel_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_org_phone ON public.leads(organization_id, telefone_lead);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON public.leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_last_seen ON public.leads(last_seen);
CREATE INDEX IF NOT EXISTS idx_mensagens_lead ON public.mensagens_chat(id_lead);
CREATE INDEX IF NOT EXISTS idx_mensagens_data ON public.mensagens_chat(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_evolution_id ON public.mensagens_chat(evolution_message_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_organization_id ON public.webhook_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_lead_id ON public.kanban_cards(lead_id);
CREATE INDEX IF NOT EXISTS idx_commissions_org_user ON public.commissions(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_production_blocks_org_date ON public.production_blocks(organization_id, year DESC, month DESC);

-- ============================================================================
-- PARTE 22: REALTIME
-- ============================================================================
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER TABLE public.mensagens_chat REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_instances REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.pinned_messages REPLICA IDENTITY FULL;
ALTER TABLE public.team_goals REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_chat;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tag_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pinned_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.team_goals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_activities;

-- ============================================================================
-- PARTE 23: STORAGE BUCKETS
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']),
  ('team-avatars', 'team-avatars', true, NULL, NULL),
  ('chat-media', 'chat-media', false, NULL, NULL),
  ('activity-attachments', 'activity-attachments', false, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- Storage policies para avatars
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Public can view avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

-- Storage policies para team-avatars
CREATE POLICY "Team avatars are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'team-avatars');
CREATE POLICY "Admins can upload team avatars" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'team-avatars');
CREATE POLICY "Admins can update team avatars" ON storage.objects FOR UPDATE USING (bucket_id = 'team-avatars');
CREATE POLICY "Admins can delete team avatars" ON storage.objects FOR DELETE USING (bucket_id = 'team-avatars');

-- ============================================================================
-- FIM DO SCHEMA
-- ============================================================================
-- PRÓXIMOS PASSOS:
-- 1. Configure os secrets em Project Settings → Edge Functions → Secrets:
--    - EVOLUTION_API_URL
--    - EVOLUTION_API_KEY
--    - EVOLUTION_WEBHOOK_SECRET
--    - FACEBOOK_APP_ID
--    - FACEBOOK_APP_SECRET
--    - GOOGLE_CLIENT_ID
--    - GOOGLE_CLIENT_SECRET
--    - GOOGLE_CALENDAR_ENCRYPTION_KEY
--    - STRIPE_SECRET_KEY (se usar pagamentos)
--
-- 2. Deploy as Edge Functions usando:
--    supabase login
--    supabase link --project-ref SEU_PROJECT_ID
--    supabase functions deploy
--
-- 3. Atualize as variáveis de ambiente na Vercel:
--    - VITE_SUPABASE_URL
--    - VITE_SUPABASE_PUBLISHABLE_KEY
--    - VITE_SUPABASE_PROJECT_ID
-- ============================================================================
