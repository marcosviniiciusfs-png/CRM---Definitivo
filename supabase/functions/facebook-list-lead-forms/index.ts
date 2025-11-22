const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { page_id, page_access_token } = await req.json();

    if (!page_id || !page_access_token) {
      throw new Error('Missing page_id or page_access_token');
    }

    console.log('Fetching lead forms for page:', page_id);

    // Fetch lead forms from Facebook Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${page_id}/leadgen_forms?access_token=${page_access_token}&fields=id,name,status,leads_count`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Facebook API error:', errorData);
      throw new Error(`Facebook API error: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log('Lead forms fetched successfully:', data);

    return new Response(
      JSON.stringify({ forms: data.data || [] }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error fetching lead forms:', error);
    
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
