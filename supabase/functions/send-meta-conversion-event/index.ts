import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SHA256 hash function for PII data
async function sha256Hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

interface ConversionEventRequest {
  lead_id: string;
  event_name?: string;
  value?: number;
  currency?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { lead_id, event_name = 'Purchase', value, currency = 'BRL' } = await req.json() as ConversionEventRequest;

    console.log(`[Meta CAPI] Processing conversion event for lead ${lead_id}`);

    // Get lead data first to get organization_id
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

    // Get pixel configuration for this organization (one pixel per org, works for all funnels)
    const { data: pixelConfig, error: pixelError } = await supabase
      .from('meta_pixel_integrations')
      .select('*')
      .eq('organization_id', lead.organization_id)
      .eq('is_active', true)
      .maybeSingle();

    if (pixelError || !pixelConfig) {
      console.log(`[Meta CAPI] No active pixel configuration found for organization ${lead.organization_id}`);
      return new Response(
        JSON.stringify({ success: false, message: 'No pixel configuration found for this organization' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare user data for matching - Meta requires SHA256 hashing of PII
    const userData: Record<string, string[]> = {};
    
    if (lead.email) {
      const hashedEmail = await sha256Hash(lead.email);
      userData.em = [hashedEmail];
    }
    
    if (lead.telefone_lead) {
      // Clean phone number - remove non-digits and add country code if needed
      let phone = lead.telefone_lead.replace(/\D/g, '');
      if (!phone.startsWith('55') && phone.length <= 11) {
        phone = '55' + phone;
      }
      const hashedPhone = await sha256Hash(phone);
      userData.ph = [hashedPhone];
    }

    // Add first name and last name from nome_lead for better matching
    if (lead.nome_lead) {
      const nameParts = lead.nome_lead.trim().split(/\s+/);
      if (nameParts.length > 0) {
        const hashedFirstName = await sha256Hash(nameParts[0]);
        userData.fn = [hashedFirstName];
      }
      if (nameParts.length > 1) {
        const lastName = nameParts.slice(1).join(' ');
        const hashedLastName = await sha256Hash(lastName);
        userData.ln = [hashedLastName];
      }
    }

    // Add external_id for cross-platform matching
    const hashedExternalId = await sha256Hash(lead_id);
    userData.external_id = [hashedExternalId];

    // Prepare event data
    const eventTime = Math.floor(Date.now() / 1000);
    const eventId = `${lead_id}_${eventTime}`;

    const eventData = {
      event_name: event_name,
      event_time: eventTime,
      event_id: eventId,
      event_source_url: 'https://kairozspace.com.br',
      action_source: 'website',
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
      
      // Log error to database (include funnel_id for tracking which funnel generated the conversion)
      await supabase.from('meta_conversion_logs').insert({
        organization_id: pixelConfig.organization_id,
        lead_id: lead_id,
        funnel_id: lead.funnel_id, // Still log funnel_id for tracking purposes
        pixel_id: pixelConfig.pixel_id,
        event_name: event_name,
        event_id: eventId,
        status: 'error',
        error_message: JSON.stringify(metaResult.error || metaResult),
        request_payload: eventData,
        response_payload: metaResult,
      });
      
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
    
    // Log success to database
    await supabase.from('meta_conversion_logs').insert({
      organization_id: pixelConfig.organization_id,
      lead_id: lead_id,
      funnel_id: lead.funnel_id, // Still log funnel_id for tracking purposes
      pixel_id: pixelConfig.pixel_id,
      event_name: event_name,
      event_id: eventId,
      status: 'success',
      events_received: metaResult.events_received || 1,
      request_payload: eventData,
      response_payload: metaResult,
    });

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
