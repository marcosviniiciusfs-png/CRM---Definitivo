-- Create teams table
CREATE TABLE public.teams (
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

-- Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- Create team_goals table
CREATE TABLE public.team_goals (
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

-- Add team_id to lead_distribution_configs
ALTER TABLE public.lead_distribution_configs 
ADD COLUMN team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for teams
CREATE POLICY "Deny public access to teams" ON public.teams AS RESTRICTIVE FOR ALL USING (false);

CREATE POLICY "Users can view teams from their organization" ON public.teams FOR SELECT 
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins owners can manage teams" ON public.teams FOR ALL 
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- RLS Policies for team_members
CREATE POLICY "Deny public access to team_members" ON public.team_members AS RESTRICTIVE FOR ALL USING (false);

CREATE POLICY "Users can view team members from their organization" ON public.team_members FOR SELECT 
  USING (team_id IN (SELECT id FROM teams WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())));

CREATE POLICY "Admins owners can manage team members" ON public.team_members FOR ALL 
  USING (team_id IN (SELECT id FROM teams WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))))
  WITH CHECK (team_id IN (SELECT id FROM teams WHERE organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))));

-- RLS Policies for team_goals
CREATE POLICY "Deny public access to team_goals" ON public.team_goals AS RESTRICTIVE FOR ALL USING (false);

CREATE POLICY "Users can view team goals from their organization" ON public.team_goals FOR SELECT 
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Admins owners can manage team goals" ON public.team_goals FOR ALL 
  USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
  WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Trigger for updated_at on teams
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on team_goals
CREATE TRIGGER update_team_goals_updated_at
  BEFORE UPDATE ON public.team_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to log team member changes to system_activities
CREATE OR REPLACE FUNCTION public.log_team_member_change()
RETURNS TRIGGER AS $$
DECLARE
  team_name TEXT;
  user_name TEXT;
  activity_desc TEXT;
  org_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT name, organization_id INTO team_name, org_id FROM public.teams WHERE id = COALESCE(NEW.team_id, OLD.team_id);
  SELECT full_name INTO user_name FROM public.profiles WHERE user_id = COALESCE(NEW.user_id, OLD.user_id);
  
  IF TG_OP = 'INSERT' THEN
    activity_desc := COALESCE(user_name, 'Usuário') || ' foi adicionado à equipe "' || COALESCE(team_name, 'Equipe') || '"';
  ELSIF TG_OP = 'DELETE' THEN
    activity_desc := COALESCE(user_name, 'Usuário') || ' foi removido da equipe "' || COALESCE(team_name, 'Equipe') || '"';
  END IF;
  
  IF org_id IS NOT NULL THEN
    INSERT INTO public.system_activities (user_id, organization_id, activity_type, description, metadata)
    VALUES (
      current_user_id,
      org_id,
      'team_member_changed',
      activity_desc,
      jsonb_build_object(
        'team_id', COALESCE(NEW.team_id, OLD.team_id),
        'team_name', team_name,
        'member_user_id', COALESCE(NEW.user_id, OLD.user_id),
        'member_name', user_name,
        'action', TG_OP
      )
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger to log team member changes
CREATE TRIGGER on_team_member_change
  AFTER INSERT OR DELETE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.log_team_member_change();

-- Create storage bucket for team avatars
INSERT INTO storage.buckets (id, name, public) 
VALUES ('team-avatars', 'team-avatars', true)
ON CONFLICT DO NOTHING;

-- Storage policies for team avatars
CREATE POLICY "Team avatars are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'team-avatars');

CREATE POLICY "Admins can upload team avatars" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'team-avatars');

CREATE POLICY "Admins can update team avatars" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'team-avatars');

CREATE POLICY "Admins can delete team avatars" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'team-avatars');