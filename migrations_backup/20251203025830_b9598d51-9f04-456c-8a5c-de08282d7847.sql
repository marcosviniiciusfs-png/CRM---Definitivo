-- Fix RLS policies for teams table
DROP POLICY IF EXISTS "Deny public access to teams" ON public.teams;

CREATE POLICY "Deny public access to teams" 
ON public.teams 
FOR ALL 
USING (false);

-- Fix RLS policies for team_members table
DROP POLICY IF EXISTS "Deny public access to team_members" ON public.team_members;

CREATE POLICY "Deny public access to team_members" 
ON public.team_members 
FOR ALL 
USING (false);

-- Fix RLS policies for team_goals table
DROP POLICY IF EXISTS "Deny public access to team_goals" ON public.team_goals;

CREATE POLICY "Deny public access to team_goals" 
ON public.team_goals 
FOR ALL 
USING (false);