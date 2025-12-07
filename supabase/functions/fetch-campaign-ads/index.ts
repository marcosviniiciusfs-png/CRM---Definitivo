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

interface VideoDetails {
  source?: string;
  picture?: string;
  permalink_url?: string;
  length?: number;
  title?: string;
  description?: string;
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
    video_id?: string;
    video_source_url?: string;
    video_thumbnail_url?: string;
    video_permalink_url?: string;
    video_length?: number;
    object_type?: string;
  } | null;
}

async function fetchVideoDetails(videoId: string, accessToken: string): Promise<VideoDetails | null> {
  try {
    const videoUrl = `https://graph.facebook.com/v18.0/${videoId}?fields=source,picture,permalink_url,length,title,description&access_token=${accessToken}`;
    const response = await fetch(videoUrl);
    const data = await response.json();
    
    if (data.error) {
      console.error(`Error fetching video ${videoId}:`, data.error);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching video ${videoId}:`, error);
    return null;
  }
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

    // Fetch ads for the campaign with expanded creative details including video
    const adsFields = [
      'id',
      'name',
      'status',
      'effective_status',
      'creative{id,name,thumbnail_url,image_url,body,title,call_to_action_type,video_id,object_type,effective_object_story_id}'
    ].join(',');

    // Use ad account endpoint with campaign.id filter (more reliable than campaign/ads endpoint)
    const adsUrl = `https://graph.facebook.com/v18.0/${ad_account_id}/ads?` +
      `fields=${adsFields}` +
      `&filtering=${encodeURIComponent(JSON.stringify([{ field: 'campaign.id', operator: 'EQUAL', value: targetCampaignId }]))}` +
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

    // Process ads data and fetch video details where needed
    const ads: CampaignAd[] = await Promise.all((adsData.data || []).map(async (ad: any) => {
      const creative = ad.creative || null;
      let videoDetails: VideoDetails | null = null;
      
      // If creative has a video_id, fetch video details
      if (creative?.video_id) {
        console.log(`Fetching video details for video_id: ${creative.video_id}`);
        videoDetails = await fetchVideoDetails(creative.video_id, access_token);
      }
      
      return {
        id: ad.id,
        name: ad.name || 'Unnamed Ad',
        status: ad.status,
        effective_status: ad.effective_status,
        creative: creative ? {
          id: creative.id,
          name: creative.name,
          thumbnail_url: creative.thumbnail_url || videoDetails?.picture,
          image_url: creative.image_url,
          body: creative.body,
          title: creative.title,
          call_to_action_type: creative.call_to_action_type,
          video_id: creative.video_id,
          video_source_url: videoDetails?.source,
          video_thumbnail_url: videoDetails?.picture,
          video_permalink_url: videoDetails?.permalink_url,
          video_length: videoDetails?.length,
          object_type: creative.object_type
        } : null
      };
    }));

    // Log ad details for debugging
    ads.forEach(ad => {
      const isVideo = ad.creative?.video_id ? 'VIDEO' : 'IMAGE';
      console.log(`Ad: ${ad.name}, Type: ${isVideo}, Status: ${ad.effective_status}, Has thumbnail: ${!!ad.creative?.thumbnail_url}, Has video source: ${!!ad.creative?.video_source_url}`);
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
