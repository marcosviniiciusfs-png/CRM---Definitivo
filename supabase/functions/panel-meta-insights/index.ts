// Painel de acompanhamento: números da Meta para a organização (só leitura de anúncios).
//
// Modos (POST, body.mode):
//   status     — membro: configuração do painel e o que o usuário pode mudar
//   insights   — membro: números do período {from, to} (AAAA-MM-DD); nada é lido se o painel estiver desligado
//   set_goal   — owner/admin (ou super admin): meta mensal de conversas
//   configure  — owner/admin da organização (ou super admin): ligar/desligar, origem do token, contas, token próprio
//   list_accounts — owner/admin (ou super admin): testa o token e lista as contas de anúncio que ele enxerga
//
// O painel nasce desligado. Enquanto estiver desligado, nenhuma chamada à Meta é feita.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";
import { corsHeaders } from "../_shared/cors.ts";
import {
  authorizationErrorResponse,
  RequestAuthorizationError,
  requireOrganizationMember,
  requireSuperAdmin,
} from "../_shared/organization-auth.ts";
import { decryptMetaToken, encryptMetaToken } from "../_shared/meta-token-crypto.ts";
import { rejectRateLimited } from "../_shared/request-security.ts";
import {
  buildDaily,
  cacheTtlMs,
  classifyCreatives,
  costPerConversation,
  describeMetaError,
  indicatorsFrom,
  isValidIsoDate,
  normalizeAdAccountId,
  parseAdAccounts,
  previousPeriod,
  sumTotals,
  type MetaInsightRow,
} from "../_shared/panel-metrics.ts";

const GRAPH = "https://graph.facebook.com/v21.0";
const MAX_PAGES = 10;
const MAX_ACCOUNTS = 10;
const MAX_RANGE_DAYS = 366;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

class MetaError extends Error {
  constructor(message: string, readonly code: number | null) {
    super(message);
  }
}

// deno-lint-ignore no-explicit-any
type Supabase = any;

interface PanelSettings {
  organization_id: string;
  enabled: boolean;
  token_source: "own" | "facebook_integration";
  ad_account_ids: string[];
  monthly_conversation_goal: number | null;
}

const todayBrt = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

async function loadSettings(supabase: Supabase, organizationId: string): Promise<PanelSettings> {
  const { data } = await supabase
    .from("panel_settings")
    .select("organization_id, enabled, token_source, ad_account_ids, monthly_conversation_goal")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return data ?? {
    organization_id: organizationId,
    enabled: false,
    token_source: "own",
    ad_account_ids: [],
    monthly_conversation_goal: null,
  };
}

async function isSuperAdmin(req: Request, supabase: Supabase): Promise<boolean> {
  try {
    await requireSuperAdmin(req, supabase);
    return true;
  } catch {
    return false;
  }
}

/** Quem configura o painel da organização: o dono, os administradores dela ou um super admin. */
async function requireConfigurer(req: Request, supabase: Supabase, organizationId: string) {
  if (await isSuperAdmin(req, supabase)) return await requireSuperAdmin(req, supabase);
  return await requireOrganizationMember(req, supabase, organizationId, ["owner", "admin"]);
}

/** Token e contas de anúncio que o painel usa, conforme a origem escolhida pelo super admin. */
async function resolveCredential(
  supabase: Supabase,
  settings: PanelSettings,
): Promise<{ token: string; accounts: string[] }> {
  let token = "";
  let fallbackAccount: string | null = null;

  if (settings.token_source === "own") {
    const { data } = await supabase
      .from("panel_meta_tokens")
      .select("encrypted_access_token")
      .eq("organization_id", settings.organization_id)
      .maybeSingle();
    token = data?.encrypted_access_token ? await decryptMetaToken(data.encrypted_access_token) : "";
  } else {
    const { data: integration } = await supabase
      .from("facebook_integrations")
      .select("id, ad_account_id")
      .eq("organization_id", settings.organization_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    fallbackAccount = integration?.ad_account_id ?? null;
    if (integration?.id) {
      const { data } = await supabase
        .from("facebook_integration_tokens")
        .select("encrypted_access_token")
        .eq("integration_id", integration.id)
        .maybeSingle();
      token = data?.encrypted_access_token ? await decryptMetaToken(data.encrypted_access_token) : "";
    }
  }

  const configured = settings.ad_account_ids.length > 0 ? settings.ad_account_ids : fallbackAccount ? [fallbackAccount] : [];
  const accounts = [...new Set(configured.map(normalizeAdAccountId).filter((id): id is string => Boolean(id)))]
    .slice(0, MAX_ACCOUNTS);
  return { token, accounts };
}

async function graphAll(path: string, params: Record<string, string>, token: string): Promise<MetaInsightRow[]> {
  const rows: MetaInsightRow[] = [];
  let url: string | null = `${GRAPH}/${path}?${new URLSearchParams({ limit: "500", ...params })}`;
  for (let page = 0; url && page < MAX_PAGES; page++) {
    // Token no cabeçalho, não na URL, para não aparecer em logs.
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => ({}));
    if (body?.error) throw new MetaError(String(body.error.message ?? "Erro da Meta"), Number(body.error.code) || null);
    rows.push(...(Array.isArray(body?.data) ? body.data : []));
    url = body?.paging?.next ?? null;
  }
  return rows;
}

