// ============================================================
// sync-google-sheets-meta — helper backend para o dialog de
// "Conectar planilha". Recebe spreadsheet_id e devolve:
//   - title da planilha + lista de abas (sheets)
//   - opcionalmente, preview de até N linhas de uma aba
// Mantém o token Google fora do client.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function decryptToken(encrypted: string, keyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['decrypt']);
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return dec.decode(plain);
}

async function encryptToken(plain: string, keyStr: string): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest('SHA-256', enc.encode(keyStr));
  const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain));
  const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const encryptionKey = Deno.env.get('GOOGLE_SHEETS_ENCRYPTION_KEY')!;
    if (!encryptionKey) throw new Error('GOOGLE_SHEETS_ENCRYPTION_KEY não configurada');

    // Auth do usuário (ele precisa ser membro da org da integração)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Token inválido');

    const body = await req.json();
    const integration_id: string = body?.integration_id;
    const spreadsheet_id: string = body?.spreadsheet_id;
    const sheet_name: string | undefined = body?.sheet_name;
    const preview: boolean = !!body?.preview;
    const header_row: number = body?.header_row ?? 1;

    if (!integration_id || !spreadsheet_id) throw new Error('integration_id e spreadsheet_id obrigatórios');

    // Carrega integração e valida que o usuário pertence à org dela
    const { data: integ } = await supabase
      .from('google_sheets_integrations')
      .select('id, organization_id, is_active')
      .eq('id', integration_id)
      .maybeSingle();

    if (!integ || !integ.is_active) throw new Error('Integração não encontrada ou inativa');

    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', integ.organization_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!membership) throw new Error('Você não tem acesso a esta integração');

    // Pega tokens
    const { data: tokenRow } = await supabase
      .from('google_sheets_tokens')
      .select('encrypted_access_token, encrypted_refresh_token, token_expires_at')
      .eq('integration_id', integration_id)
      .maybeSingle();
    if (!tokenRow) throw new Error('Token não encontrado — reconecte sua conta Google');

    let accessToken = await decryptToken(tokenRow.encrypted_access_token, encryptionKey);
    const refreshToken = await decryptToken(tokenRow.encrypted_refresh_token, encryptionKey);

    if (new Date(tokenRow.token_expires_at).getTime() - Date.now() < 60_000) {
      const r = await refreshAccessToken(refreshToken);
      if (!r) throw new Error('Token expirado e não foi possível renovar — reconecte sua conta Google');
      accessToken = r.access_token;
      const newExp = new Date(Date.now() + r.expires_in * 1000).toISOString();
      await supabase.from('google_sheets_tokens').update({
        encrypted_access_token: await encryptToken(accessToken, encryptionKey),
        token_expires_at: newExp,
      }).eq('integration_id', integration_id);
      await supabase.from('google_sheets_integrations').update({
        token_expires_at: newExp,
      }).eq('id', integration_id);
    }

    // Modo preview de uma aba específica
    if (preview && sheet_name) {
      const range = `${encodeURIComponent(sheet_name)}!A1:Z${(header_row || 1) + 5}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${range}?majorDimension=ROWS`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Sheets API ${res.status}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ values: data.values || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // Modo metadata: nome + lista de abas
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}?fields=properties.title,sheets.properties`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text();
      let msg = `Sheets API ${res.status}`;
      if (res.status === 403) msg = 'Sem permissão. Verifique se a planilha está compartilhada com a conta Google conectada.';
      else if (res.status === 404) msg = 'Planilha não encontrada. Confira o link.';
      throw new Error(`${msg}: ${t.slice(0, 200)}`);
    }
    const meta = await res.json();
    const sheets = (meta.sheets || []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
      rowCount: s.properties.gridProperties?.rowCount ?? 0,
    }));
    return new Response(JSON.stringify({ title: meta.properties?.title || '', sheets }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('❌ sync-google-sheets-meta:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });
  }
});
