# Lead Import Deduplication Design

**Date:** 2026-04-16
**Status:** Approved

## Problem

CSV lead import fails with `duplicate key value violates unique constraint "leads_telefone_lead_organization_id_key"`. Root causes:

1. **Deduplication runs AFTER insert** — `checkAndRegisterDuplicates()` executes in background after `insert()`, but the unique constraint already rejected the row
2. **Entire chunk fails for 1 duplicate** — chunk of 25 leads all get marked as errors when 1 is duplicate
3. **No duplicate category in results** — only `success` and `errors`, no distinction between duplicates and real errors

## Solution: Pre-check + Client-side Separation

### Flow

```
CSV Upload → Parse → Map → Configure
  → Pre-check: 1 query fetches existing phones for org
  → Split leads: newLeads[] vs duplicateLeads[]
  → Bulk insert only newLeads (chunks of 25)
  → Results screen with 3 categories:
      ✅ imported | ⚠️ duplicates (with actions) | ❌ errors
  → User decides per-duplicate: "Update" or "Ignore"
  → "Update" overwrites basic fields (nome, email, empresa, valor, descricao_negocio, source)
```

### Changes

**File: `src/components/ImportLeadsModal.tsx`** (only file modified)

#### 1. New state variables

```typescript
const [duplicateLeads, setDuplicateLeads] = useState<DuplicateLead[]>([]);
```

Where `DuplicateLead` tracks:
- `newData` — the lead object from CSV
- `existingData` — the existing lead from DB (id, nome, telefone, email, empresa, etc.)
- `action` — "pending" | "update" | "ignore"

#### 2. New function: `preCheckDuplicates()`

Before inserting, query all existing leads matching the phones being imported:

```typescript
const phones = validLeads.map(l => l.telefone_lead).filter(Boolean);
const { data: existing } = await supabase
  .from("leads")
  .select("id, nome_lead, telefone_lead, email, empresa, valor, source, descricao_negocio")
  .eq("organization_id", organizationId)
  .in("telefone_lead", phones);
```

Split `validLeads` into:
- `newLeads` — phones not in existing set
- `duplicateLeads` — phones that match, paired with existing data

#### 3. Modified `handleImport()`

- Call `preCheckDuplicates()` first
- Insert only `newLeads` in bulk chunks
- No more duplicate errors in insert
- Set `duplicateLeads` state for results screen

#### 4. New function: `handleUpdateDuplicate(existingId, newData)`

Updates an existing lead with new CSV data:

```typescript
await supabase.from("leads").update({
  nome_lead: newData.nome_lead,
  email: newData.email,
  empresa: newData.empresa,
  valor: newData.valor,
  source: newData.source,
  descricao_negocio: newData.descricao_negocio,
}).eq("id", existingId);
```

Only basic fields are overwritten. Funnel/stage/responsavel are preserved.

#### 5. Redesigned Step 4 (Results)

Three cards at top:
- **Verde**: X leads importados (new)
- **Amarelo**: Y leads duplicados (with count of updated vs ignored)
- **Vermelho**: Z erros (invalid rows missing required fields)

Below the cards, expandable list of duplicates showing:
- Lead name and phone (old vs new side by side)
- "Atualizar" button (calls `handleUpdateDuplicate`)
- "Ignorar" button (marks as ignored)

Mass actions: "Atualizar Todos" / "Ignorar Todos"

#### 6. Phone normalization

Already exists: `String(value).replace(/\D/g, "")` on line 399.
Applied consistently in both pre-check and insert.

### Performance

- 1 pre-check query (select phones only, indexed)
- Bulk inserts in chunks of 25 (existing pattern)
- Individual updates only when user explicitly chooses "Atualizar"
- No unnecessary queries

### Error handling

- 401 (Unauthorized): Show clear message, suggest page reload
- Network errors: Retry once, then mark as error
- Empty required fields: Filtered out before import, counted as errors

## Scope

Single file change: `ImportLeadsModal.tsx`. No database migrations. No new API endpoints.
