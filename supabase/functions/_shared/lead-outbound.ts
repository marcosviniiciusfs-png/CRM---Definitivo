// Consultas comuns de quem age sobre um lead pelo servidor (ações de etapa, lembretes).
// Recebe o client service role já criado.

// deno-lint-ignore no-explicit-any
type Supabase = any;

// Em produção o status fica em maiúsculas (CONNECTED / DISCONNECTED / WAITING_QR),
// o mesmo valor que send-whatsapp-message exige.
const CONNECTED = "CONNECTED";

// Coluna de tarefas concluídas: o banco de produção não tem kanban_columns.is_completion_stage,
// então a coluna é reconhecida pelo título ("Concluído", "Concluídas"...).
export function isDoneColumnTitle(title: string | null | undefined): boolean {
  return /^conclu/i.test(String(title ?? "").trim());
}

/** Canal do lead, se conectado e da mesma organização; senão o primeiro canal conectado da organização. */
export async function resolveLeadInstanceName(
  supabase: Supabase,
  lead: { organization_id: string | null; whatsapp_instance_id: string | null },
): Promise<string | null> {
  if (!lead.organization_id) return null;

  if (lead.whatsapp_instance_id) {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("instance_name, status, organization_id")
      .eq("id", lead.whatsapp_instance_id)
      .maybeSingle();
    if (data && data.organization_id === lead.organization_id && data.status === CONNECTED) {
      return data.instance_name;
    }
  }

  const { data } = await supabase
    .from("whatsapp_instances")
    .select("instance_name")
    .eq("organization_id", lead.organization_id)
    .eq("status", CONNECTED)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.instance_name ?? null;
}

/** Primeira coluna (não concluída) do primeiro quadro de tarefas da organização. */
export async function findFirstTaskColumnId(supabase: Supabase, organizationId: string): Promise<string | null> {
  const { data: board } = await supabase
    .from("kanban_boards")
    .select("id, kanban_columns(id, position, title)")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const columns = [...((board?.kanban_columns as {
    id: string;
    position: number | null;
    title: string | null;
  }[]) ?? [])]
    .filter((column) => !isDoneColumnTitle(column.title))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return columns[0]?.id ?? null;
}

export async function findOrganizationOwnerId(supabase: Supabase, organizationId: string): Promise<string | null> {
  const { data } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", organizationId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}
