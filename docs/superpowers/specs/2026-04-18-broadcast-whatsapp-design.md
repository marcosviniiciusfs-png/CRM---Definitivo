# Broadcast WhatsApp — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Problem

O Chat do CRM não possui funcionalidade de lista de transmissão (broadcast). Equipes precisam enviar a mesma mensagem para múltiplos leads individualmente, sem criar grupo, com controle de status por contato.

## Solution

Adicionar aba "Transmissão" na sidebar do Chat com criação de broadcast, disparo em batches via Edge Function, e acompanhamento em tempo real via postgres_changes.

## Architecture

### Execution Model — Frontend-orchestrated batches

O frontend controla o loop de envios para evitar timeout de Edge Functions:

1. Frontend cria broadcast + contatos no banco (`status: 'sending'`)
2. Frontend chama Edge Function com `{ broadcast_id, batch_size: 50 }`
3. Função processa até 50 contatos `pending`, retorna `{ processed: N, has_more: bool }`
4. Se `has_more`, frontend aguarda 1s e chama novamente
5. Ao finalizar, frontend marca broadcast como `completed`

**Cancelamento:** Frontend para de chamar, seta `status: 'cancelled'`, contatos pending viram `skipped`.

**Retomada:** Reabrir transmissão com contatos pending mostra botão "Retomar envio".

### Request Minimization

- Broadcasts list: 1 query com paginação (20 por página)
- Criação de broadcast: 1 insert em `broadcasts` + 1 batch insert em `broadcast_contacts`
- Envio: 1 chamada Edge Function por batch de 50 (não 1 por contato)
- Realtime: 1 canal `postgres_changes` por transmissão ativa (não por contato)
- Leads para seleção: reutiliza array `leads` já carregado no Chat.tsx

## Database

### Migration: `add_broadcast_tables.sql`

```sql
CREATE TABLE IF NOT EXISTS broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sending', 'completed', 'cancelled')),
  total_contacts INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  delay_seconds INT NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'error', 'skipped')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(broadcast_id, lead_id)
);

ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_broadcasts" ON broadcasts
  FOR ALL USING (organization_id = (
    SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "org_broadcast_contacts" ON broadcast_contacts
  FOR ALL USING (broadcast_id IN (
    SELECT id FROM broadcasts WHERE organization_id = (
      SELECT organization_id FROM profiles WHERE user_id = auth.uid() LIMIT 1
    )
  ));

CREATE INDEX IF NOT EXISTS idx_broadcasts_org ON broadcasts(organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_broadcast ON broadcast_contacts(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_status ON broadcast_contacts(status);
```

## Edge Function — `send-broadcast`

**Arquivo:** `supabase/functions/send-broadcast/index.ts`

### Input

```json
{ "broadcast_id": "uuid", "batch_size": 50 }
```

### Logic

1. Buscar broadcast + instância WhatsApp conectada da organização
2. Buscar até `batch_size` contatos com `status = 'pending'` ordenados por `created_at`
3. Para cada contato:
   - Substituir `{{nome}}` e `{{telefone}}` na mensagem
   - Chamar Evolution API `/message/sendText/{instance}`
   - Atualizar `broadcast_contacts.status` para `sent` ou `error`
   - Incrementar `broadcasts.sent_count` ou `error_count`
   - Aguardar `delay_seconds` entre envios
4. Retornar `{ processed: N, has_more: bool }`

### Error Handling

- Falha por contato: registra erro em `broadcast_contacts.error_message`, continua para o próximo
- Instância desconectada: retorna erro imediato, sem processar nenhum contato
- Sempre retorna `{ status: 200 }` no HTTP response (padrão do projeto)
- Usa `SUPABASE_SERVICE_ROLE_KEY` para updates no banco dentro da função

### Instance Lookup

Mesmo padrão de `send-whatsapp-message`:
```sql
SELECT instance_name FROM whatsapp_instances
WHERE organization_id = $orgId AND status = 'CONNECTED'
LIMIT 1
```

## Frontend — BroadcastPanel

**Arquivo:** `src/components/chat/BroadcastPanel.tsx`

### Props

```typescript
interface BroadcastPanelProps {
  organizationId: string;
  leads: Lead[];
}
```

Recebe `leads` já carregados do Chat.tsx — zero queries extras para lista de contatos.

### Views

#### View A — Lista de Transmissões (default)

