import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFacebookDuplicateMetadata,
  findFacebookDuplicateReference,
  findLeadByFacebookLeadId,
} from './facebook-lead-policy.ts';

type LeadRow = {
  [key: string]: unknown;
  id: string;
  organization_id: string;
  facebook_lead_id?: string | null;
  telefone_lead?: string;
  email?: string | null;
  created_at: string;
};

type WebhookLogRow = {
  [key: string]: unknown;
  organization_id: string;
  facebook_lead_id: string;
  lead_id: string | null;
  status: string;
  created_at: string;
};

type ReceiptRow = {
  [key: string]: unknown;
  organization_id: string;
  facebook_lead_id: string;
  lead_id: string;
};

type QueryRow = LeadRow | WebhookLogRow | ReceiptRow;

class FakeLeadQuery {
  private filters: Array<(row: QueryRow) => boolean> = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitValue: number | null = null;
  private readonly rows: QueryRow[];

  constructor(rows: QueryRow[]) {
    this.rows = rows;
  }

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    assert.equal(operator, 'is');
    this.filters.push(row => row[column] !== value);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.orders.push({ column, ascending: options.ascending });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  async maybeSingle() {
    let matches = this.rows.filter(row => this.filters.every(filter => filter(row)));
    matches.sort((left, right) => {
      for (const order of this.orders) {
        const leftValue = String(left[order.column] ?? '');
        const rightValue = String(right[order.column] ?? '');
        const comparison = leftValue.localeCompare(rightValue);
        if (comparison !== 0) return order.ascending ? comparison : -comparison;
      }
      return 0;
    });
    if (this.limitValue !== null) matches = matches.slice(0, this.limitValue);
    return { data: matches[0] || null, error: null };
  }
}

class FakeSupabase {
  private readonly tables: Record<string, QueryRow[]>;

  constructor(
    leads: LeadRow[],
    logs: WebhookLogRow[] = [],
    receipts: ReceiptRow[] = [],
  ) {
    this.tables = {
      leads,
      facebook_webhook_logs: logs,
      facebook_lead_receipts: receipts,
    };
  }

  from(table: string) {
    assert.ok(table in this.tables, `tabela inesperada: ${table}`);
    return new FakeLeadQuery(this.tables[table]);
  }
}

const leads: LeadRow[] = [
  {
    id: 'oldest-phone',
    organization_id: 'org-1',
    facebook_lead_id: 'meta-1',
    telefone_lead: '+55 11 99999-0000',
    email: 'first@example.test',
    created_at: '2026-08-30T10:00:00.000Z',
  },
  {
    id: 'newer-phone',
    organization_id: 'org-1',
    facebook_lead_id: 'meta-2',
    telefone_lead: '+55 11 99999-0000',
    email: 'second@example.test',
    created_at: '2026-08-31T10:00:00.000Z',
  },
  {
    id: 'other-org',
    organization_id: 'org-2',
    facebook_lead_id: 'meta-1',
    telefone_lead: '+55 11 99999-0000',
    email: 'first@example.test',
    created_at: '2026-08-29T10:00:00.000Z',
  },
];

test('reentrega do mesmo facebook_lead_id e idempotente somente dentro da organizacao', async () => {
  const supabase = new FakeSupabase(leads, [
    {
      organization_id: 'org-1',
      facebook_lead_id: 'meta-legacy',
      lead_id: 'newer-phone',
      status: 'success',
      created_at: '2026-08-31T10:01:00.000Z',
    },
    {
      organization_id: 'org-1',
      facebook_lead_id: 'meta-blocked',
      lead_id: 'oldest-phone',
      status: 'duplicate',
      created_at: '2026-08-31T10:02:00.000Z',
    },
  ], [{
    organization_id: 'org-1',
    facebook_lead_id: 'meta-receipt',
    lead_id: 'oldest-phone',
  }]);

  assert.deepEqual(
    await findLeadByFacebookLeadId(supabase, 'org-1', 'meta-1'),
    { id: 'oldest-phone' },
  );
  assert.deepEqual(
    await findLeadByFacebookLeadId(supabase, 'org-2', 'meta-1'),
    { id: 'other-org' },
  );
  assert.deepEqual(
    await findLeadByFacebookLeadId(supabase, 'org-1', 'meta-legacy'),
    { id: 'newer-phone' },
  );
  assert.deepEqual(
    await findLeadByFacebookLeadId(supabase, 'org-1', 'meta-receipt'),
    { id: 'oldest-phone' },
  );
  assert.equal(await findLeadByFacebookLeadId(supabase, 'org-1', 'meta-blocked'), null);
  assert.equal(await findLeadByFacebookLeadId(supabase, 'org-1', 'meta-3'), null);
});

test('IDs Meta distintos com o mesmo telefone referenciam o card mais antigo sem bloquear', async () => {
  const supabase = new FakeSupabase(leads);
  const reference = await findFacebookDuplicateReference(
    supabase,
    'org-1',
    '+55 11 99999-0000',
    'second@example.test',
  );

  assert.deepEqual(reference, { id: 'oldest-phone', matchType: 'phone' });
  assert.deepEqual(
    addFacebookDuplicateMetadata({ facebook_lead_id: 'meta-3' }, reference),
    {
      facebook_lead_id: 'meta-3',
      is_duplicate: true,
      duplicate_of_lead_id: 'oldest-phone',
      duplicate_match_type: 'phone',
    },
  );
});

test('email e fallback e uma submissao sem coincidencia e marcada como nao duplicada', async () => {
  const supabase = new FakeSupabase(leads);
  const byEmail = await findFacebookDuplicateReference(
    supabase,
    'org-1',
    '',
    'second@example.test',
  );

  assert.deepEqual(byEmail, { id: 'newer-phone', matchType: 'email' });
  assert.deepEqual(
    addFacebookDuplicateMetadata({ facebook_lead_id: 'meta-new' }, null),
    { facebook_lead_id: 'meta-new', is_duplicate: false },
  );
});
