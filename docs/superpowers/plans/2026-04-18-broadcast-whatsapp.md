# Broadcast WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Transmissão" tab to the Chat sidebar that lets users send WhatsApp messages to multiple leads individually (broadcast), with per-contact status tracking and realtime progress.

**Architecture:** Frontend-orchestrated batch execution. The BroadcastPanel component creates a broadcast + contacts in Supabase, then calls the Edge Function in batches of 50 to avoid timeouts. Realtime subscriptions update the UI as each contact's status changes.

**Tech Stack:** React + TypeScript, Supabase (RLS, Edge Functions, Realtime), Evolution API, shadcn/ui

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| CREATE | `supabase/migrations/[ts]_add_broadcast_tables.sql` | Database schema for broadcasts |
| CREATE | `supabase/functions/send-broadcast/index.ts` | Batch sending via Evolution API |
| CREATE | `src/components/chat/BroadcastPanel.tsx` | Entire broadcast UI (list + create + detail) |
| MODIFY | `src/types/chat.ts` | Add Broadcast and BroadcastContact types |
| MODIFY | `src/pages/Chat.tsx` | Add tab + TabsContent + import |
| MODIFY | `src/components/chat/index.ts` | Export BroadcastPanel |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260418000000_add_broadcast_tables.sql`

- [ ] **Step 1: Create migration file**

```sql
-- Broadcast tables
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

