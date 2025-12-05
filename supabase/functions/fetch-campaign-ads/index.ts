import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchCampaignAdsParams {
  organization_id: string;
  campaign_id?: string;
  campaign_name?: string;
}

interface CampaignAd {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  creative: {
    id: string;
    name?: string;
    thumbnail_url?: string;
    image_url?: string;
    body?: string;
    title?: string;
    call_to_action_type?: string;
  } | null;
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

    const { organization_id, campaign_id, campaign_name }: FetchCampaignAdsParams = await req.json();

    if (!organization_id) {
      throw new Error('Missing required parameter: organization_id');
    }

    if (!campaign_id && !campaign_name) {
      throw new Error('Missing required parameter: campaign_id or campaign_name');
    }

    console.log(`Fetching ads for campaign: ${campaign_id || campaign_name} in org ${organization_id}`);

    // Get Facebook integration
    const { data: integration, error: integrationError } = await supabase
      .from('facebook_integrations')
      .select('access_token, ad_account_id')
      .eq('organization_id', organization_id)
      .single();

    if (integrationError || !integration) {
      console.error('Integration not found:', integrationError);
      return new Response(
        JSON.stringify({ error: 'Facebook integration not found', ads: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const { access_token, ad_account_id } = integration;

    if (!ad_account_id) {
      return new Response(
        JSON.stringify({ error: 'No ad account configured', ads: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    let targetCampaignId = campaign_id;

    // If no campaign_id, search by name
    if (!targetCampaignId && campaign_name) {
      console.log(`Searching for campaign by name: ${campaign_name}`);
      
      const campaignsUrl = `https://graph.facebook.com/v18.0/${ad_account_id}/campaigns?` +
        `fields=id,name` +
        `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: campaign_name }]))}` +
        `&access_token=${access_token}`;

      const campaignsResponse = await fetch(campaignsUrl);
      const campaignsData = await campaignsResponse.json();

      if (campaignsData.error) {
        console.error('Error searching campaigns:', campaignsData.error);
        return new Response(
          JSON.stringify({ error: campaignsData.error.message, ads: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // Find exact match or closest match
      const matchedCampaign = campaignsData.data?.find((c: any) => c.name === campaign_name) ||
                              campaignsData.data?.[0];

      if (!matchedCampaign) {
        console.log('No campaign found with name:', campaign_name);
        return new Response(
          JSON.stringify({ error: 'Campaign not found', ads: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      targetCampaignId = matchedCampaign.id;
      console.log(`Found campaign ID: ${targetCampaignId}`);
    }

    // Fetch ads for the campaign with creative details
    const adsFields = [
      'id',
      'name',
      'status',
      'effective_status',
      'creative{id,name,thumbnail_url,image_url,body,title,call_to_action_type}'
    ].join(',');

    const adsUrl = `https://graph.facebook.com/v18.0/${targetCampaignId}/ads?` +
      `fields=${adsFields}` +
      `&access_token=${access_token}`;

    console.log('Fetching ads from Meta API...');
    const adsResponse = await fetch(adsUrl);
    const adsData = await adsResponse.json();

    if (adsData.error) {
      console.error('Meta API error:', adsData.error);
      return new Response(
        JSON.stringify({ error: adsData.error.message, ads: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log(`Received ${adsData.data?.length || 0} ads`);

    // Process ads data
    const ads: CampaignAd[] = (adsData.data || []).map((ad: any) => ({
      id: ad.id,
      name: ad.name || 'Unnamed Ad',
      status: ad.status,
      effective_status: ad.effective_status,
      creative: ad.creative ? {
        id: ad.creative.id,
        name: ad.creative.name,
        thumbnail_url: ad.creative.thumbnail_url,
        image_url: ad.creative.image_url,
        body: ad.creative.body,
        title: ad.creative.title,
        call_to_action_type: ad.creative.call_to_action_type
      } : null
    }));

    // Log ad details for debugging
    ads.forEach(ad => {
      console.log(`Ad: ${ad.name}, Status: ${ad.effective_status}, Has thumbnail: ${!!ad.creative?.thumbnail_url}`);
    });

    return new Response(
      JSON.stringify({ ads, campaign_id: targetCampaignId, error: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error fetching campaign ads:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage, ads: [] }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
