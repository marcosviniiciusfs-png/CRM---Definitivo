import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting database backup export...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user and get their organization
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('User authentication failed:', userError);
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Check if user is owner or admin
    const { data: memberData, error: memberError } = await supabaseUser
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (memberError || !memberData) {
      console.error('Failed to get member data:', memberError);
      return new Response(
        JSON.stringify({ error: 'Organização não encontrada' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['owner', 'admin'].includes(memberData.role)) {
      console.error('User does not have permission:', memberData.role);
      return new Response(
        JSON.stringify({ error: 'Apenas owners e admins podem exportar backup' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = memberData.organization_id;
    console.log('Organization ID:', organizationId);

    // Use service role client to fetch all data
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Define tables to export with their filters
    const tablesToExport = [
      { name: 'organizations', filter: { column: 'id', value: organizationId } },
      { name: 'organization_members', filter: { column: 'organization_id', value: organizationId } },
      { name: 'profiles', filter: null }, // Will filter by user_ids from organization_members
      { name: 'leads', filter: { column: 'organization_id', value: organizationId } },
      { name: 'mensagens_chat', filter: null }, // Will filter by lead_ids
      { name: 'sales_funnels', filter: { column: 'organization_id', value: organizationId } },
      { name: 'funnel_stages', filter: null }, // Will filter by funnel_ids
      { name: 'funnel_stage_history', filter: null }, // Will filter by lead_ids
      { name: 'lead_tags', filter: { column: 'organization_id', value: organizationId } },
      { name: 'lead_tag_assignments', filter: null }, // Will filter by lead_ids
      { name: 'lead_activities', filter: null }, // Will filter by lead_ids
      { name: 'teams', filter: { column: 'organization_id', value: organizationId } },
      { name: 'team_members', filter: null }, // Will filter by team_ids
      { name: 'team_goals', filter: { column: 'organization_id', value: organizationId } },
      { name: 'kanban_boards', filter: { column: 'organization_id', value: organizationId } },
      { name: 'kanban_columns', filter: null }, // Will filter by board_ids
      { name: 'kanban_cards', filter: null }, // Will filter by column_ids
      { name: 'goals', filter: { column: 'organization_id', value: organizationId } },
      { name: 'notifications', filter: null }, // Will filter by user_ids
      { name: 'whatsapp_instances', filter: { column: 'organization_id', value: organizationId } },
      { name: 'lead_distribution_configs', filter: { column: 'organization_id', value: organizationId } },
      { name: 'lead_distribution_history', filter: { column: 'organization_id', value: organizationId } },
      { name: 'agent_distribution_settings', filter: { column: 'organization_id', value: organizationId } },
      { name: 'automation_rules', filter: { column: 'organization_id', value: organizationId } },
      { name: 'automation_logs', filter: { column: 'organization_id', value: organizationId } },
      { name: 'production_blocks', filter: { column: 'organization_id', value: organizationId } },
      { name: 'system_activities', filter: { column: 'organization_id', value: organizationId } },
      { name: 'items', filter: { column: 'organization_id', value: organizationId } },
      { name: 'lead_items', filter: null }, // Will filter by lead_ids
      { name: 'commissions', filter: { column: 'organization_id', value: organizationId } },
      { name: 'commission_configs', filter: { column: 'organization_id', value: organizationId } },
    ];

    const backup: Record<string, any[]> = {};
    const errors: string[] = [];

    // First, get the direct filtered tables
    console.log('Fetching organization data...');
    
    // Organization
    const { data: orgData } = await supabaseAdmin
      .from('organizations')
      .select('*')
      .eq('id', organizationId);
    backup.organizations = orgData || [];

    // Organization members
    const { data: membersData } = await supabaseAdmin
      .from('organization_members')
      .select('*')
      .eq('organization_id', organizationId);
    backup.organization_members = membersData || [];
    const userIds = (membersData || []).map(m => m.user_id).filter(Boolean);

    // Profiles (filter by user_ids from organization)
    if (userIds.length > 0) {
      const { data: profilesData } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .in('user_id', userIds);
      backup.profiles = profilesData || [];
    } else {
      backup.profiles = [];
    }

    // Leads
    console.log('Fetching leads...');
    const { data: leadsData } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId);
    backup.leads = leadsData || [];
    const leadIds = (leadsData || []).map(l => l.id);

    // Mensagens chat (filter by lead_ids)
    console.log('Fetching messages...');
    if (leadIds.length > 0) {
      const { data: messagesData } = await supabaseAdmin
        .from('mensagens_chat')
        .select('*')
        .in('id_lead', leadIds);
      backup.mensagens_chat = messagesData || [];
    } else {
      backup.mensagens_chat = [];
    }

    // Sales funnels
    console.log('Fetching funnels...');
    const { data: funnelsData } = await supabaseAdmin
      .from('sales_funnels')
      .select('*')
      .eq('organization_id', organizationId);
    backup.sales_funnels = funnelsData || [];
    const funnelIds = (funnelsData || []).map(f => f.id);

    // Funnel stages
    if (funnelIds.length > 0) {
      const { data: stagesData } = await supabaseAdmin
        .from('funnel_stages')
        .select('*')
        .in('funnel_id', funnelIds);
      backup.funnel_stages = stagesData || [];
    } else {
      backup.funnel_stages = [];
    }

    // Funnel stage history
    if (leadIds.length > 0) {
      const { data: historyData } = await supabaseAdmin
        .from('funnel_stage_history')
        .select('*')
        .in('lead_id', leadIds);
      backup.funnel_stage_history = historyData || [];
    } else {
      backup.funnel_stage_history = [];
    }

    // Lead tags
    const { data: tagsData } = await supabaseAdmin
      .from('lead_tags')
      .select('*')
      .eq('organization_id', organizationId);
    backup.lead_tags = tagsData || [];

    // Lead tag assignments
    if (leadIds.length > 0) {
      const { data: tagAssignData } = await supabaseAdmin
        .from('lead_tag_assignments')
        .select('*')
        .in('lead_id', leadIds);
      backup.lead_tag_assignments = tagAssignData || [];
    } else {
      backup.lead_tag_assignments = [];
    }

    // Lead activities
    if (leadIds.length > 0) {
      const { data: activitiesData } = await supabaseAdmin
        .from('lead_activities')
        .select('*')
        .in('lead_id', leadIds);
      backup.lead_activities = activitiesData || [];
    } else {
      backup.lead_activities = [];
    }

    // Teams
    console.log('Fetching teams...');
    const { data: teamsData } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('organization_id', organizationId);
    backup.teams = teamsData || [];
    const teamIds = (teamsData || []).map(t => t.id);

    // Team members
    if (teamIds.length > 0) {
      const { data: teamMembersData } = await supabaseAdmin
        .from('team_members')
        .select('*')
        .in('team_id', teamIds);
      backup.team_members = teamMembersData || [];
    } else {
      backup.team_members = [];
    }

    // Team goals
    const { data: teamGoalsData } = await supabaseAdmin
      .from('team_goals')
      .select('*')
      .eq('organization_id', organizationId);
    backup.team_goals = teamGoalsData || [];

    // Kanban boards
    console.log('Fetching kanban...');
    const { data: boardsData } = await supabaseAdmin
      .from('kanban_boards')
      .select('*')
      .eq('organization_id', organizationId);
    backup.kanban_boards = boardsData || [];
    const boardIds = (boardsData || []).map(b => b.id);

    // Kanban columns
    if (boardIds.length > 0) {
      const { data: columnsData } = await supabaseAdmin
        .from('kanban_columns')
        .select('*')
        .in('board_id', boardIds);
      backup.kanban_columns = columnsData || [];
      const columnIds = (columnsData || []).map(c => c.id);

      // Kanban cards
      if (columnIds.length > 0) {
        const { data: cardsData } = await supabaseAdmin
          .from('kanban_cards')
          .select('*')
          .in('column_id', columnIds);
        backup.kanban_cards = cardsData || [];
      } else {
        backup.kanban_cards = [];
      }
    } else {
      backup.kanban_columns = [];
      backup.kanban_cards = [];
    }

    // Goals
    const { data: goalsData } = await supabaseAdmin
      .from('goals')
      .select('*')
      .eq('organization_id', organizationId);
    backup.goals = goalsData || [];

    // Notifications (for org users)
    if (userIds.length > 0) {
      const { data: notificationsData } = await supabaseAdmin
        .from('notifications')
        .select('*')
        .in('user_id', userIds);
      backup.notifications = notificationsData || [];
    } else {
      backup.notifications = [];
    }

    // WhatsApp instances
    const { data: waInstancesData } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('*')
      .eq('organization_id', organizationId);
    backup.whatsapp_instances = waInstancesData || [];

    // Lead distribution configs
    const { data: distConfigsData } = await supabaseAdmin
      .from('lead_distribution_configs')
      .select('*')
      .eq('organization_id', organizationId);
    backup.lead_distribution_configs = distConfigsData || [];

    // Lead distribution history
    const { data: distHistoryData } = await supabaseAdmin
      .from('lead_distribution_history')
      .select('*')
      .eq('organization_id', organizationId);
    backup.lead_distribution_history = distHistoryData || [];

    // Agent distribution settings
    const { data: agentSettingsData } = await supabaseAdmin
      .from('agent_distribution_settings')
      .select('*')
      .eq('organization_id', organizationId);
    backup.agent_distribution_settings = agentSettingsData || [];

    // Automation rules
    const { data: autoRulesData } = await supabaseAdmin
      .from('automation_rules')
      .select('*')
      .eq('organization_id', organizationId);
    backup.automation_rules = autoRulesData || [];

    // Automation logs
    const { data: autoLogsData } = await supabaseAdmin
      .from('automation_logs')
      .select('*')
      .eq('organization_id', organizationId);
    backup.automation_logs = autoLogsData || [];

    // Production blocks
    const { data: prodBlocksData } = await supabaseAdmin
      .from('production_blocks')
      .select('*')
      .eq('organization_id', organizationId);
    backup.production_blocks = prodBlocksData || [];

    // System activities
    const { data: sysActivitiesData } = await supabaseAdmin
      .from('system_activities')
      .select('*')
      .eq('organization_id', organizationId);
    backup.system_activities = sysActivitiesData || [];

    // Items
    const { data: itemsData } = await supabaseAdmin
      .from('items')
      .select('*')
      .eq('organization_id', organizationId);
    backup.items = itemsData || [];

    // Lead items
    if (leadIds.length > 0) {
      const { data: leadItemsData } = await supabaseAdmin
        .from('lead_items')
        .select('*')
        .in('lead_id', leadIds);
      backup.lead_items = leadItemsData || [];
    } else {
      backup.lead_items = [];
    }

    // Commissions
    const { data: commissionsData } = await supabaseAdmin
      .from('commissions')
      .select('*')
      .eq('organization_id', organizationId);
    backup.commissions = commissionsData || [];

    // Commission configs
    const { data: commConfigsData } = await supabaseAdmin
      .from('commission_configs')
      .select('*')
      .eq('organization_id', organizationId);
    backup.commission_configs = commConfigsData || [];

    // Calculate statistics
    const stats = {
      total_tables: Object.keys(backup).length,
      total_records: Object.values(backup).reduce((sum, arr) => sum + arr.length, 0),
      tables: Object.entries(backup).map(([name, data]) => ({
        name,
        records: data.length
      }))
    };

    console.log('Backup completed successfully. Stats:', stats);

    // Create the final backup object
    const finalBackup = {
      metadata: {
        exported_at: new Date().toISOString(),
        organization_id: organizationId,
        organization_name: backup.organizations[0]?.name || 'Unknown',
        exported_by: user.email,
        version: '1.0',
        statistics: stats
      },
      data: backup
    };

    return new Response(
      JSON.stringify(finalBackup),
      { 
        status: 200, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="backup-${organizationId}-${new Date().toISOString().split('T')[0]}.json"`
        } 
      }
    );

  } catch (error) {
    console.error('Backup export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: 'Erro ao exportar backup', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
