import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.81.0';

// ========================================
// CONFIGURAÇÃO CENTRALIZADA DA EVOLUTION API
// ========================================
// NÃO há mais fallback para IP hardcoded.
// Se EVOLUTION_API_URL não estiver configurada, a função falha com erro claro.

/**
 * Busca a URL da Evolution API a partir da variável de ambiente.
 * Retorna erro se não estiver configurada.
 */
export function getEvolutionApiUrl(): string {
  const url = Deno.env.get('EVOLUTION_API_URL')?.trim() || '';
  if (!url || !/^https?:\/\//.test(url)) {
    throw new Error('EVOLUTION_API_URL não configurada ou inválida. Configure a variável de ambiente no Supabase.');
  }
  return normalizeUrl(url);
}

/**
 * Busca a API key da Evolution API a partir da variável de ambiente.
 * Retorna erro se não estiver configurada.
 */
export function getEvolutionApiKey(): string {
  const key = Deno.env.get('EVOLUTION_API_KEY')?.trim() || '';
  if (!key) {
    throw new Error('EVOLUTION_API_KEY não configurada. Configure a variável de ambiente no Supabase.');
  }
  return key;
}

/**
 * Normaliza uma URL da Evolution API:
 * - Remove /manager no final
 * - Remove barras finais
 * - Remove espaços
 */
export function normalizeUrl(url: string): string {
  let normalized = url.trim();
  normalized = normalized.replace(/\/manager\/?$/i, '');
  normalized = normalized.replace(/\/+$/, '');

  // Remover barras duplas EXCETO no protocolo (https:// ou http://)
  normalized = normalized.replace(/(https?:\/\/)|(\/\/)/g, (match) => {
    return match.includes('://') ? match : '/';
  });

  return normalized;
}

/**
 * Mapeia o estado retornado pela Evolution API para o status usado no banco.
 * Estados possíveis da Evolution: "open", "close", "connecting", "qr"
 * Status no banco: "CONNECTED", "DISCONNECTED", "WAITING_QR", "CREATING"
 */
export function mapEvolutionState(state: string | undefined | null): string {
  if (!state) return 'DISCONNECTED';

  const normalized = state.toLowerCase().trim();

  if (normalized === 'open' || normalized === 'connected') return 'CONNECTED';
  if (normalized === 'connecting' || normalized === 'qr') return 'WAITING_QR';
  if (normalized === 'close' || normalized === 'disconnected') return 'DISCONNECTED';

  return 'DISCONNECTED';
}

/**
 * Verifica se um estado da Evolution API indica que está conectado.
 */
export function isConnectedState(state: string | undefined | null): boolean {
  if (!state) return false;
  const normalized = state.toLowerCase().trim();
  return normalized === 'open' || normalized === 'connected';
}

/**
 * Formata um número de telefone para o formato JID do WhatsApp.
 * Remove todos os caracteres não numéricos e adiciona @s.whatsapp.net
 */
export function formatPhoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!digits || digits.length < 8) {
    throw new Error(`Número de telefone inválido: "${phone}"`);
  }
  return `${digits}@s.whatsapp.net`;
}

/**
 * Extrai apenas os dígitos de um telefone/JID.
 * Remove sufixos como @s.whatsapp.net, @lid, @g.us, @c.us
 */
export function extractPhoneNumber(jidOrPhone: string): string {
  return jidOrPhone
    .replace(/@s\.whatsapp\.net|@lid|@g\.us|@c\.us/g, '')
    .replace(/\D/g, '')
    .trim();
}

/**
 * Cria um cliente Supabase admin (service role).
 * Deve ser criado uma vez por função, não múltiplas vezes.
 */
export function createSupabaseAdmin() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configurados.');
  }

  return createClient(url, key);
}