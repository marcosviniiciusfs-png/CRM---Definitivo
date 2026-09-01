export type FacebookDuplicateMatchType = 'phone' | 'email';

export interface FacebookLeadReference {
  id: string;
}

export interface FacebookDuplicateReference extends FacebookLeadReference {
  matchType: FacebookDuplicateMatchType;
}

type SupabaseQueryError = {
  message?: string;
};

type LeadQueryResult = {
  data: { id?: string; lead_id?: string | null; created_at?: string } | null;
  error: SupabaseQueryError | null;
};

type LeadQuery = {
  select: (columns: string) => LeadQuery;
  eq: (column: string, value: unknown) => LeadQuery;
  not: (column: string, operator: string, value: unknown) => LeadQuery;
  order: (column: string, options: { ascending: boolean }) => LeadQuery;
  limit: (value: number) => LeadQuery;
  maybeSingle: () => Promise<LeadQueryResult>;
};

type SupabaseAdmin = {
  from: (table: string) => LeadQuery;
};

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function throwQueryError(context: string, error: SupabaseQueryError | null | undefined): void {
  if (!error) return;
  throw new Error(`${context}: ${error.message || 'erro desconhecido'}`);
}

/**
 * Identifica uma reentrega do mesmo evento Meta. O banco tambem aplica uma
 * constraint UNIQUE como defesa contra duas entregas concorrentes.
 */
export async function findLeadByFacebookLeadId(
  supabase: SupabaseAdmin,
  organizationId: string,
  facebookLeadId: string,
): Promise<FacebookLeadReference | null> {
  const normalizedLeadId = nonEmpty(facebookLeadId);
  if (!normalizedLeadId) return null;

  const { data: leadData, error: leadError } = await supabase
    .from('leads')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('facebook_lead_id', normalizedLeadId)
    .maybeSingle();

  throwQueryError('Falha ao verificar idempotencia do lead Meta', leadError);
  if (typeof leadData?.id === 'string') return { id: leadData.id };

  // Recibos sao a fonte duravel para cards historicos e nao sofrem a limpeza
  // periodica aplicada a tabelas de log.
  const { data: receipt, error: receiptError } = await supabase
    .from('facebook_lead_receipts')
    .select('lead_id')
    .eq('organization_id', organizationId)
    .eq('facebook_lead_id', normalizedLeadId)
    .maybeSingle();

  throwQueryError('Falha ao verificar recibo historico do lead Meta', receiptError);
  if (typeof receipt?.lead_id === 'string') return { id: receipt.lead_id };

  // Fallback de rollout/diagnostico. Logs nao sao a fonte duravel porque podem
  // ser limpos; a migration copia os success historicos para receipts.
  const { data: successLog, error: successLogError } = await supabase
    .from('facebook_webhook_logs')
    .select('lead_id, created_at')
    .eq('organization_id', organizationId)
    .eq('facebook_lead_id', normalizedLeadId)
    .eq('status', 'success')
    .not('lead_id', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  throwQueryError('Falha ao verificar log historico do lead Meta', successLogError);
  return typeof successLog?.lead_id === 'string'
    ? { id: successLog.lead_id }
    : null;
}

async function findOldestMatchingLead(
  supabase: SupabaseAdmin,
  organizationId: string,
  column: 'telefone_lead' | 'email',
  value: string,
): Promise<FacebookLeadReference | null> {
  const { data, error } = await supabase
    .from('leads')
    .select('id, created_at')
    .eq('organization_id', organizationId)
    .eq(column, value)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  throwQueryError(`Falha ao procurar lead por ${column}`, error);
  return typeof data?.id === 'string' ? { id: data.id } : null;
}

/**
 * Encontra somente uma referencia informativa. Uma coincidencia de contato
 * nunca deve impedir a criacao de um novo card do Facebook.
 *
 * Mantem a precedencia historica: telefone primeiro, email como fallback.
 * Quando ja existem varios cards com o mesmo contato, referencia o mais antigo.
 */
export async function findFacebookDuplicateReference(
  supabase: SupabaseAdmin,
  organizationId: string,
  phone: string,
  email?: string | null,
): Promise<FacebookDuplicateReference | null> {
  const normalizedPhone = nonEmpty(phone);
  if (normalizedPhone) {
    const match = await findOldestMatchingLead(
      supabase,
      organizationId,
      'telefone_lead',
      normalizedPhone,
    );
    if (match) return { ...match, matchType: 'phone' };
  }

  const normalizedEmail = nonEmpty(email);
  if (normalizedEmail) {
    const match = await findOldestMatchingLead(
      supabase,
      organizationId,
      'email',
      normalizedEmail,
    );
    if (match) return { ...match, matchType: 'email' };
  }

  return null;
}

export function addFacebookDuplicateMetadata(
  additionalData: Record<string, unknown>,
  duplicateReference: FacebookDuplicateReference | null,
): Record<string, unknown> {
  if (!duplicateReference) {
    return {
      ...additionalData,
      is_duplicate: false,
    };
  }

  return {
    ...additionalData,
    is_duplicate: true,
    duplicate_of_lead_id: duplicateReference.id,
    duplicate_match_type: duplicateReference.matchType,
  };
}