async function fetchPeriod(token: string, accounts: string[], from: string, to: string, detailed: boolean) {
  const time_range = JSON.stringify({ since: from, until: to });
  const perAccount = await Promise.all(accounts.map(async (account) => {
    const [totals, campaigns, daily, ads] = await Promise.all([
      graphAll(`${account}/insights`, {
        level: "account",
        time_range,
        fields: "spend,reach,impressions,inline_link_clicks,actions",
      }, token),
      graphAll(`${account}/insights`, {
        level: "campaign",
        time_range,
        fields: "campaign_id,campaign_name,objective,spend,actions",
      }, token),
      detailed
        ? graphAll(`${account}/insights`, { level: "account", time_range, time_increment: "1", fields: "spend,actions" }, token)
        : Promise.resolve([]),
      detailed
        ? graphAll(`${account}/insights`, { level: "ad", time_range, fields: "ad_id,ad_name,campaign_name,spend,actions" }, token)
        : Promise.resolve([]),
    ]);
    return { totals, campaigns, daily, ads };
  }));

  const totals = sumTotals(perAccount.flatMap((item) => item.totals));
  const cost = costPerConversation(perAccount.flatMap((item) => item.campaigns));
  return {
    result: {
      conversations: totals.conversations,
      realConversations: totals.realConversations,
      leads: totals.leads,
      spend: totals.spend,
      costPerConversation: cost.cost,
    },
    indicators: indicatorsFrom(totals),
    daily: detailed ? buildDaily(perAccount.flatMap((item) => item.daily)) : [],
    creatives: detailed ? classifyCreatives(perAccount.flatMap((item) => item.ads)) : [],
  };
}

async function handleInsights(req: Request, supabase: Supabase, body: Record<string, unknown>, organizationId: string) {
  await requireOrganizationMember(req, supabase, organizationId);
  const settings = await loadSettings(supabase, organizationId);
  if (!settings.enabled) return json({ disabled: true });

  const from = body.from;
  const to = body.to;
  if (!isValidIsoDate(from) || !isValidIsoDate(to) || to < from) {
    return json({ error: "Período inválido. Use AAAA-MM-DD, com o início antes do fim." }, 400);
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
  if (days > MAX_RANGE_DAYS) return json({ error: "O período pode ter no máximo 366 dias." }, 400);

  const { token, accounts } = await resolveCredential(supabase, settings);
  if (!token) {
    return json({
      error: "O painel está ligado, mas não há token da Meta para ele. Peça ao administrador do KairoZ para configurar.",
      errorCode: "PANEL_TOKEN_MISSING",
    });
  }
  if (accounts.length === 0) {
    return json({
      error: "Nenhuma conta de anúncios configurada para o painel.",
      errorCode: "PANEL_NO_AD_ACCOUNT",
    });
  }

  const cacheKey = `v1|${settings.token_source}|${accounts.join(",")}|${from}|${to}`;
  const { data: cached } = await supabase
    .from("panel_meta_cache")
    .select("payload, fetched_at")
    .eq("organization_id", organizationId)
    .eq("cache_key", cacheKey)
    .maybeSingle();
  const ttl = cacheTtlMs(to, todayBrt());
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttl && body.refresh !== true) {
    return json({ ...cached.payload, cached: true });
  }

  const previous = previousPeriod(from, to);
  try {
    const [current, before] = await Promise.all([
      fetchPeriod(token, accounts, from, to, true),
      fetchPeriod(token, accounts, previous.from, previous.to, false),
    ]);
    const payload = {
      disabled: false,
      period: { from, to },
      previousPeriod: previous,
      accounts,
      fetchedAt: new Date().toISOString(),
      result: current.result,
      previousResult: before.result,
      indicators: current.indicators,
      previousIndicators: before.indicators,
      daily: current.daily,
      creatives: current.creatives,
      monthlyConversationGoal: settings.monthly_conversation_goal,
    };
    await supabase
      .from("panel_meta_cache")
      .upsert({ organization_id: organizationId, cache_key: cacheKey, payload, fetched_at: payload.fetchedAt });
    return json({ ...payload, cached: false });
  } catch (error) {
    if (error instanceof MetaError) {
      const tokenProblem = error.code !== null && [190, 102, 104].includes(error.code);
      // Sem resposta nova da Meta, devolve o último resultado guardado, avisando.
      if (cached) return json({ ...cached.payload, cached: true, stale: true, warning: "A Meta não respondeu agora. Os números são da última leitura." });
      return json({
        error: tokenProblem
          ? "A Meta recusou o token do painel. Peça ao administrador do KairoZ para trocar o token."
          : `A Meta não respondeu agora: ${error.message}`,
        errorCode: tokenProblem ? "PANEL_TOKEN_INVALID" : "META_UNAVAILABLE",
      });
    }
    throw error;
  }
}

