import { redistributeBatch } from "../supabase/functions/_shared/redistribute-batch.ts";

type Row = Record<string, unknown>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private limitValue: number | null = null;
  private updateValue: Row | null = null;
  private headCount = false;

  constructor(
    private db: FakeSupabase,
    private table: string,
  ) {}

  select(_columns = "*", options?: { head?: boolean }) {
    this.headCount = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    if (!column.includes(".")) this.filters.push(row => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }

  not() {
    return this;
  }

  or() {
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  update(value: Row) {
    this.updateValue = value;
    return this;
  }

  insert(value: Row | Row[]) {
    const rows = Array.isArray(value) ? value : [value];
    this.db.tables[this.table].push(...rows.map(row => ({ ...row })));
    return Promise.resolve({ data: rows, error: null });
  }

  maybeSingle() {
    return this.execute().then(result => ({
      data: Array.isArray(result.data) ? result.data[0] || null : result.data,
      error: result.error,
    }));
  }

  then(resolve: (value: { data: Row[] | null; count?: number; error: null }) => unknown) {
    return this.execute().then(resolve);
  }

  private async execute() {
    let rows = this.db.tables[this.table].filter(row => this.filters.every(filter => filter(row)));
    if (this.limitValue !== null) rows = rows.slice(0, this.limitValue);

    if (this.updateValue) {
      rows.forEach(row => Object.assign(row, this.updateValue));
    }

    return {
      data: this.headCount ? null : rows.map(row => ({ ...row })),
      count: this.headCount ? rows.length : undefined,
      error: null,
    };
  }
}

class FakeSupabase {
  tables: Record<string, Row[]>;

  constructor(eligibleAgents: string[]) {
    this.tables = {
      funnel_stages: [],
      leads: [
        { id: "lead-1", organization_id: "org-1", responsavel_user_id: "source", source: "manual", funnel_id: null },
        { id: "lead-2", organization_id: "org-1", responsavel_user_id: "source", source: "manual", funnel_id: null },
      ],
      lead_distribution_configs: [{
        id: "roulette-1",
        organization_id: "org-1",
        is_active: true,
        source_type: "all",
        funnel_id: null,
        funnel_stage_id: null,
        team_id: null,
        distribution_method: "round_robin",
        eligible_agents: eligibleAgents,
      }],
      agent_distribution_settings: [],
      organization_members: [
        { organization_id: "org-1", user_id: "source", is_active: true, email: "source@test.local" },
        { organization_id: "org-1", user_id: "destination", is_active: true, email: "destination@test.local" },
      ],
      profiles: [
        { user_id: "source", full_name: "Origem" },
        { user_id: "destination", full_name: "Destino" },
      ],
      lead_distribution_history: [],
    };
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("transfere leads atribuidos diretamente pela roleta sem desatribuir antes", async () => {
  const db = new FakeSupabase(["destination"]);
  const result = await redistributeBatch(db, "org-1", {
    configId: "roulette-1",
    leadIds: ["lead-1", "lead-2"],
    excludeUserIds: ["source"],
    requireUnassigned: false,
  });

  assert(result.redistributed === 2, "deveria redistribuir os dois leads");
  assert(db.tables.leads.every(lead => lead.responsavel_user_id === "destination"), "destino incorreto");
  assert(db.tables.lead_distribution_history.length === 2, "historico deveria registrar os dois leads");
});

Deno.test("mantem o comportamento padrao de processar apenas leads sem dono", async () => {
  const db = new FakeSupabase(["destination"]);
  const result = await redistributeBatch(db, "org-1", {
    configId: "roulette-1",
    leadIds: ["lead-1", "lead-2"],
  });

  assert(result.redistributed === 0, "nao deveria capturar leads ainda atribuidos no fluxo padrao");
  assert(db.tables.leads.every(lead => lead.responsavel_user_id === "source"), "responsavel original deve permanecer");
});

Deno.test("nao remove o responsavel quando a roleta nao tem outro destinatario", async () => {
  const db = new FakeSupabase(["source"]);
  const result = await redistributeBatch(db, "org-1", {
    configId: "roulette-1",
    leadIds: ["lead-1", "lead-2"],
    excludeUserIds: ["source"],
    requireUnassigned: false,
  });

  assert(result.redistributed === 0, "nao deveria redistribuir sem destinatario valido");
  assert(result.errors.length === 1, "deveria explicar por que a roleta nao pode ser usada");
  assert(db.tables.leads.every(lead => lead.responsavel_user_id === "source"), "responsavel original deve permanecer");
});

Deno.test("confirmacao usa uma unica modal e aguarda a redistribuicao", async () => {
  const component = await Deno.readTextFile(
    new URL("../src/components/roulette/RedistributeFromCollaboratorPanel.tsx", import.meta.url),
  );

  assert(!component.includes("<AlertDialog"), "nao deve aninhar AlertDialog dentro de Dialog");
  assert(component.includes("await onConfirm("), "a modal deve aguardar a mutation terminar");
  assert(component.includes('if (!open && isPending) return'), "nao deve fechar durante a redistribuicao");
});
