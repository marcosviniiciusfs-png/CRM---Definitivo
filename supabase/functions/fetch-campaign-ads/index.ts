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
    object_type?: string;
  } | null;
  preview_html?: string;
}

// Função para descriptografar tokens
async function decryptToken(encryptedToken: string, key: string): Promise<string> {
  if (!encryptedToken || encryptedToken === 'ENCRYPTED_IN_TOKENS_TABLE') return '';
  
  try {
    const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const data = combined.slice(12);
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(key.padEnd(32, '0').slice(0, 32));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    return encryptedToken;
  }
}

// Fetch ad preview iframe from Meta API
async function fetchAdPreview(adId: string, accessToken: string): Promise<string | null> {
  const formats = ['MOBILE_FEED_STANDARD', 'DESKTOP_FEED_STANDARD', 'INSTAGRAM_STANDARD'];
  
  for (const format of formats) {
    try {
      const url = `https://graph.facebook.com/v18.0/${adId}/previews?ad_format=${format}&access_token=${accessToken}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          const previewHtml = data.data[0].body;
          if (previewHtml) {
            console.log(`Got preview for ad ${adId} with format ${format}`);
            return previewHtml;
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching preview for ad ${adId} with format ${format}:`, error);
    }
  }
  
  console.log(`No preview available for ad ${adId}`);
  return null;
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

    // Buscar tokens de forma segura
    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';
    
    // Primeiro tentar a tabela segura de tokens
    const { data: secureTokens, error: secureError } = await supabase
      .from('facebook_integration_tokens')
      .select(`
        encrypted_access_token,
        integration:facebook_integrations!inner(
          id,
          organization_id,
          ad_account_id
        )
      `)
      .eq('integration.organization_id', organization_id)
      .single();

    let access_token: string | null = null;
    let ad_account_id: string | null = null;

    if (secureTokens && !secureError) {
      access_token = await decryptToken(secureTokens.encrypted_access_token, ENCRYPTION_KEY);
      const integration = secureTokens.integration as any;
      ad_account_id = integration?.ad_account_id;
    } else {
      // Fallback para tabela antiga (tokens legado)
      console.log('Fallback to legacy tokens table');
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

      if (integration.access_token && integration.access_token !== 'ENCRYPTED_IN_TOKENS_TABLE') {
        access_token = integration.access_token;
      }
      ad_account_id = integration.ad_account_id;
    }

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: 'Facebook access token not found', ads: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

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
    const adsFields = 'id,name,status,effective_status,creative{id,name,thumbnail_url,image_url,body,title,call_to_action_type,object_type}';

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

    // Process ads and fetch previews in parallel
    const ads: CampaignAd[] = await Promise.all((adsData.data || []).map(async (ad: any) => {
      const creative = ad.creative || null;
      
      // Fetch preview iframe for this ad
      const previewHtml = await fetchAdPreview(ad.id, access_token!);
      
      return {
        id: ad.id,
        name: ad.name || 'Unnamed Ad',
        status: ad.status,
        effective_status: ad.effective_status,
        creative: creative ? {
          id: creative.id,
          name: creative.name,
          thumbnail_url: creative.thumbnail_url,
          image_url: creative.image_url,
          body: creative.body,
          title: creative.title,
          call_to_action_type: creative.call_to_action_type,
          object_type: creative.object_type
        } : null,
        preview_html: previewHtml
      };
    }));

    console.log(`Processed ${ads.length} ads with previews`);

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