-- RLS
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_broadcasts_org ON broadcasts(organization_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_broadcast ON broadcast_contacts(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_contacts_status ON broadcast_contacts(status);
```

- [ ] **Step 2: Run migration on Supabase**

Execute the SQL against the Supabase database (via dashboard SQL editor or `supabase db push`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260418000000_add_broadcast_tables.sql
git commit -m "feat(broadcast): add database migration for broadcasts and broadcast_contacts"
```

---

## Task 2: Add TypeScript Types

**Files:**
- Modify: `src/types/chat.ts`

- [ ] **Step 1: Add Broadcast and BroadcastContact interfaces at the end of `src/types/chat.ts`**

Append after the existing `Message` interface:

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

- [ ] **Step 2: Commit**

```bash
git add src/types/chat.ts
git commit -m "feat(broadcast): add Broadcast and BroadcastContact types"
```

---

## Task 3: Edge Function — send-broadcast

**Files:**
- Create: `supabase/functions/send-broadcast/index.ts`

- [ ] **Step 1: Create the Edge Function**

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  getEvolutionApiUrl,
  getEvolutionApiApiKey,
  normalizeUrl,
  createSupabaseAdmin,
  formatPhoneToJid,
} from "../_shared/evolution-config.ts";

interface SendBroadcastRequest {
  broadcast_id: string;
  batch_size?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { broadcast_id, batch_size = 50 }: SendBroadcastRequest = await req.json();

    if (!broadcast_id) {
      return new Response(
        JSON.stringify({ success: false, error: "broadcast_id é obrigatório" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    // Fetch broadcast
    const { data: broadcast, error: broadcastError } = await supabase
      .from("broadcasts")
      .select("id, organization_id, message_text, delay_seconds, status")
      .eq("id", broadcast_id)
      .maybeSingle();

    if (broadcastError || !broadcast) {
      return new Response(
        JSON.stringify({ success: false, error: "Transmissão não encontrada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (broadcast.status === "cancelled" || broadcast.status === "completed") {
      return new Response(
        JSON.stringify({ success: false, error: `Transmissão já ${broadcast.status === 'cancelled' ? 'cancelada' : 'concluída'}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get connected WhatsApp instance
    const { data: instance, error: instanceError } = await supabase
      .from("whatsapp_instances")
      .select("instance_name")
      .eq("organization_id", broadcast.organization_id)
      .eq("status", "CONNECTED")
      .maybeSingle();

    if (instanceError || !instance) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma instância WhatsApp conectada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Get Evolution API credentials
    let evolutionApiUrl: string;
    let evolutionApiKey: string;
    try {
      evolutionApiUrl = getEvolutionApiUrl();
      evolutionApiKey = getEvolutionApiApiKey();
    } catch (configError: any) {
      return new Response(
        JSON.stringify({ success: false, error: configError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    const cleanBaseUrl = normalizeUrl(evolutionApiUrl);

    // Fetch pending contacts batch
    const { data: contacts, error: contactsError } = await supabase
      .from("broadcast_contacts")
      .select("id, phone, name")
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(batch_size);

    if (contactsError) {
      return new Response(
        JSON.stringify({ success: false, error: "Erro ao buscar contatos" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, has_more: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Process each contact
    let sentCount = 0;
    let errorCount = 0;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      // Replace template variables
      const messageText = broadcast.message_text
        .replace(/\{\{nome\}\}/g, contact.name)
        .replace(/\{\{telefone\}\}/g, contact.phone);

      // Format phone to JID
      let jid: string;
      try {
        jid = formatPhoneToJid(contact.phone);
      } catch {
        await supabase
          .from("broadcast_contacts")
          .update({ status: "error", error_message: "Número de telefone inválido" })
          .eq("id", contact.id);
        await supabase.rpc("increment_broadcast_error", { broadcast_id, amount: 1 }).catch(() => {
          // Fallback: manual increment if RPC doesn't exist
          void supabase
            .from("broadcasts")
            .update({ error_count: broadcast.error_count + errorCount + 1 })
            .eq("id", broadcast_id);
        });
        errorCount++;
        continue;
      }

      try {
        const sendUrl = `${cleanBaseUrl}/message/sendText/${instance.instance_name}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evolutionApiKey,
          },
          body: JSON.stringify({
            number: jid,
            text: messageText,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          await supabase
            .from("broadcast_contacts")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", contact.id);
          sentCount++;
        } else {
          const errorBody = await response.text().catch(() => "Unknown error");
          await supabase
            .from("broadcast_contacts")
            .update({ status: "error", error_message: errorBody.slice(0, 500) })
            .eq("id", contact.id);
          errorCount++;
        }
      } catch (err: any) {
        await supabase
          .from("broadcast_contacts")
          .update({ status: "error", error_message: err.message?.slice(0, 500) || "Erro de conexão" })
          .eq("id", contact.id);
        errorCount++;
      }

      // Update broadcast counters after each contact
      await supabase
        .from("broadcasts")
        .update({
          sent_count: broadcast.sent_count + sentCount,
          error_count: broadcast.error_count + errorCount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", broadcast_id);

      // Delay between sends (except last contact in batch)
      if (i < contacts.length - 1) {
        await new Promise((r) => setTimeout(r, broadcast.delay_seconds * 1000));
      }
    }

    // Check if there are more pending contacts
    const { count } = await supabase
      .from("broadcast_contacts")
      .select("id", { count: "exact", head: true })
      .eq("broadcast_id", broadcast_id)
      .eq("status", "pending");

    const hasMore = (count ?? 0) > 0;

    return new Response(
      JSON.stringify({
        success: true,
        processed: contacts.length,
        sent: sentCount,
        errors: errorCount,
        has_more: hasMore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro interno" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
```

- [ ] **Step 2: Deploy Edge Function**

```bash
supabase functions deploy send-broadcast
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-broadcast/index.ts
git commit -m "feat(broadcast): add send-broadcast Edge Function with batch processing"
```

---

## Task 4: BroadcastPanel Component

**Files:**
- Create: `src/components/chat/BroadcastPanel.tsx`

This is the largest task. The component has 2 views (List and Create/Detail) managed by local state.

- [ ] **Step 1: Create BroadcastPanel.tsx**

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { Lead, Broadcast, BroadcastContact } from "@/types/chat";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  ArrowLeft,
  Search,
  Radio,
  Send,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  RotateCcw,
} from "lucide-react";

interface BroadcastPanelProps {
  organizationId: string;
  leads: Lead[];
  userId?: string;
}

type View = "list" | "create" | "detail";

const STATUS_BADGE: Record<Broadcast["status"], { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-gray-100 text-gray-600" },
  sending: { label: "Enviando...", className: "bg-blue-100 text-blue-600 animate-pulse" },
  completed: { label: "Concluída", className: "bg-green-100 text-green-600" },
  cancelled: { label: "Cancelada", className: "bg-red-100 text-red-600" },
};

const CONTACT_ICON: Record<BroadcastContact["status"], { icon: React.ReactNode; className: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, className: "text-gray-400" },
  sent: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, className: "text-green-500" },
  error: { icon: <XCircle className="h-3.5 w-3.5" />, className: "text-red-500" },
  skipped: { icon: <Ban className="h-3.5 w-3.5" />, className: "text-gray-400" },
};

export function BroadcastPanel({ organizationId, leads, userId }: BroadcastPanelProps) {
  const { toast } = useToast();
  const permissions = usePermissions();

  // View state
  const [view, setView] = useState<View>("list");
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string | null>(null);

  // List state
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(true);
  const [broadcastsPage, setBroadcastsPage] = useState(0);
  const [hasMoreBroadcasts, setHasMoreBroadcasts] = useState(true);
  const PAGE_SIZE = 20;

  // Create state
  const [name, setName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());

  // Detail state
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [contacts, setContacts] = useState<BroadcastContact[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Sending state
  const [isSending, setIsSending] = useState(false);
  const cancelRef = useRef(false);

  // Filter leads by permission
  const availableLeads = leads.filter((lead) => {
    if (!lead.telefone_lead) return false;
    if (permissions.canViewAllLeads) return true;
    return lead.responsavel_user_id === userId;
  });

  const filteredLeads = searchQuery
    ? availableLeads.filter(
        (l) =>
          l.nome_lead?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.telefone_lead?.includes(searchQuery)
      )
    : availableLeads;

  // --- List broadcasts ---
  const fetchBroadcasts = useCallback(
    async (page: number, append = false) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        toast({ title: "Erro", description: "Falha ao carregar transmissões", variant: "destructive" });
        return;
      }

      setBroadcasts((prev) => (append ? [...prev, ...(data as Broadcast[])] : (data as Broadcast[])));
      setHasMoreBroadcasts(data.length === PAGE_SIZE);
      setBroadcastsLoading(false);
    },
    [organizationId, toast]
  );

  useEffect(() => {
    if (view === "list") {
      setBroadcastsLoading(true);
      setBroadcastsPage(0);
      fetchBroadcasts(0);
    }
  }, [view, fetchBroadcasts]);

  // --- Detail view ---
  const fetchDetail = useCallback(
    async (broadcastId: string) => {
      setDetailLoading(true);
      const { data: bData, error: bError } = await supabase
        .from("broadcasts")
        .select("*")
        .eq("id", broadcastId)
        .maybeSingle();

      if (bError || !bData) {
        toast({ title: "Erro", description: "Transmissão não encontrada", variant: "destructive" });
        setView("list");
        return;
      }

      setBroadcast(bData as Broadcast);

      const { data: cData } = await supabase
        .from("broadcast_contacts")
        .select("*")
        .eq("broadcast_id", broadcastId)
        .order("created_at", { ascending: true });

      setContacts((cData as BroadcastContact[]) || []);
      setDetailLoading(false);
    },
    [toast]
  );

  // Realtime subscription for detail view
  useEffect(() => {
    if (view !== "detail" || !selectedBroadcastId) return;

    const channel = supabase
      .channel(`broadcast-${selectedBroadcastId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcast_contacts",
          filter: `broadcast_id=eq.${selectedBroadcastId}`,
        },
        (payload) => {
          const updated = payload.new as BroadcastContact;
          setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "broadcasts",
          filter: `id=eq.${selectedBroadcastId}`,
        },
        (payload) => {
          setBroadcast(payload.new as Broadcast);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [view, selectedBroadcastId]);

  // --- Navigate to detail ---
  const openDetail = (broadcastId: string) => {
    setSelectedBroadcastId(broadcastId);
    setView("detail");
    fetchDetail(broadcastId);
  };

  // --- Create broadcast ---
  const handleDisparar = async () => {
    if (!name.trim()) {
      toast({ title: "Erro", description: "Informe o nome da transmissão", variant: "destructive" });
      return;
    }
    if (!messageText.trim()) {
      toast({ title: "Erro", description: "Informe a mensagem", variant: "destructive" });
      return;
    }
    if (selectedLeadIds.size === 0) {
      toast({ title: "Erro", description: "Selecione ao menos 1 contato", variant: "destructive" });
      return;
    }
    if (selectedLeadIds.size > 500) {
      toast({ title: "Erro", description: "Máximo de 500 contatos por transmissão", variant: "destructive" });
      return;
    }
    if (messageText.length > 4096) {
      toast({ title: "Erro", description: "Mensagem excede 4096 caracteres", variant: "destructive" });
      return;
    }

    const selectedLeads = availableLeads.filter((l) => selectedLeadIds.has(l.id));
    const contactsRows = selectedLeads.map((l) => ({
      lead_id: l.id,
      phone: l.telefone_lead,
      name: l.nome_lead || "Sem nome",
      status: "pending" as const,
    }));

    // Insert broadcast
    const { data: broadcastData, error: broadcastError } = await supabase
      .from("broadcasts")
      .insert({
        organization_id: organizationId,
        name: name.trim(),
        message_text: messageText.trim(),
        status: "sending",
        total_contacts: contactsRows.length,
        delay_seconds: delaySeconds,
      })
      .select()
      .single();

    if (broadcastError || !broadcastData) {
      toast({ title: "Erro", description: "Falha ao criar transmissão", variant: "destructive" });
      return;
    }

    // Batch insert contacts
    const { error: contactsError } = await supabase.from("broadcast_contacts").insert(
      contactsRows.map((c) => ({
        ...c,
        broadcast_id: broadcastData.id,
      }))
    );

    if (contactsError) {
      toast({ title: "Erro", description: "Falha ao adicionar contatos", variant: "destructive" });
      // Clean up broadcast
      await supabase.from("broadcasts").delete().eq("id", broadcastData.id);
      return;
    }

    toast({ title: "Transmissão criada", description: `${contactsRows.length} contatos na fila` });

    // Navigate to detail and start sending
    setSelectedBroadcastId(broadcastData.id);
    setView("detail");
    setBroadcast(broadcastData as Broadcast);
    setContacts(
      contactsRows.map((c, i) => ({
        id: `temp-${i}`,
        broadcast_id: broadcastData.id,
        lead_id: c.lead_id,
        phone: c.phone,
        name: c.name,
        status: "pending",
        created_at: new Date().toISOString(),
      }))
    );

    // Start batch sending
    runBatchSend(broadcastData.id);
  };

  // --- Batch sending loop ---
  const runBatchSend = async (broadcastId: string) => {
    setIsSending(true);
    cancelRef.current = false;

    // Fetch detail to replace temp contacts
    const { data: cData } = await supabase
      .from("broadcast_contacts")
      .select("*")
      .eq("broadcast_id", broadcastId)
      .order("created_at", { ascending: true });
    if (cData) setContacts(cData as BroadcastContact[]);

    let hasMore = true;
    while (hasMore && !cancelRef.current) {
      try {
        const { data, error } = await supabase.functions.invoke("send-broadcast", {
          body: { broadcast_id: broadcastId, batch_size: 50 },
        });

        if (error || !data?.success) {
          toast({
            title: "Erro no envio",
            description: data?.error || "Falha ao processar lote",
            variant: "destructive",
          });
          break;
        }

        hasMore = data.has_more;
        if (hasMore) await new Promise((r) => setTimeout(r, 1000));
      } catch {
        toast({ title: "Erro", description: "Falha de conexão com o servidor", variant: "destructive" });
        break;
      }
    }

    // Mark completed or cancelled
    if (!cancelRef.current) {
      await supabase
        .from("broadcasts")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", broadcastId);
    } else {
      // Mark remaining pending as skipped
      await supabase
        .from("broadcast_contacts")
        .update({ status: "skipped" })
        .eq("broadcast_id", broadcastId)
        .eq("status", "pending");
      await supabase
        .from("broadcasts")
        .update({ status: "cancelled" })
        .eq("id", broadcastId);
    }

    // Refresh final state
    await fetchDetail(broadcastId);
    setIsSending(false);
  };

  // --- Cancel ---
  const handleCancel = () => {
    cancelRef.current = true;
  };

  // --- Resume ---
  const handleResume = () => {
    if (selectedBroadcastId) runBatchSend(selectedBroadcastId);
  };

  // --- Toggle lead selection ---
  const toggleLead = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedLeadIds.size === filteredLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  // --- Insert variable into textarea ---
  const insertVariable = (variable: string) => {
    setMessageText((prev) => prev + variable);
  };

  // --- Preview message ---
  const previewMessage = messageText
    .replace(/\{\{nome\}\}/g, "João Silva")
    .replace(/\{\{telefone\}\}/g, "11999999999");

  // --- Progress calculation ---
  const progressPercent = broadcast
    ? Math.round(((broadcast.sent_count + broadcast.error_count) / Math.max(broadcast.total_contacts, 1)) * 100)
    : 0;

  const hasPendingContacts = contacts.some((c) => c.status === "pending");
  const showResumeButton = !isSending && broadcast?.status === "sending" && hasPendingContacts;

  // =====================
  // RENDER
  // =====================

  // VIEW: List
  if (view === "list") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Transmissões</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            onClick={() => {
              setName("");
              setMessageText("");
              setDelaySeconds(3);
              setSearchQuery("");
              setSelectedLeadIds(new Set());
              setView("create");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Nova
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {broadcastsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center text-muted-foreground">
              <Radio className="h-8 w-8 mb-2" />
              <p className="text-sm">Nenhuma transmissão</p>
              <p className="text-xs">Clique em "Nova" para criar</p>
            </div>
          ) : (
            <div className="divide-y">
              {broadcasts.map((b) => (
                <button
                  key={b.id}
                  onClick={() => openDetail(b.id)}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">{b.name}</span>
                    <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[b.status].className}`}>
                      {STATUS_BADGE[b.status].label}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{b.sent_count}/{b.total_contacts} enviados</span>
                    <span>{new Date(b.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {hasMoreBroadcasts && broadcasts.length > 0 && (
            <div className="p-3 text-center">
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => {
                  const nextPage = broadcastsPage + 1;
                  setBroadcastsPage(nextPage);
                  fetchBroadcasts(nextPage, true);
                }}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </ScrollArea>
      </div>
    );
  }

  // VIEW: Create
  if (view === "create") {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-semibold text-sm">Nova Transmissão</h3>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Nome */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da transmissão</label>
              <Input
                placeholder="Ex: Promoção Abril"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="text-sm"
              />
            </div>

            {/* Mensagem */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Mensagem</label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                placeholder="Digite sua mensagem..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={4096}
              />
              <div className="flex items-center justify-between mt-1">
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => insertVariable("{{nome}}")}>
                    {"{{nome}}"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => insertVariable("{{telefone}}")}>
                    {"{{telefone}}"}
                  </Button>
                </div>
                <span className="text-[10px] text-muted-foreground">{messageText.length}/4096</span>
              </div>
            </div>

            {/* Preview */}
            {messageText.includes("{{") && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Preview</p>
                <p className="text-sm whitespace-pre-wrap">{previewMessage}</p>
              </div>
            )}

            {/* Delay */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Intervalo entre envios</label>
              <select
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={delaySeconds}
                onChange={(e) => setDelaySeconds(Number(e.target.value))}
              >
                <option value={2}>2 segundos</option>
                <option value={3}>3 segundos</option>
                <option value={5}>5 segundos</option>
                <option value={10}>10 segundos</option>
              </select>
            </div>

            {/* Busca contatos */}
            <div className="border-t pt-4">
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Selecionar contatos ({selectedLeadIds.size}/{filteredLeads.length})
              </label>
              <div className="relative mb-2">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-sm h-9"
                />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Checkbox
                  id="select-all"
                  checked={selectedLeadIds.size === filteredLeads.length && filteredLeads.length > 0}
                  onCheckedChange={toggleAll}
                />
                <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                  Selecionar todos
                </label>
              </div>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {filteredLeads.map((lead) => (
                  <label
                    key={lead.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedLeadIds.has(lead.id)}
                      onCheckedChange={() => toggleLead(lead.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{lead.nome_lead || "Sem nome"}</p>
                      <p className="text-[10px] text-muted-foreground">{lead.telefone_lead}</p>
                    </div>
                  </label>
                ))}
                {filteredLeads.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{selectedLeadIds.size} contatos selecionados</span>
          <Button
            size="sm"
            className="gap-1"
            disabled={isSending}
            onClick={handleDisparar}
          >
            {isSending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Disparar
          </Button>
        </div>
      </div>
    );
  }

  // VIEW: Detail
  if (view === "detail") {
    if (detailLoading || !broadcast) {
      return (
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setView("list")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm truncate">{broadcast.name}</h3>
          </div>
          <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[broadcast.status].className}`}>
            {STATUS_BADGE[broadcast.status].label}
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">
                  {broadcast.sent_count + broadcast.error_count}/{broadcast.total_contacts} processados
                </span>
                <span className="text-xs text-muted-foreground">{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                <span className="text-green-600">{broadcast.sent_count} enviados</span>
                <span className="text-red-600">{broadcast.error_count} erros</span>
              </div>
            </div>

            {/* Message preview */}
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-[10px] font-medium text-muted-foreground mb-1">Mensagem</p>
              <p className="text-sm whitespace-pre-wrap">{broadcast.message_text}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {isSending && (
                <Button size="sm" variant="destructive" className="text-xs gap-1" onClick={handleCancel}>
                  <X className="h-3 w-3" />
                  Cancelar
                </Button>
              )}
              {showResumeButton && (
                <Button size="sm" className="text-xs gap-1" onClick={handleResume}>
                  <RotateCcw className="h-3 w-3" />
                  Retomar envio
                </Button>
              )}
            </div>

            {/* Contact list */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Contatos</p>
              <div className="space-y-1">
                {contacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
                    <span className={CONTACT_ICON[c.status].className}>{CONTACT_ICON[c.status].icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.phone}</p>
                    </div>
                    {c.status === "sent" && c.sent_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    {c.status === "error" && c.error_message && (
                      <span className="text-[10px] text-red-500 truncate max-w-[100px]">{c.error_message}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/BroadcastPanel.tsx
git commit -m "feat(broadcast): add BroadcastPanel component with list, create, and detail views"
```

---

## Task 5: Export BroadcastPanel

**Files:**
- Modify: `src/components/chat/index.ts`

- [ ] **Step 1: Add export to `src/components/chat/index.ts`**

Append at the end of the file:

```typescript
export { BroadcastPanel } from "./BroadcastPanel";
```

- [ ] **Step 2: Commit**

```bash
git add src/components/chat/index.ts
git commit -m "feat(broadcast): export BroadcastPanel from chat index"
```

---

## Task 6: Integrate into Chat.tsx

**Files:**
- Modify: `src/pages/Chat.tsx`

The changes are minimal — add one tab trigger, one tab content, and one import.

- [ ] **Step 1: Add import for Radio icon and BroadcastPanel**

In the lucide-react import (around line 17), add `Radio` to the existing import list. Find the line:

```typescript
import { Search, Tag, Filter, Check, Pin, PinOff, Loader2, ArrowLeft } from "lucide-react";
```

Change to:

```typescript
import { Search, Tag, Filter, Check, Pin, PinOff, Loader2, ArrowLeft, Radio } from "lucide-react";
```

Add a new import line after the existing component imports:

```typescript
import { BroadcastPanel } from "@/components/chat/BroadcastPanel";
```

- [ ] **Step 2: Add Broadcast tab trigger**

Find the `TabsTrigger` for "pinned" (around line 1230):

```tsx
            <TabsTrigger value="pinned" className="text-sm gap-1 rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              Fixados
              {pinnedFilteredLeads.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">{pinnedFilteredLeads.length}</Badge>}
            </TabsTrigger>
```

Add after the closing `</TabsTrigger>`:

```tsx
            <TabsTrigger value="broadcast" className="text-sm gap-1 rounded-none px-4 py-2 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none hover:bg-muted/50 transition-all duration-200">
              <Radio className="h-3.5 w-3.5" />
              Transmissão
            </TabsTrigger>
```

- [ ] **Step 3: Add Broadcast TabsContent**

Find the closing `</TabsContent>` for "pinned" (around line 1304). Add after it:

```tsx
          <TabsContent value="broadcast" className="flex-1 mt-0 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col">
            <BroadcastPanel
              organizationId={organizationId!}
              leads={leads}
              userId={user?.id}
            />
          </TabsContent>
```

- [ ] **Step 4: Verify "Tudo" and "Fixados" tabs still work**

Open the Chat page and confirm both existing tabs render correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(broadcast): add Transmissão tab to Chat sidebar"
```

---

## Task 7: Manual Testing Checklist

After all code is in place:

- [ ] **Step 1: Run dev server and verify tab appears**

```bash
npm run dev
```

Open the Chat page. Confirm:
- [ ] "Transmissão" tab appears alongside "Tudo" and "Fixados"
- [ ] "Tudo" tab still works normally
- [ ] "Fixados" tab still works normally

- [ ] **Step 2: Test broadcast creation flow**

- Click "Nova" button
- Enter name and message with `{{nome}}` variable
- Verify preview shows "João Silva" substitution
- Search contacts by name/phone
- Select contacts via checkbox
- Click "Disparar"

- [ ] **Step 3: Verify Edge Function**

If WhatsApp instance is connected:
- [ ] Messages send individually to each contact
- [ ] Status updates in real-time
- [ ] Progress bar advances
- [ ] Cancel button stops sending

If WhatsApp is not connected:
- [ ] Error toast appears explaining no connected instance

- [ ] **Step 4: Test pagination and edge cases**

- [ ] "Carregar mais" button appears when > 20 broadcasts exist
- [ ] Selecting 0 contacts shows error toast
- [ ] Message > 4096 chars is rejected
- [ ] > 500 contacts is rejected
- [ ] Resume button appears for interrupted broadcasts
