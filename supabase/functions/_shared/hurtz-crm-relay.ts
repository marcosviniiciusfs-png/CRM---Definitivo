// O Hurtz CRM (crm.hurtzcompany.com.br) usa o mesmo app Meta deste projeto e a
// Meta so aceita um callback de leadgen por app. Por isso este webhook recebe
// os eventos das paginas do Hurtz CRM e repassa o corpo original, com a mesma
// assinatura, para o Hurtz CRM validar e importar do lado dele.
// Mapa completo: hurtz-consorcio/.agents/skills/gerir-hurtz-crm/references/integracao-meta-leads.md
//
// Regra: repassa toda pagina que NAO tem integracao no Kairoz (pagina nova do
// Hurtz CRM entra sozinha) e, alem disso, sempre as paginas conhecidas do Hurtz
// CRM, mesmo que tambem estejam conectadas aqui.

const DEFAULT_RELAY_URL = 'https://crm.hurtzcompany.com.br/webhooks/meta/leadgen';

// Paginas com FacebookIntegration ativa no Hurtz CRM em 29/10/2026.
// HURTZ_CRM_RELAY_PAGE_IDS no functions.env substitui esta lista.
const DEFAULT_HURTZ_PAGE_IDS = [
  '388625007675498',  // LR Representações (conta Hurtz)
  '1200091243187298', // Grupo Hurtz
  '1267615169757933', // Felipe Farias
  '1150761794789951', // Grupo União
  '836389116226454',  // Marcos Hurtz (Hurtz Clínicas)
  '1268574862999777', // Luciano Parauapebas
  '1150171261517485', // Dentista Vs10
  '117893468021553',  // Dr. Rafael Dias
  '1229734916900505', // Ma Soluções Financeiras
  '958481177350117',  // Dr. Rafael Braga
];

const RELAY_TIMEOUT_MS = 5000;

function knownHurtzPageIds(): Set<string> {
  const fromEnv = Deno.env.get('HURTZ_CRM_RELAY_PAGE_IDS');
  const ids = fromEnv !== undefined ? fromEnv.split(',') : DEFAULT_HURTZ_PAGE_IDS;
  return new Set(ids.map((id) => id.trim()).filter(Boolean));
}

function relayDisabled(): boolean {
  return Deno.env.get('HURTZ_CRM_RELAY_DISABLED') === 'true';
}

function leadgenPageIds(body: any): string[] {
  const pageIds = new Set<string>();
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      if (change?.field !== 'leadgen') continue;
      const pageId = String(change?.value?.page_id ?? entry?.id ?? '').trim();
      if (pageId) pageIds.add(pageId);
    }
  }
  return [...pageIds];
}

// Na duvida (erro ao consultar o banco) repassa: o Hurtz CRM ignora o que nao e dele,
// e perder lead e pior que um evento a mais.
async function pagesForHurtzCrm(supabase: any, pageIds: string[]): Promise<string[]> {
  const known = knownHurtzPageIds();
  const { data, error } = await supabase
    .from('facebook_integrations')
    .select('page_id')
    .in('page_id', pageIds);

  if (error) {
    console.warn('⚠️ [FB-WEBHOOK] Relay Hurtz CRM: falha ao consultar integracoes, repassando mesmo assim:', error.message);
    return pageIds;
  }

  const kairozPages = new Set((data ?? []).map((row: any) => String(row.page_id)));
  return pageIds.filter((pageId) => known.has(pageId) || !kairozPages.has(pageId));
}

async function relay(rawBody: string, signatureHeader: string, body: any, supabase: any): Promise<void> {
  const pageIds = leadgenPageIds(body);
  if (pageIds.length === 0) return;

  const matched = await pagesForHurtzCrm(supabase, pageIds);
  if (matched.length === 0) return;

  const url = Deno.env.get('HURTZ_CRM_META_WEBHOOK_URL') || DEFAULT_RELAY_URL;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signatureHeader,
    },
    body: rawBody,
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  });
  await response.body?.cancel();
  const log = response.ok ? console.log : console.error;
  log(`↪️ [FB-WEBHOOK] Relay Hurtz CRM status=${response.status} page_ids=${matched.join(',')}`);
}

// Nao bloqueia o processamento do Kairoz: falha no Hurtz CRM so gera log aqui.
export function relayLeadgenToHurtzCrm(rawBody: string, signatureHeader: string | null, body: any, supabase: any): void {
  if (!signatureHeader || relayDisabled()) return;

  const pending = relay(rawBody, signatureHeader, body, supabase).catch((error) => {
    console.error('❌ [FB-WEBHOOK] Relay Hurtz CRM falhou:', error?.message ?? error);
  });

  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions.
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions.
    EdgeRuntime.waitUntil(pending);
  }
}