- Header: "Transmissões" + botão "+ Nova"
- Lista paginada (20 por página) com: nome, badge status, progresso `X/Y`, data
- Badges: draft (cinza), sending (azul pulsante), completed (verde), cancelled (vermelho)
- Clique abre View B em modo detalhe
- "+ Nova" abre View B em modo criação
- Paginação via `range(from, to)` — carrega só o necessário

#### View B — Criar / Detalhar

**Modo criação:**

Passo 1 — Mensagem:
- Input: nome da transmissão
- Textarea: mensagem com suporte a `{{nome}}` e `{{telefone}}`
- Chips clicáveis para inserir variáveis no textarea
- Select: intervalo (2s, 3s, 5s, 10s)
- Preview com dados de exemplo ("João Silva" / "11999999999")

Passo 2 — Contatos:
- Busca por nome/telefone filtra array `leads` em memória (zero queries)
- Lista scrollável com checkbox (só leads com `telefone_lead` preenchido)
- Máx 500 contatos, mensagem máx 4096 chars
- Footer: "X selecionados" + "Disparar"

**Ao disparar:**
1. Insert em `broadcasts` com `status: 'sending'`
2. Batch insert em `broadcast_contacts` (todos de uma vez)
3. Iniciar loop de batches chamando Edge Function
4. Subscrever realtime channel para atualização de status
5. Redirecionar para View B modo detalhe

**Modo detalhe:**
- Nome, mensagem, barra de progresso (sent + error / total)
- Lista de contatos com status: ✅ enviado, ❌ erro, ⏳ pendente
- Botão "Cancelar" se `status: 'sending'`
- Botão "Retomar envio" se `status: 'sending'` com contatos pending (caso reabriu)
- Botão "Voltar" para View A

### Batch Sending Loop (no BroadcastPanel)

```typescript
async function runBroadcast(broadcastId: string) {
  let hasMore = true;
  while (hasMore && !cancelled) {
    const { data } = await supabase.functions.invoke('send-broadcast', {
      body: { broadcast_id: broadcastId, batch_size: 50 }
    });
    hasMore = data.has_more;
    if (hasMore) await sleep(1000);
  }
  if (!cancelled) {
    await supabase.from('broadcasts').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', broadcastId);
  }
}
```

### Realtime

Um canal por transmissão ativa:
```typescript
supabase.channel(`broadcast-${broadcastId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'broadcast_contacts',
    filter: `broadcast_id=eq.${broadcastId}`
  }, (payload) => {
    // Atualizar contato na lista local + contadores
  })
  .subscribe();
```

Limpar canal ao sair da View B ou desmontar componente.

### Permissions

- Members (`canViewAllLeads === false`): só veem e enviam para seus leads (`responsavel_user_id = user.id`)
- Admins/owners: veem todos os leads da organização
- Filtro aplicado na lista de seleção de contatos, não na Edge Function

## Types

**Arquivo:** `src/types/chat.ts` — adicionar:

```typescript
export interface Broadcast {
  id: string;
  organization_id: string;
  created_by: string;
  name: string;
  message_text: string;
  status: 'draft' | 'sending' | 'completed' | 'cancelled';
  total_contacts: number;
  sent_count: number;
  error_count: number;
  delay_seconds: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface BroadcastContact {
  id: string;
  broadcast_id: string;
  lead_id: string;
  phone: string;
  name: string;
  status: 'pending' | 'sent' | 'error' | 'skipped';
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
}
```

## Chat.tsx Changes

1. Adicionar `TabsTrigger value="broadcast"` com ícone `Radio` (lucide-react)
2. Adicionar `TabsContent value="broadcast"` com `<BroadcastPanel />`
3. Import BroadcastPanel
4. Repassar `organizationId` e `leads` como props
5. Nenhuma alteração nas abas "Tudo" e "Fixados"

## Files Summary

| Action | File |
|--------|------|
| CREATE | `supabase/migrations/[ts]_add_broadcast_tables.sql` |
| CREATE | `supabase/functions/send-broadcast/index.ts` |
| CREATE | `src/components/chat/BroadcastPanel.tsx` |
| MODIFY | `src/pages/Chat.tsx` |
| MODIFY | `src/types/chat.ts` |
| MODIFY | `src/components/chat/index.ts` |

## Validation Rules

- Mín 1 contato selecionado para disparar
- Máx 500 contatos por transmissão
- Mensagem máx 4096 caracteres
- WhatsApp deve estar conectado (validado na Edge Function)
- Pelo menos nome e mensagem preenchidos
