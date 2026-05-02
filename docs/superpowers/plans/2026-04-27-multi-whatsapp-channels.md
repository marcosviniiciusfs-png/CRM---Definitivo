# Multi-WhatsApp: Canais com Múltiplos Números

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir até 5 números WhatsApp conectados como canais nomeados, com seletor de canal no Chat para separar conversas por número.

**Architecture:** Adicionar `whatsapp_instance_id` em `leads` e `channel_name`/`channel_color` em `whatsapp_instances`. O webhook associa leads ao canal automaticamente. O Chat filtra por canal. A página Integrações usa card compacto que abre modal de gestão.

**Tech Stack:** Supabase (PostgreSQL + Edge Functions/Deno), React, TypeScript, TanStack Query, shadcn/ui

---

## File Structure

| Ação | Arquivo | Responsabilidade |
|---|---|---|
| Create | `supabase/migrations/XXXXXX_multi_whatsapp_channels.sql` | Migration: novas colunas + backfill |
| Modify | `src/types/chat.ts` | Adicionar `whatsapp_instance_id` no tipo `Lead` |
| Create | `src/types/whatsapp-channel.ts` | Tipo `WhatsAppChannel` compartilhado |
| Create | `src/components/WhatsAppChannelModal.tsx` | Modal de gestão de canais na página Integrações |
| Create | `src/components/ChannelSelector.tsx` | Dropdown seletor de canal no Chat |
| Modify | `src/pages/Integrations.tsx` | Card WhatsApp → badge "N ativos" + abre modal |
| Modify | `src/pages/Chat.tsx` | Seletor de canal + filtro + barra colorida + envio por instância |
| Modify | `supabase/functions/create-whatsapp-instance/index.ts` | Aceitar `channel_name`, validar limite 5, atribuir cor |
| Modify | `supabase/functions/whatsapp-message-webhook/index.ts` | Associar `whatsapp_instance_id` ao lead |
| Modify | `supabase/functions/send-whatsapp-message/index.ts` | Buscar instância pelo `whatsapp_instance_id` do lead |
| Modify | `supabase/functions/send-whatsapp-media/index.ts` | Mesmo: buscar instância pelo `whatsapp_instance_id` do lead |
| Modify | `supabase/functions/check-whatsapp-status/index.ts` | Retornar `channel_name` e `channel_color` |

---

## Tarefa 1: Migration do banco de dados

**Arquivos:**
- Criar: `supabase/migrations/XXXXXX_multi_whatsapp_channels.sql`

- [ ] **Passo 1: Criar migration com novas colunas**

```sql
-- 1. Adicionar nome do canal e cor na tabela whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_name TEXT;

ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS channel_color TEXT DEFAULT '#25D366';

-- 2. Adicionar referencia ao canal na tabela leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID
  REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

-- 3. Índice para queries de filtro por canal no Chat
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_instance
  ON public.leads(whatsapp_instance_id)
  WHERE whatsapp_instance_id IS NOT NULL;

-- 4. Backfill: associar leads WhatsApp existentes à instância ativa da org
UPDATE public.leads l
SET whatsapp_instance_id = wi.id
FROM public.whatsapp_instances wi
WHERE l.organization_id = wi.organization_id
  AND wi.status = 'CONNECTED'
  AND l.whatsapp_instance_id IS NULL
  AND (l.source = 'WhatsApp' OR l.source = 'whatsapp');

-- 5. Atribuir nome padrão para instâncias existentes sem channel_name
UPDATE public.whatsapp_instances
SET channel_name = 'WhatsApp Principal'
WHERE channel_name IS NULL AND status = 'CONNECTED';
```

- [ ] **Passo 2: Executar migration no Supabase**

```bash
npx supabase db push
```

- [ ] **Passo 3: Verificar colunas criadas**

```bash
npx supabase db execute --sql "SELECT column_name, data_type FROM information_schema.columns WHERE table_name IN ('whatsapp_instances', 'leads') AND column_name IN ('channel_name', 'channel_color', 'whatsapp_instance_id') ORDER BY table_name, column_name;"
```

