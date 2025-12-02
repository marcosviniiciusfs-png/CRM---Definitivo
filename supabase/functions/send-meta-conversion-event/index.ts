import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConversionEventRequest {
  lead_id: string;
  funnel_id: string;
  event_name?: string;
  value?: number;
  currency?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { lead_id, funnel_id, event_name = 'Purchase', value, currency = 'BRL' } = await req.json() as ConversionEventRequest;

    console.log(`[Meta CAPI] Processing conversion event for lead ${lead_id}, funnel ${funnel_id}`);

    // Get pixel configuration for this funnel
    const { data: pixelConfig, error: pixelError } = await supabase
      .from('meta_pixel_integrations')
      .select('*')
      .eq('funnel_id', funnel_id)
      .eq('is_active', true)
      .single();

    if (pixelError || !pixelConfig) {
      console.log(`[Meta CAPI] No active pixel configuration found for funnel ${funnel_id}`);
      return new Response(
        JSON.stringify({ success: false, message: 'No pixel configuration found for this funnel' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get lead data for user matching
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', lead_id)
      .single();

    if (leadError || !lead) {
      console.error(`[Meta CAPI] Lead not found: ${lead_id}`);
      return new Response(
        JSON.stringify({ success: false, message: 'Lead not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare user data for matching (hashing is done by Meta)
    const userData: Record<string, string[]> = {};
    
    if (lead.email) {
      userData.em = [lead.email.toLowerCase().trim()];
    }
    
    if (lead.telefone_lead) {
      // Clean phone number - remove non-digits and add country code if needed
      let phone = lead.telefone_lead.replace(/\D/g, '');
      if (!phone.startsWith('55') && phone.length <= 11) {
        phone = '55' + phone;
      }
      userData.ph = [phone];
    }

    // Prepare event data
    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `${lead_id}_${eventTime}`;

    const eventData = {
      event_name: event_name,
      event_time: eventTime,
      event_id: eventId,
      event_source_url: supabaseUrl,
      action_source: 'system_generated',
      user_data: userData,
      custom_data: {
        currency: currency,
        value: value || lead.valor || 0,
        content_name: lead.nome_lead,
        content_category: 'CRM Lead Conversion',
      },
    };

    console.log(`[Meta CAPI] Sending event to Pixel ${pixelConfig.pixel_id}:`, JSON.stringify(eventData));

    // Send to Meta Conversions API
    const metaResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pixelConfig.pixel_id}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [eventData],
          access_token: pixelConfig.access_token,
        }),
      }
    );

    const metaResult = await metaResponse.json();

    if (!metaResponse.ok) {
      console.error(`[Meta CAPI] Error from Meta API:`, metaResult);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Error sending event to Meta',
          error: metaResult 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Meta CAPI] Event sent successfully:`, metaResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Conversion event sent successfully',
        meta_response: metaResult,
        events_received: metaResult.events_received || 1
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Meta CAPI] Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
