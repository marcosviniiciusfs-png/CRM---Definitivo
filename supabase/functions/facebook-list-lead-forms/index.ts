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
    return '';
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

    console.log(`[FB-FORMS] Buscando formulários para: ${integration_id ? `integration ${integration_id}` : `org ${organization_id}`}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const ENCRYPTION_KEY = Deno.env.get('GOOGLE_CALENDAR_ENCRYPTION_KEY') || 'default-encryption-key-32chars!';

    let pageAccessToken: string | null = null;
    let page_id: string | null = null;

    // ── Etapa 1: Tentar RPC get_facebook_token_by_integration ──
    if (integration_id) {
      console.log('[FB-FORMS] Etapa 1: RPC get_facebook_token_by_integration');
      const { data, error } = await supabase.rpc('get_facebook_token_by_integration', {
        p_integration_id: integration_id
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        page_id = row.page_id;

        if (row.encrypted_page_access_token) {
          console.log('[FB-FORMS] Token criptografado encontrado via RPC, descriptografando...');
          const decrypted = await decryptToken(row.encrypted_page_access_token, ENCRYPTION_KEY);
          if (decrypted) {
            pageAccessToken = decrypted;
            console.log('[FB-FORMS] ✅ Token descriptografado com sucesso via RPC');
          } else {
            console.warn('[FB-FORMS] ⚠️ Falha na descriptografia — tentando fallback');
          }
        } else {
          console.warn('[FB-FORMS] ⚠️ RPC retornou token vazio — integration pode ser legada');
        }
      } else {
        console.warn('[FB-FORMS] ⚠️ RPC falhou ou sem dados:', error?.message);
      }
    }

    // ── Etapa 2: Fallback via org_id ──
    if (!pageAccessToken && organization_id) {
      console.log('[FB-FORMS] Etapa 2: RPC get_facebook_tokens_secure (org fallback)');
      const { data, error } = await supabase.rpc('get_facebook_tokens_secure', {
        p_organization_id: organization_id
      });

      if (!error && data && data.length > 0) {
        const row = data[0];
        page_id = row.page_id;

        if (row.encrypted_page_access_token) {
          const decrypted = await decryptToken(row.encrypted_page_access_token, ENCRYPTION_KEY);
          if (decrypted) {
            pageAccessToken = decrypted;
            console.log('[FB-FORMS] ✅ Token via org fallback RPC');
          }
        }
      }
    }

    // ── Etapa 3: Renovar page token via user_access_token ──
    // NOTA: facebook_integrations NÃO tem page_access_token/access_token.
    // Tokens ficam APENAS em facebook_integration_tokens (colunas encrypted_*).
    if (!pageAccessToken) {
      console.log('[FB-FORMS] Etapa 3: Tentando renovar token via user_access_token');

      const filterCol = integration_id ? 'id' : 'organization_id';
      const filterVal = integration_id || organization_id;

      const { data: intData } = await supabase
        .from('facebook_integrations')
        .select('id, page_id')
        .eq(filterCol, filterVal)
        .maybeSingle();

      if (intData) {
        if (!page_id) page_id = intData.page_id;

        const { data: tokenRow } = await supabase
          .from('facebook_integration_tokens')
          .select('encrypted_access_token, encrypted_page_access_token')
          .eq('integration_id', intData.id)
          .maybeSingle();

        if (tokenRow) {
          // Tentar user token para renovar page token
          const userToken = await decryptToken(tokenRow.encrypted_access_token || '', ENCRYPTION_KEY);
          if (userToken && page_id) {
            try {
              const resp = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${userToken}`);
              if (resp.ok) {
                const accs = await resp.json();
                const pg = (accs.data || []).find((p: any) => p.id === page_id);
                if (pg?.access_token) {
                  pageAccessToken = pg.access_token;
                  console.log('[FB-FORMS] ✅ Page token renovado via user_access_token → /me/accounts');
                }
              }
            } catch (e) {
              console.warn('[FB-FORMS] ⚠️ Falha ao renovar via /me/accounts:', e);
            }
          }
        }
      }
    }

    // ── Etapa 4: Fallback — direto em facebook_integration_tokens ──
    if (!pageAccessToken && integration_id) {
      console.log('[FB-FORMS] Etapa 4: Query direta em facebook_integration_tokens');

      const { data: tokenRow } = await supabase
        .from('facebook_integration_tokens')
        .select('encrypted_page_access_token, integration_id')
        .eq('integration_id', integration_id)
        .maybeSingle();

      if (tokenRow?.encrypted_page_access_token) {
        const decrypted = await decryptToken(tokenRow.encrypted_page_access_token, ENCRYPTION_KEY);
        if (decrypted) {
          pageAccessToken = decrypted;
          console.log('[FB-FORMS] ✅ Token via query direta em facebook_integration_tokens');
        }
      }
    }

    // ── Sem token após todas as tentativas ──
    if (!pageAccessToken) {
      console.error('[FB-FORMS] ❌ Nenhum token encontrado após todas as tentativas');
      throw new Error('Token não encontrado. Por favor, desconecte e reconecte ao Facebook nas Integrações.');
    }

    if (!page_id) {
      throw new Error('page_id não encontrado. Por favor, reconecte ao Facebook.');
    }

    console.log(`[FB-FORMS] Buscando formulários da página: ${page_id}`);

    // Buscar formulários na API do Facebook
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${page_id}/leadgen_forms?access_token=${pageAccessToken}&fields=id,name,status,leads_count`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[FB-FORMS] Erro na API do Facebook:', errorData);

      // Token expirado → sugerir reconexão
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new Error('Token do Facebook expirado ou inválido. Por favor, desconecte e reconecte ao Facebook.');
      }
      throw new Error(`Erro na API do Facebook: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    console.log(`[FB-FORMS] ✅ ${(data.data || []).length} formulários encontrados`);

    return new Response(
      JSON.stringify({ forms: data.data || [] }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[FB-FORMS] Erro:', error);

    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