Esperado: 3 linhas (channel_name, channel_color em whatsapp_instances; whatsapp_instance_id em leads)

- [ ] **Passo 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: migration para multi-canais WhatsApp (channel_name, channel_color, whatsapp_instance_id)"
```

---

## Tarefa 2: Tipos TypeScript

**Arquivos:**
- Modificar: `src/types/chat.ts:1-28`
- Criar: `src/types/whatsapp-channel.ts`

- [ ] **Passo 1: Adicionar `whatsapp_instance_id` no tipo Lead**

Em `src/types/chat.ts`, adicionar campo no final da interface `Lead` (antes da chave de fechamento):

```typescript
  whatsapp_instance_id?: string | null;
```

O campo fica após `additional_data?: any;` na linha 27.

- [ ] **Passo 2: Criar tipo WhatsAppChannel**

Criar `src/types/whatsapp-channel.ts`:

```typescript
export interface WhatsAppChannel {
  id: string;
  instance_name: string;
  channel_name: string | null;
  channel_color: string;
  status: string;
  phone_number: string | null;
  created_at: string;
  connected_at: string | null;
}
```

- [ ] **Passo 3: Commit**

```bash
git add src/types/chat.ts src/types/whatsapp-channel.ts
git commit -m "feat: tipos TypeScript para multi-canais WhatsApp"
```

---

## Tarefa 3: Edge Function create-whatsapp-instance (limite + canal)

**Arquivos:**
- Modificar: `supabase/functions/create-whatsapp-instance/index.ts`

- [ ] **Passo 1: Adicionar validação de limite de 5 canais**

No início do `serve()`, após obter `orgId` (linha ~480), adicionar validação antes de criar a instância:

```typescript
// Após obter orgId (~linha 480)
// VALIDAÇÃO: Limite de 5 canais por organização
if (orgId) {
  const { count, error: countError } = await supabase
    .from('whatsapp_instances')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if (countError) {
    console.error('❌ Error counting instances:', countError);
  } else if (count && count >= 5) {
    throw new Error('Limite de 5 canais WhatsApp atingido. Desconecte um canal para conectar um novo.');
  }
}
```

- [ ] **Passo 2: Aceitar `channel_name` no request e atribuir cor**

Após `interface CreateInstanceRequest` (linha ~13), adicionar paleta de cores e extrair channel_name do body:

```typescript
const CHANNEL_COLORS = ['#25D366', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];
```

Dentro do `serve()`, após `const instanceName = ...` (linha ~335), adicionar:

```typescript
// Extrair channel_name do body
let body: { userId?: string; channel_name?: string } = {};
try { body = await req.clone().json(); } catch {}
const channelName = body.channel_name?.trim() || `Canal ${Date.now()}`;

// Determinar cor do canal baseado na quantidade existente
let channelColor = CHANNEL_COLORS[0];
if (orgId) {
  const { count: existingCount } = await supabase
    .from('whatsapp_instances')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId);
  channelColor = CHANNEL_COLORS[(existingCount || 0) % CHANNEL_COLORS.length];
}
```

- [ ] **Passo 3: Salvar channel_name e channel_color no insert do banco**

No `supabase.from('whatsapp_instances').insert({...})` (linha ~496), adicionar campos:

```typescript
channel_name: channelName,
channel_color: channelColor,
```

- [ ] **Passo 4: Commit**

```bash
git add supabase/functions/create-whatsapp-instance/index.ts
git commit -m "feat: create-whatsapp-instance aceita channel_name e valida limite 5"
```

---

## Tarefa 4: Edge Function whatsapp-message-webhook (associar canal ao lead)

**Arquivos:**
- Modificar: `supabase/functions/whatsapp-message-webhook/index.ts`

- [ ] **Passo 1: Buscar instance_id ao processar mensagem**

Após `const instance = payload.instance;` (linha ~157), buscar o ID da instância no banco:

```typescript
// Buscar ID da instância para associar ao lead
const { data: instanceRecord } = await supabase
  .from('whatsapp_instances')
  .select('id, organization_id')
  .eq('instance_name', instance)
  .maybeSingle();

