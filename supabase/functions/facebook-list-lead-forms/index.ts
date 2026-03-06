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
    const { organization_id, integration_id } = await req.json();

    if (!organization_id && !integration_id) {
      throw new Error('Missing organization_id or integration_id');
    }

    console.log('Fetching lead forms for:', integration_id ? `integration ${integration_id}` : `organization ${organization_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

    // Buscar tokens de forma segura
    let tokenData, tokenError;

    if (integration_id) {
      console.log('Using integration_id for secure token fetch');
      const { data, error } = await supabase.rpc('get_facebook_token_by_integration', {
        p_integration_id: integration_id
      });
      tokenData = data;
      tokenError = error;
    } else {
      console.log('Falling back to get_facebook_tokens_secure (DEPRECATED for multi-page)');
      const { data, error } = await supabase.rpc('get_facebook_tokens_secure', {
        p_organization_id: organization_id
      });
      tokenData = data;
      tokenError = error;
    }

    // Fallback if RPC is missing
    if (tokenError || !tokenData || tokenData.length === 0) {
      console.warn('⚠️ RPC get_facebook_tokens_secure failed or missing, trying fallback...');

      const { data: integrationData } = await supabase
        .from('facebook_integrations')
        .select('id, page_id')
        .eq(integration_id ? 'id' : 'organization_id', integration_id || organization_id)
        .maybeSingle();

      if (integrationData) {
        const { data: secureData } = await supabase
          .from('facebook_integration_tokens')
          .select('encrypted_page_access_token')
          .eq('integration_id', integrationData.id)
          .maybeSingle();

        if (secureData) {
          tokenData = [{
            encrypted_page_access_token: secureData.encrypted_page_access_token,
            page_id: integrationData.page_id
          }];
          tokenError = null;
        }
      }
    }

    if (tokenError || !tokenData || tokenData.length === 0) {
      console.error('Error fetching secure tokens:', tokenError);
      throw new Error('Integração do Facebook não encontrada ou incompleta. Por favor, reconecte.');
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