async function handleStatus(req: Request, supabase: Supabase, organizationId: string) {
  const { membership } = await requireOrganizationMember(req, supabase, organizationId);
  const settings = await loadSettings(supabase, organizationId);
  const superAdmin = await isSuperAdmin(req, supabase);
  const canConfigure = superAdmin || ["owner", "admin"].includes(membership.role);
  const { data: ownToken } = await supabase
    .from("panel_meta_tokens")
    .select("updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return json({
    enabled: settings.enabled,
    tokenSource: settings.token_source,
    adAccountIds: canConfigure ? settings.ad_account_ids : [],
    monthlyConversationGoal: settings.monthly_conversation_goal,
    hasOwnToken: Boolean(ownToken),
    canConfigure,
    canEditGoal: canConfigure,
  });
}

async function handleSetGoal(req: Request, supabase: Supabase, body: Record<string, unknown>, organizationId: string) {
  const superAdmin = await isSuperAdmin(req, supabase);
  const auth = superAdmin
    ? await requireSuperAdmin(req, supabase)
    : await requireOrganizationMember(req, supabase, organizationId, ["owner", "admin"]);
  const goal = body.monthly_conversation_goal === null ? null : Number(body.monthly_conversation_goal);
  if (goal !== null && (!Number.isInteger(goal) || goal <= 0 || goal > 1_000_000)) {
    return json({ error: "A meta precisa ser um número inteiro maior que zero." }, 400);
  }
  const { error } = await supabase
    .from("panel_settings")
    .upsert({
      organization_id: organizationId,
      monthly_conversation_goal: goal,
      updated_at: new Date().toISOString(),
      updated_by: auth.user.id,
    }, { onConflict: "organization_id" });
  if (error) return json({ error: `Não foi possível salvar a meta: ${error.message}` }, 500);
  return json({ success: true });
}