const instanceId = instanceRecord?.id || null;
```

- [ ] **Passo 2: Ao criar lead novo, incluir whatsapp_instance_id**

No `supabase.from('leads').insert({...})` (linha ~908), adicionar campo:

```typescript
whatsapp_instance_id: instanceId,
```

- [ ] **Passo 3: Ao atualizar lead existente sem canal, associar**

Após encontrar o lead existente (linha ~732), se o lead não tem `whatsapp_instance_id`, atualizar:

```typescript
// Associar lead ao canal se ainda não estiver associado
if (existingLead && instanceId) {
  // Buscar whatsapp_instance_id do lead existente
  const { data: leadWithChannel } = await supabase
    .from('leads')
    .select('whatsapp_instance_id')
    .eq('id', existingLead.id)
    .single();

  if (leadWithChannel && !leadWithChannel.whatsapp_instance_id) {
    await supabase
      .from('leads')
      .update({ whatsapp_instance_id: instanceId })
      .eq('id', existingLead.id);
  }
}
```

Nota: estender o select na linha 719 para incluir `whatsapp_instance_id`:

```typescript
.select('id, nome_lead, funnel_id, funnel_stage_id, whatsapp_instance_id')
```

- [ ] **Passo 4: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat: webhook associa whatsapp_instance_id ao lead"
```

---

## Tarefa 5: Edge Functions send-whatsapp-message e send-whatsapp-media

**Arquivos:**
- Modificar: `supabase/functions/send-whatsapp-message/index.ts`
- Modificar: `supabase/functions/send-whatsapp-media/index.ts`

- [ ] **Passo 1: send-whatsapp-message — buscar instância por lead**

Substituir a lógica atual que busca a primeira instância CONNECTED por uma que busca a instância específica do lead.

Localizar o bloco que faz `.from('whatsapp_instances').select(...).eq('status', 'CONNECTED').limit(1).maybeSingle()` e substituir por:

```typescript
// Buscar instância do canal do lead
let instanceQuery = supabase
  .from('whatsapp_instances')
  .select('instance_name, status')
  .eq('status', 'CONNECTED');

// Se leadId fornecido, buscar pelo canal do lead
if (leadId) {
  const { data: leadData } = await supabase
    .from('leads')
    .select('whatsapp_instance_id')
    .eq('id', leadId)
    .maybeSingle();

  if (leadData?.whatsapp_instance_id) {
    instanceQuery = instanceQuery.eq('id', leadData.whatsapp_instance_id);
  }
}

const { data: instanceData, error: instanceError } = await instanceQuery.maybeSingle();
```

- [ ] **Passo 2: send-whatsapp-media — mesma mudança**

Aplicar a mesma lógica no `send-whatsapp-media/index.ts`, usando o `leadId` do body para buscar a instância correta.

- [ ] **Passo 3: Commit**

```bash
git add supabase/functions/send-whatsapp-message/index.ts supabase/functions/send-whatsapp-media/index.ts
git commit -m "feat: send-whatsapp-message/media buscam instância pelo canal do lead"
```

---

## Tarefa 6: Edge Function check-whatsapp-status (retornar dados do canal)

**Arquivos:**
- Modificar: `supabase/functions/check-whatsapp-status/index.ts`

- [ ] **Passo 1: Incluir channel_name e channel_color na query**

Na query que busca instâncias do banco, adicionar campos:

```typescript
.select('id, instance_name, status, phone_number, channel_name, channel_color')
```

- [ ] **Passo 2: Incluir dados do canal na resposta**

Na resposta JSON, adicionar campos do canal:

```typescript
channel_name: instance.channel_name || instance.instance_name,
channel_color: instance.channel_color || '#25D366',
```

- [ ] **Passo 3: Commit**

