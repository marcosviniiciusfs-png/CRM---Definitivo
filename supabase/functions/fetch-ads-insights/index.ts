import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AdsInsightsParams {
  organization_id: string;
  start_date: string;
  end_date: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Parse request body
    const { organization_id, start_date, end_date }: AdsInsightsParams = await req.json();

    if (!organization_id || !start_date || !end_date) {
      throw new Error('Missing required parameters: organization_id, start_date, end_date');
    }

    console.log(`Fetching ads insights for org ${organization_id} from ${start_date} to ${end_date}`);

    // Get Facebook integration with ad_account_id
    const { data: integration, error: integrationError } = await supabase
      .from('facebook_integrations')
      .select('access_token, ad_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (integrationError || !integration) {
      console.error('Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook integration not found', data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!integration.ad_account_id) {
      console.log('No ad account configured');
      return new Response(
        JSON.stringify({ error: 'No ad account configured', data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const { access_token, ad_account_id } = integration;

    // Fetch insights from Meta Marketing API
    const insightsFields = [
      'campaign_name',
      'reach',
      'impressions',
      'spend',
      'clicks',
      'cpc',
      'cpm',
      'ctr',
      'actions',
      'cost_per_action_type'
    ].join(',');

    const timeRange = JSON.stringify({ since: start_date, until: end_date });

    // Fetch campaign-level insights with daily breakdown
    const insightsUrl = `https://graph.facebook.com/v18.0/${ad_account_id}/insights?` +
      `fields=${insightsFields}` +
      `&level=campaign` +
      `&time_range=${encodeURIComponent(timeRange)}` +
      `&time_increment=1` +
      `&access_token=${access_token}`;

    console.log('Fetching insights from Meta API...');
    const insightsResponse = await fetch(insightsUrl);
    const insightsData = await insightsResponse.json();

    if (insightsData.error) {
      console.error('Meta API error:', insightsData.error);
      return new Response(
        JSON.stringify({ error: insightsData.error.message, data: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Received ${insightsData.data?.length || 0} insight records`);

    // Process insights data
    let totalSpend = 0;
    let totalReach = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalLeads = 0;
    let totalLeadCost = 0;

    const dailyData: Record<string, { date: string; spend: number; leads: number; cpl: number }> = {};
    const campaignData: Record<string, { name: string; spend: number; leads: number; reach: number; clicks: number }> = {};

    if (insightsData.data) {
      for (const record of insightsData.data) {
        const spend = parseFloat(record.spend || '0');
        const reach = parseInt(record.reach || '0', 10);
        const impressions = parseInt(record.impressions || '0', 10);
        const clicks = parseInt(record.clicks || '0', 10);

        totalSpend += spend;
        totalReach += reach;
        totalImpressions += impressions;
        totalClicks += clicks;

        // Extract lead actions
        let leads = 0;
        let leadCost = 0;
        
        if (record.actions) {
          const leadAction = record.actions.find((a: any) => 
            a.action_type === 'lead' || a.action_type === 'leadgen_grouped'
          );
          if (leadAction) {
            leads = parseInt(leadAction.value || '0', 10);
          }
        }

        if (record.cost_per_action_type) {
          const leadCostAction = record.cost_per_action_type.find((a: any) => 
            a.action_type === 'lead' || a.action_type === 'leadgen_grouped'
          );
          if (leadCostAction) {
            leadCost = parseFloat(leadCostAction.value || '0');
          }
        }

        totalLeads += leads;
        totalLeadCost += leadCost * leads;

        // Aggregate by date
        const dateStart = record.date_start;
        if (dateStart) {
          if (!dailyData[dateStart]) {
            dailyData[dateStart] = { date: dateStart, spend: 0, leads: 0, cpl: 0 };
          }
          dailyData[dateStart].spend += spend;
          dailyData[dateStart].leads += leads;
        }

        // Aggregate by campaign
        const campaignName = record.campaign_name || 'Unknown';
        if (!campaignData[campaignName]) {
          campaignData[campaignName] = { name: campaignName, spend: 0, leads: 0, reach: 0, clicks: 0 };
        }
        campaignData[campaignName].spend += spend;
        campaignData[campaignName].leads += leads;
        campaignData[campaignName].reach += reach;
        campaignData[campaignName].clicks += clicks;
      }
    }

    // Calculate averages
    const avgCPL = totalLeads > 0 ? totalSpend / totalLeads : 0;
    const avgCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

    // Format daily data with CPL calculation
    const chartData = Object.values(dailyData)
      .map(d => ({
        ...d,
        cpl: d.leads > 0 ? d.spend / d.leads : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Format campaign breakdown with CPL
    const campaignBreakdown = Object.values(campaignData)
      .map(c => ({
        ...c,
        cpl: c.leads > 0 ? c.spend / c.leads : 0,
        ctr: c.reach > 0 ? (c.clicks / c.reach) * 100 : 0
      }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);

    const result = {
      totalSpend,
      totalReach,
      totalImpressions,
      totalClicks,
      totalLeads,
      avgCPL,
      avgCPC,
      avgCTR,
      chartData,
      campaignBreakdown
    };

    console.log('Processed ads insights successfully');

    return new Response(
      JSON.stringify({ data: result, error: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error fetching ads insights:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, data: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
