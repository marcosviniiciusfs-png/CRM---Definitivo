import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { form_id, form_name, page_access_token, integration_id } = await req.json();

    if (!form_id || !page_access_token || !integration_id) {
      throw new Error('Missing required parameters');
    }

    console.log('Subscribing webhook for form:', form_id);

    // Subscribe to leadgen webhook for this specific form
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${form_id}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: page_access_token,
          subscribed_fields: ['leadgen'],
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      throw new Error(`Facebook API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Webhook subscribed successfully:', data);

    // Update integration with selected form
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error: updateError } = await supabase
      .from('facebook_integrations')
      .update({
        selected_form_id: form_id,
        selected_form_name: form_name,
        webhook_verified: true,
      })
      .eq('id', integration_id);

    if (updateError) {
      console.error('Error updating integration:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error subscribing webhook:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
