import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organization_id } = await req.json();

    if (!organization_id) {
      throw new Error('Missing organization_id');
    }

    console.log('Fetching lead forms for organization:', organization_id);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

    // Buscar tokens de forma segura usando a função RPC
    const { data: tokenData, error: tokenError } = await supabase.rpc('get_facebook_tokens_secure', {
      p_organization_id: organization_id
    });

    if (tokenError) {
      console.error('Error fetching secure tokens:', tokenError);
      throw new Error('Failed to fetch Facebook tokens');
    }

    if (!tokenData || tokenData.length === 0) {
      throw new Error('Facebook integration not found');
    }

    const { encrypted_page_access_token, page_id } = tokenData[0];

    if (!page_id) {
      throw new Error('No page_id found in integration');
    }

    // Descriptografar o page_access_token
    const pageAccessToken = await decryptToken(encrypted_page_access_token, ENCRYPTION_KEY);

    if (!pageAccessToken) {
      throw new Error('Failed to decrypt page access token. Please reconnect Facebook.');
    }

    console.log('Fetching lead forms for page:', page_id);

    // Fetch lead forms from Facebook Graph API
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${page_id}/leadgen_forms?access_token=${pageAccessToken}&fields=id,name,status,leads_count`,
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