async function handleConfigure(req: Request, supabase: Supabase, body: Record<string, unknown>, organizationId: string) {
  const { user } = await requireConfigurer(req, supabase, organizationId);
  const current = await loadSettings(supabase, organizationId);

  const update: Record<string, unknown> = {
    organization_id: organizationId,
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  if (typeof body.enabled === "boolean") update.enabled = body.enabled;
  if (body.token_source === "own" || body.token_source === "facebook_integration") update.token_source = body.token_source;
  if (Array.isArray(body.ad_account_ids)) {
    const ids = body.ad_account_ids.map((id) => normalizeAdAccountId(String(id)));
    if (ids.some((id) => !id)) return json({ error: "Conta de anúncios inválida. Use só os números ou act_123..." }, 400);
    update.ad_account_ids = [...new Set(ids as string[])].slice(0, MAX_ACCOUNTS);
  }

  // Só liga com o que o painel precisa para ler: token e contas.
  if (update.enabled === true) {
    const source = (update.token_source as string | undefined) ?? current.token_source;
    const accounts = (update.ad_account_ids as string[] | undefined) ?? current.ad_account_ids;
    const typedToken = typeof body.access_token === "string" && body.access_token.trim().length > 0;
    let hasToken = typedToken;
    if (!hasToken && source === "own") {
      const { data: saved } = await supabase.from("panel_meta_tokens").select("organization_id").eq("organization_id", organizationId).maybeSingle();
      hasToken = Boolean(saved);
    }
    if (source === "own" && !hasToken) return json({ error: "Cole o token antes de ligar o painel." }, 400);
    if (source === "own" && accounts.length === 0) return json({ error: "Escolha pelo menos uma conta de anúncios antes de ligar o painel." }, 400);
  }

  const { error } = await supabase.from("panel_settings").upsert(update, { onConflict: "organization_id" });
  if (error) return json({ error: `Não foi possível salvar o painel: ${error.message}` }, 500);

  if (typeof body.access_token === "string") {
    const token = body.access_token.trim();
    if (token) {
      const encrypted = await encryptMetaToken(token);
      const { error: tokenError } = await supabase.from("panel_meta_tokens").upsert({
        organization_id: organizationId,
        encrypted_access_token: encrypted,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      });
      if (tokenError) return json({ error: `Não foi possível salvar o token: ${tokenError.message}` }, 500);
    } else {
      await supabase.from("panel_meta_tokens").delete().eq("organization_id", organizationId);
    }
  }

  // Configuração nova não pode servir números antigos do cache.
  await supabase.from("panel_meta_cache").delete().eq("organization_id", organizationId);
  return json({ success: true });
}

/**
 * Testa a conexão: com o token colado (ainda não salvo) ou com o já salvo, lista as contas de anúncio que ele
 * enxerga. O token nunca é devolvido nem registrado.
 */
async function handleListAccounts(req: Request, supabase: Supabase, body: Record<string, unknown>, organizationId: string) {
  await requireConfigurer(req, supabase, organizationId);
  const limited = rejectRateLimited(req, "panel-list-accounts", 10, 60_000, { ...corsHeaders, "Content-Type": "application/json" });
  if (limited) return limited;

  let token = typeof body.access_token === "string" ? body.access_token.trim() : "";
  if (!token) {
    const settings = await loadSettings(supabase, organizationId);
    token = (await resolveCredential(supabase, settings)).token;
  }
  if (!token) return json({ error: "Cole o token para testar a conexão." }, 400);
  if (token.length > 2000) return json({ error: "O token é grande demais. Confira se colou só o token." }, 400);

  try {
    const rows = await graphAll("me/adaccounts", { fields: "account_id,name,account_status,currency,business_name", limit: "100" }, token);
    const accounts = parseAdAccounts(rows);
    if (accounts.length === 0) {
      return json({ accounts: [], warning: "O token funciona, mas não enxerga nenhuma conta de anúncios. Dê acesso à conta ao usuário do sistema no Business Manager." });
    }
    return json({ accounts });
  } catch (error) {
    if (error instanceof MetaError) return json({ error: describeMetaError(error.code, error.message) }, 400);
    console.error("[panel-meta-insights] list_accounts", error instanceof Error ? error.message : String(error));
    return json({ error: "Não foi possível falar com a Meta agora. Tente de novo." }, 502);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Configuração do servidor incompleta." }, 500);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = typeof body.organization_id === "string" ? body.organization_id : "";
    if (!organizationId) throw new RequestAuthorizationError(400, "Organização não informada");

    switch (body.mode ?? "insights") {
      case "status":
        return await handleStatus(req, supabase, organizationId);
      case "insights":
        return await handleInsights(req, supabase, body, organizationId);
      case "set_goal":
        return await handleSetGoal(req, supabase, body, organizationId);
      case "configure":
        return await handleConfigure(req, supabase, body, organizationId);
      case "list_accounts":
        return await handleListAccounts(req, supabase, body, organizationId);
      default:
        return json({ error: "Modo desconhecido." }, 400);
    }
  } catch (error) {
    const authResponse = authorizationErrorResponse(error, corsHeaders);
    if (authResponse) return authResponse;
    console.error("[panel-meta-insights]", error);
    return json({ error: "Não foi possível carregar o painel. Tente novamente." }, 500);
  }
});