```bash
git add supabase/functions/check-whatsapp-status/index.ts
git commit -m "feat: check-whatsapp-status retorna channel_name e channel_color"
```

---

## Tarefa 7: Componente WhatsAppChannelModal

**Arquivos:**
- Criar: `src/components/WhatsAppChannelModal.tsx`

- [ ] **Passo 1: Criar modal de gestão de canais**

Criar `src/components/WhatsAppChannelModal.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import WhatsAppConnection from "@/components/WhatsAppConnection";

const MAX_CHANNELS = 5;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  canManage: boolean;
}

export function WhatsAppChannelModal({ open, onOpenChange, organizationId, canManage }: Props) {
  const { toast } = useToast();
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [leadCounts, setLeadCounts] = useState<Record<string, number>>({});

  const loadChannels = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("whatsapp_instances")
      .select("id, instance_name, channel_name, channel_color, status, phone_number, created_at, connected_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Erro ao carregar canais", description: error.message, variant: "destructive" });
    } else {
      setChannels((data || []) as WhatsAppChannel[]);
    }
    setLoading(false);
  }, [organizationId, toast]);

  // Carregar contagem de leads por canal
  const loadLeadCounts = useCallback(async (channelIds: string[]) => {
    if (channelIds.length === 0) return;
    const { data } = await supabase
      .from("leads")
      .select("whatsapp_instance_id")
      .in("whatsapp_instance_id", channelIds);

    const counts: Record<string, number> = {};
    (data || []).forEach((l: any) => {
      const id = l.whatsapp_instance_id;
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    setLeadCounts(counts);
  }, []);

  useEffect(() => {
    if (open) {
      loadChannels();
    }
  }, [open, loadChannels]);

  useEffect(() => {
    if (channels.length > 0) {
      loadLeadCounts(channels.map((c) => c.id));
    }
  }, [channels, loadLeadCounts]);

  const handleSaveName = async (channelId: string) => {
    if (!editName.trim()) return;
    const { error } = await supabase
      .from("whatsapp_instances")
      .update({ channel_name: editName.trim() })
      .eq("id", channelId);

    if (error) {
      toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
    } else {
      setChannels((prev) =>
        prev.map((c) => (c.id === channelId ? { ...c, channel_name: editName.trim() } : c))
      );
      setEditingId(null);
    }
  };

  const handleDisconnect = async (channel: WhatsAppChannel) => {
    const { error } = await supabase.functions.invoke("disconnect-whatsapp-instance", {
      body: { instance_name: channel.instance_name },
    });

    if (error) {
      toast({ title: "Erro ao desconectar", variant: "destructive" });
    } else {
      toast({ title: "Canal desconectado" });
      loadChannels();
    }
  };

  const connectedCount = channels.filter((c) => c.status === "CONNECTED").length;
  const remaining = MAX_CHANNELS - channels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#25D366]/15 flex items-center justify-center text-base">
              💬
            </div>
            <div>
              <h3 className="font-semibold text-[15px]">Canais WhatsApp</h3>
              <p className="text-[11px] text-muted-foreground">
                {connectedCount} de {MAX_CHANNELS} canais conectados
              </p>
            </div>
          </div>
        </div>

        {/* Channel List */}
        <div className="px-4 py-2 max-h-[320px] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              Nenhum canal conectado
            </div>
          ) : (
            channels.map((channel) => (
              <div
                key={channel.id}
                className="flex items-center gap-3 py-3 border-b last:border-b-0"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                  style={{ background: `${channel.channel_color}20` }}
                >
                  📱
                </div>
                <div className="flex-1 min-w-0">
                  {editingId === channel.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-xs"
                        autoFocus
                        onKeyDown={(e) => e.key === "Enter" && handleSaveName(channel.id)}
                      />
                      <Button size="sm" variant="default" className="h-7 text-[11px] px-3" onClick={() => handleSaveName(channel.id)}>Salvar</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => setEditingId(null)}>✕</Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-medium truncate">
                          {channel.channel_name || channel.instance_name}
                        </span>
                        {channel.status === "CONNECTED" && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#25D366] flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {channel.phone_number || "Aguardando..."}
                        {leadCounts[channel.id] != null && ` · ${leadCounts[channel.id]} leads`}
                      </div>
                    </>
                  )}
                </div>
                {editingId !== channel.id && canManage && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2.5"
                      onClick={() => { setEditingId(channel.id); setEditName(channel.channel_name || channel.instance_name); }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[10px] px-2.5 text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => handleDisconnect(channel)}
                    >
                      Desconectar
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t">
          {showConnect ? (
            <div className="space-y-3">
              <WhatsAppConnection onConnected={() => { setShowConnect(false); loadChannels(); }} />
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowConnect(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              className="w-full bg-[#25D366] hover:bg-[#20bd5a] text-white text-[13px] font-semibold h-9"
              disabled={remaining <= 0 || !canManage}
              onClick={() => setShowConnect(true)}
            >
              + Conectar novo canal {remaining > 0 ? `(${remaining} restante${remaining !== 1 ? "s" : ""})` : "(limite atingido)"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Passo 2: Commit**

```bash
git add src/components/WhatsAppChannelModal.tsx src/types/whatsapp-channel.ts
git commit -m "feat: componente WhatsAppChannelModal para gestão de canais"
```

---

## Tarefa 8: Página Integrações — Card com badge + modal

**Arquivos:**
- Modificar: `src/pages/Integrations.tsx`

- [ ] **Passo 1: Importar WhatsAppChannelModal**

Após o import do `WhatsAppConnection` (linha 8), adicionar:

```typescript
import { WhatsAppChannelModal } from "@/components/WhatsAppChannelModal";
```

- [ ] **Passo 2: Substituir WhatsAppCard**

Modificar a função `WhatsAppCard` (linhas 119-218) para exibir badge "N ativos" e abrir modal ao invés do dialog antigo. O card recolhido mostra:
- Ícone + "WhatsApp" + "Mensagens" + badge "N ativos" (com bolinha verde) quando conectado
- Ícone + "WhatsApp" + descrição + botão "Conectar" quando sem canais
- Ao clicar no card inteiro → abre modal de canais

- [ ] **Passo 3: Substituir dialog antigo pelo modal de canais**

Substituir o bloco `<Dialog open={showWhatsApp}...>` (linhas 823-829) por:

```tsx
<WhatsAppChannelModal
  open={showWhatsApp}
  onOpenChange={setShowWhatsApp}
  organizationId={organizationId}
  canManage={isAdmin}
