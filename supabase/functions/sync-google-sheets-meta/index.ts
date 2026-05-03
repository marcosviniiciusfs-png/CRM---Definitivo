// ============================================================
// sync-google-sheets-meta — helper backend para o dialog de
// "Conectar planilha". Recebe spreadsheet_id e devolve:
//   - title da planilha + lista de abas
//   - opcionalmente, preview de até N linhas de uma aba
//
// Autentica via Service Account (mesma SA do sync). Mantém token
// Google e private key fora do client.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Token cache local — recriado a cada cold-start, dura ~horas no warm.
let cachedToken: { token: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [A-Z ]+-----/g, '')
    .replace(/-----END [A-Z ]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) view[i] = bin.charCodeAt(i);
  return buf;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const b64 = typeof input === 'string'
    ? btoa(input)
    : btoa(String.fromCharCode(...input));
  return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getServiceAccountAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const email = Deno.env.get('GOOGLE_SA_EMAIL');
  const privateKeyPem = Deno.env.get('GOOGLE_SA_PRIVATE_KEY');
  if (!email || !privateKeyPem) {
    throw new Error('GOOGLE_SA_EMAIL ou GOOGLE_SA_PRIVATE_KEY não configurados');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encHeader = base64UrlEncode(JSON.stringify(header));
  const encClaims = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${encHeader}.${encClaims}`;

  const keyData = pemToArrayBuffer(privateKeyPem);
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sigBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  const sig = base64UrlEncode(new Uint8Array(sigBuffer));
  const jwt = `${signingInput}.${sig}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Falha ao obter token SA: ${tokenRes.status} ${errText.slice(0, 200)}`);
  }

  const data = await tokenRes.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  };
  return cachedToken.token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) throw new Error('Token inválido');

    const body = await req.json();
    const spreadsheet_id: string = body?.spreadsheet_id;
    const sheet_name: string | undefined = body?.sheet_name;
    const preview: boolean = !!body?.preview;
    const header_row: number = body?.header_row ?? 1;

    if (!spreadsheet_id) throw new Error('spreadsheet_id obrigatório');

    // Validar que o usuário pertence a alguma org ativa
    // (qualquer org serve — a SA é compartilhada entre todas)
    const { data: anyMembership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (!anyMembership) throw new Error('Usuário sem organização ativa');

    const accessToken = await getServiceAccountAccessToken();

    if (preview && sheet_name) {
      const range = `${encodeURIComponent(sheet_name)}!A1:Z${(header_row || 1) + 5}`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}/values/${range}?majorDimension=ROWS`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const t = await res.text();
        let msg = `Sheets API ${res.status}`;
        if (res.status === 403) msg = 'Sem permissão. Confirme que a planilha foi compartilhada com o email da Service Account.';
        else if (res.status === 404) msg = 'Planilha não encontrada — confira o link.';
        throw new Error(`${msg}: ${t.slice(0, 200)}`);
      }
      const data = await res.json();
      return new Response(JSON.stringify({ values: data.values || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // Modo metadata
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheet_id}?fields=properties.title,sheets.properties`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const t = await res.text();
      let msg = `Sheets API ${res.status}`;
      if (res.status === 403) msg = 'Sem permissão. Compartilhe a planilha com o email da Service Account (Visualização).';
      else if (res.status === 404) msg = 'Planilha não encontrada — confira o link.';
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