/>
```

- [ ] **Passo 4: Atualizar query de instâncias**

Modificar a query na linha 554 para buscar dados do canal:

```typescript
supabase.from("whatsapp_instances").select("id, status, channel_name, channel_color, phone_number").eq("organization_id", organizationId),
```

- [ ] **Passo 5: Commit**

```bash
git add src/pages/Integrations.tsx
git commit -m "feat: integrações com card compacto e modal de canais WhatsApp"
```

---

## Tarefa 9: Componente ChannelSelector para o Chat

**Arquivos:**
- Criar: `src/components/ChannelSelector.tsx`

- [ ] **Passo 1: Criar dropdown seletor de canal**

Criar `src/components/ChannelSelector.tsx`:

```tsx
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppChannel } from "@/types/whatsapp-channel";
import { useEffect, useState } from "react";

interface Props {
  organizationId: string;
  selectedChannelId: string | null; // null = "Todos"
  onChannelChange: (channelId: string | null) => void;
}

export function ChannelSelector({ organizationId, selectedChannelId, onChannelChange }: Props) {
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);

  useEffect(() => {
    if (!organizationId) return;

    supabase
      .from("whatsapp_instances")
      .select("id, instance_name, channel_name, channel_color, status")
      .eq("organization_id", organizationId)
      .eq("status", "CONNECTED")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setChannels((data || []) as WhatsAppChannel[]);
      });
  }, [organizationId]);

  if (channels.length <= 1) return null; // Não mostrar seletor com 0 ou 1 canal

  return (
    <div className="px-3 pb-1">
      <select
        value={selectedChannelId || ""}
        onChange={(e) => onChannelChange(e.target.value || null)}
        className="w-full text-[12px] bg-muted/50 border border-border rounded-lg px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
      >
        <option value="">Todos os canais</option>
        {channels.map((ch) => (
          <option key={ch.id} value={ch.id}>
            {ch.channel_name || ch.instance_name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Passo 2: Commit**

```bash
git add src/components/ChannelSelector.tsx
git commit -m "feat: componente ChannelSelector para filtro por canal no Chat"
```

---

## Tarefa 10: Página Chat — seletor de canal + filtro + barra colorida

**Arquivos:**
- Modificar: `src/pages/Chat.tsx`

- [ ] **Passo 1: Importar ChannelSelector e tipos**

Após os imports existentes, adicionar:

```typescript
import { ChannelSelector } from "@/components/ChannelSelector";
```

- [ ] **Passo 2: Adicionar estado do canal selecionado**

Após os estados existentes (após ~linha 108), adicionar:

```typescript
const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
```

- [ ] **Passo 3: Carregar dados dos canais**

Dentro de `loadAllChatData`, após carregar leads, buscar canais:

```typescript
// Após setLeads(leadsData) (~linha 502)
// Carregar canais WhatsApp
const { data: channelsData } = await supabase
  .from("whatsapp_instances")
  .select("id, instance_name, channel_name, channel_color, status")
  .eq("organization_id", orgMember.organization_id)
  .eq("status", "CONNECTED")
  .order("created_at", { ascending: true });

// Armazenar em ref para uso no componente
channelsRef.current = (channelsData || []) as any[];
```

Adicionar uma ref no topo do componente:

```typescript
const channelsRef = useRef<any[]>([]);
```

- [ ] **Passo 4: Filtrar leads por canal no baseFilteredLeads**

Modificar o `baseFilteredLeads` (linha ~1083) para incluir filtro de canal:

```typescript
const baseFilteredLeads = useMemo(() => leads.filter((lead) => {
  const matchesSearch = lead.nome_lead.toLowerCase().includes(searchQuery.toLowerCase()) || lead.telefone_lead.includes(searchQuery);
  const matchesChannel = !selectedChannelId || lead.whatsapp_instance_id === selectedChannelId;
  if (selectedTagIds.length > 0) {
    const leadTags = leadTagsMap.get(lead.id) || [];
    return matchesSearch && matchesChannel && selectedTagIds.some((tagId) => leadTags.includes(tagId));
  }
  return matchesSearch && matchesChannel;
}), [leads, searchQuery, selectedTagIds, leadTagsMap, selectedChannelId]);
```

- [ ] **Passo 5: Estender query de leads para incluir whatsapp_instance_id**

Na query `leadsQuery` (linha ~477), adicionar `whatsapp_instance_id` no select:

```typescript
.select("id, nome_lead, telefone_lead, email, stage, avatar_url, is_online, last_seen, last_message_at, source, responsavel, responsavel_user_id, created_at, updated_at, organization_id, whatsapp_instance_id")
```

- [ ] **Passo 6: Adicionar barra colorida ao lado de cada conversa**

No render da lista de conversas, para cada lead, adicionar indicador de canal. Buscar a cor do canal a partir de `channelsRef`:

```typescript
// Helper para obter cor do canal de um lead
const getChannelColor = (lead: Lead): string | null => {
  if (!lead.whatsapp_instance_id) return null;
  const channel = channelsRef.current.find(c => c.id === lead.whatsapp_instance_id);
  return channel?.channel_color || null;
};
```

Na renderização de cada item da lista de leads (pinnedFilteredLeads e unpinnedFilteredLeads), adicionar barra colorida ao lado:

```tsx
{/* Barra de canal — dentro do container do item da conversa */}
{getChannelColor(lead) && (
  <div
    className="absolute right-0 top-1/2 -translate-y-1/2 w-[4px] h-6 rounded-l"
    style={{ backgroundColor: getChannelColor(lead) }}
    title={channelsRef.current.find(c => c.id === lead.whatsapp_instance_id)?.channel_name || ''}
  />
)}
```

Importante: o container do item precisa ter `className` com `relative` para posicionar a barra.

- [ ] **Passo 7: Adicionar ChannelSelector no sidebar**

No JSX do sidebar, acima da lista de conversas e abaixo do header "Conversas", adicionar:

```tsx
<ChannelSelector
  organizationId={orgId}
  selectedChannelId={selectedChannelId}
  onChannelChange={setSelectedChannelId}
/>
```

- [ ] **Passo 8: Buscar instância específica ao enviar mensagens**

Nos handlers de envio de mensagem (texto, áudio, arquivo), substituir a busca `limit(1).maybeSingle()` pela busca da instância específica do lead. Para cada handler:

```typescript
// Antes (buscar primeira instância conectada):
// const { data: instanceData } = await supabase.from("whatsapp_instances")
//   .select("instance_name").eq("organization_id", ...).eq("status", "CONNECTED").limit(1).maybeSingle();

// Depois (buscar instância do canal do lead):
let instanceQuery = supabase
  .from("whatsapp_instances")
  .select("instance_name")
  .eq("organization_id", memberData.organization_id)
  .eq("status", "CONNECTED");

if (selectedLead.whatsapp_instance_id) {
  instanceQuery = instanceQuery.eq("id", selectedLead.whatsapp_instance_id);
}

const { data: instanceData } = await instanceQuery.maybeSingle();
```

- [ ] **Passo 9: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat: Chat com seletor de canal, barra colorida e envio por instância"
```

---

## Tarefa 11: WhatsAppConnection — nome do canal ao conectar

**Arquivos:**
- Modificar: `src/components/WhatsAppConnection.tsx`

- [ ] **Passo 1: Adicionar input de nome do canal**

Antes de chamar `create-whatsapp-instance`, exibir um campo para o usuário nomear o canal. Após o QR code ser exibido ou na etapa anterior à conexão, adicionar:

- Input para nome do canal (ex: "Vendas Principal")
- Enviar `channel_name` no body da chamada à Edge Function

Na chamada `supabase.functions.invoke("create-whatsapp-instance", ...)`, adicionar `channel_name` no body:

```typescript
body: { channel_name: channelName }
```

- [ ] **Passo 2: Commit**

```bash
git add src/components/WhatsAppConnection.tsx
git commit -m "feat: WhatsAppConnection pede nome do canal ao conectar"
```

---

## Tarefa 12: Deploy das Edge Functions e teste final

**Arquivos:**
- Deploy: todas as Edge Functions modificadas

- [ ] **Passo 1: Deploy das Edge Functions**

```bash
npx supabase functions deploy create-whatsapp-instance
npx supabase functions deploy whatsapp-message-webhook
npx supabase functions deploy send-whatsapp-message
npx supabase functions deploy send-whatsapp-media
npx supabase functions deploy check-whatsapp-status
```

- [ ] **Passo 2: Testar no navegador**

1. Abrir Integrações → clicar no card WhatsApp → modal de canais deve aparecer
2. Clicar "Conectar novo canal" → QR code deve ser gerado → dar nome ao canal
3. Escanear QR code → canal deve aparecer como ativo no modal
4. Ir ao Chat → seletor de canal deve aparecer no topo da sidebar
5. Selecionar um canal → conversas devem filtrar por aquele canal
6. Selecionar "Todos os canais" → todas as conversas voltam
7. Enviar mensagem para um lead → deve usar o canal correto

- [ ] **Passo 3: Commit final**

```bash
git add -A
git commit -m "feat: multi-canais WhatsApp — até 5 números com filtro no Chat"
```
