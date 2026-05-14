# Indicador "digitando…"/"gravando…" + Cor da Bolha de Grupos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar bolha animada no fim da conversa quando o lead/participante está digitando ou gravando áudio no WhatsApp, e alinhar a cor da bolha de saída em grupos com o teal/verde do chat privado.

**Architecture:** Evento `presence.update` da Evolution → webhook escreve em `leads.typing_state` (privado) ou na nova tabela `group_typing` (grupos) com TTL de 12s → frontend faz polling de 2s e renderiza `<TypingBubble>` no fim da lista de mensagens.

**Tech Stack:** PostgreSQL (RLS, nova tabela), Supabase Edge Functions (Deno, webhook), React + TypeScript + Vite (hooks + componente), Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-14-typing-recording-indicator-design.md`

---

## File Structure

### Created
- `supabase/migrations/20260514120000_typing_indicator.sql` — colunas `leads.typing_state` + `leads.typing_expires_at`, nova tabela `group_typing` + RLS
- `src/hooks/useTypingIndicator.ts` — polling 2s do typing state do lead (privado)
- `src/hooks/useGroupTypingIndicator.ts` — polling 2s da tabela `group_typing` (grupos)
- `src/components/chat/TypingBubble.tsx` — componente da bolha animada (dots ou wave+mic)

### Modified
- `supabase/functions/whatsapp-message-webhook/index.ts` — handler `presence.update` reescrito + limpeza de `typing_state` no `messages.upsert` (privado e grupo)
- `src/pages/Chat.tsx` — usa `useTypingIndicator` e renderiza `<TypingBubble>` ao fim da lista
- `src/components/chat/GroupConversationView.tsx` — (1) cor da bolha de SAIDA para `bg-chat-bubble`; (2) usa `useGroupTypingIndicator` e renderiza bolhas no fim

### Branch
Trabalhar em branch nova `feature/typing-recording-indicator` criada a partir de `origin/main`.

---

## Task 0: Setup branch

**Files:** N/A

- [ ] **Step 1: Verificar working tree limpo**

```bash
git status --short
```

Se houver arquivos não commitados que NÃO sejam relacionados a esta feature, stashar:

```bash
git stash push --include-untracked -m "wip-pre-typing-indicator"
```

- [ ] **Step 2: Sincronizar com origin/main**

```bash
git fetch origin main
git checkout main
git pull origin main --ff-only
```

Expected: fast-forward limpo, ou `Already up to date.`

- [ ] **Step 3: Criar branch nova**

```bash
git checkout -b feature/typing-recording-indicator
```

Expected: `Switched to a new branch 'feature/typing-recording-indicator'`.

---

## Task 1: Migration — colunas em leads + tabela group_typing

**Files:**
- Create: `supabase/migrations/20260514120000_typing_indicator.sql`

- [ ] **Step 1: Escrever a migration**

Crie o arquivo com o conteúdo exato abaixo:

```sql
-- ============================================================
-- Typing/Recording indicator schema
-- ============================================================
-- Privado: 2 colunas em leads para estado transiente de digitacao/gravacao
-- Grupos: tabela dedicada (uma linha por participante digitando)
-- TTL: 12s — Evolution nem sempre emite o evento de "stop typing", entao
-- o frontend filtra por expires_at > now() como defesa.

-- 1.1 Privado: colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS typing_state text
    CHECK (typing_state IN ('composing','recording')),
  ADD COLUMN IF NOT EXISTS typing_expires_at timestamptz;

-- Indice parcial para lookups rapidos de leads ativamente digitando
CREATE INDEX IF NOT EXISTS idx_leads_typing_active
  ON public.leads (id)
  WHERE typing_state IS NOT NULL;

-- 1.2 Grupos: tabela dedicada
CREATE TABLE IF NOT EXISTS public.group_typing (
  whatsapp_instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  participant_jid text NOT NULL,
  participant_pushname text,
  typing_state text NOT NULL CHECK (typing_state IN ('composing','recording')),
  expires_at timestamptz NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (whatsapp_instance_id, group_id, participant_jid)
);

CREATE INDEX IF NOT EXISTS idx_group_typing_lookup
  ON public.group_typing (whatsapp_instance_id, group_id);

-- 1.3 RLS — segue o padrao da spec channel-access-control
ALTER TABLE public.group_typing ENABLE ROW LEVEL SECURITY;

-- SELECT: so quem tem acesso ao canal ve
DROP POLICY IF EXISTS group_typing_select ON public.group_typing;
CREATE POLICY group_typing_select ON public.group_typing
  FOR SELECT TO authenticated
  USING (public.user_can_access_channel(whatsapp_instance_id));

-- INSERT/UPDATE/DELETE: so service_role (webhook). Sem policies => bloqueado
-- por default para authenticated.

-- 1.4 Adicionar a publication do realtime (futuro-proof; frontend pode opcionalmente subscribe)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_typing;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
```

- [ ] **Step 2: Aplicar a migration na DB linked**

```bash
npx supabase db query --linked -f "supabase/migrations/20260514120000_typing_indicator.sql"
```

Expected: JSON com `"rows":[]` e sem erro.

- [ ] **Step 3: Marcar migration como aplicada no historico**

```bash
npx supabase migration repair --status applied 20260514120000
```

Expected: `Repaired migration history: [20260514120000] => applied`.

- [ ] **Step 4: Verificar colunas e tabela no DB**

```bash
npx supabase db query --linked --output table "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name IN ('typing_state','typing_expires_at');"
```

Expected: 2 linhas — `typing_state text` e `typing_expires_at timestamptz`.

```bash
npx supabase db query --linked --output table "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='group_typing';"
```

Expected: 1 linha com `group_typing`.

```bash
npx supabase db query --linked --output table "SELECT policyname, cmd FROM pg_policies WHERE tablename='group_typing';"
```

Expected: 1 linha — `group_typing_select` / `SELECT`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260514120000_typing_indicator.sql
git commit -m "feat(typing): schema para indicador digitando/gravando

Adiciona:
- leads.typing_state + typing_expires_at (privado)
- nova tabela group_typing com RLS via user_can_access_channel (grupos)
- indices para lookups rapidos
- group_typing entra na publication supabase_realtime"
```

---

## Task 2: Webhook — handler presence.update reescrito

**Files:**
- Modify: `supabase/functions/whatsapp-message-webhook/index.ts`

- [ ] **Step 1: Localizar o handler atual de `presence.update`**

```bash
```

Use Grep:
```
pattern: presence\.update.*PRESENCE_UPDATE
path: supabase/functions/whatsapp-message-webhook/index.ts
output_mode: content
-n: true
```

Anote o intervalo de linhas do bloco `if (event === 'presence.update' ...) { ... return new Response(...); }`. Geralmente entre as linhas 543-619 atualmente.

- [ ] **Step 2: Substituir o bloco inteiro pelo handler novo**

Substitua o bloco antigo (do `if (event === 'presence.update'` até o `return new Response(...)` que fecha o handler) pelo seguinte:

```typescript
    // ==================== EVENTO: PRESENCE.UPDATE ====================
    // Captura composing/recording/available/unavailable do lead ou de participantes
    // de grupo. Escreve em leads.typing_state (privado) ou group_typing (grupo) com
    // TTL de 12s — o frontend filtra por expires_at > now() para defesa contra
    // Evolution nao emitir o stop typing.
    if (event === 'presence.update' || event === 'PRESENCE_UPDATE') {
      console.log(`👀 Processando presence para instancia: ${instance}`);

      const TYPING_TTL_MS = 12_000;
      const remoteJid: string = data?.id || data?.remoteJid || '';
      const presencesObj: Record<string, any> = data?.presences || {};

      // Resolve instancia/org uma unica vez
      const { data: presenceInstance } = await supabase
        .from('whatsapp_instances')
        .select('id, organization_id')
        .eq('instance_name', instance)
        .maybeSingle();

      if (!presenceInstance?.organization_id) {
        return new Response(
          JSON.stringify({ success: true, message: 'Instancia sem org' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // ----- BRANCH GRUPO -----
      if (remoteJid.endsWith('@g.us')) {
        for (const [participantJid, info] of Object.entries(presencesObj)) {
          const presence = (info as any)?.lastKnownPresence;
          if (!presence) continue;

          if (presence === 'composing' || presence === 'recording') {
            await supabase.from('group_typing').upsert({
              whatsapp_instance_id: presenceInstance.id,
              group_id: remoteJid,
              participant_jid: participantJid,
              participant_pushname: (info as any)?.pushName || null,
              typing_state: presence,
              expires_at: new Date(Date.now() + TYPING_TTL_MS).toISOString(),
              organization_id: presenceInstance.organization_id,
              updated_at: new Date().toISOString(),
            });
          } else {
            // available / unavailable / paused → remove
            await supabase
              .from('group_typing')
              .delete()
              .eq('whatsapp_instance_id', presenceInstance.id)
              .eq('group_id', remoteJid)
              .eq('participant_jid', participantJid);
          }
        }
        return new Response(
          JSON.stringify({ success: true, message: 'Presence de grupo processado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      // ----- BRANCH PRIVADO -----
      let lastKnownPresence: string | undefined =
        data?.presence
        || data?.lastKnownPresence
        || (remoteJid && presencesObj[remoteJid]?.lastKnownPresence);

      if (!lastKnownPresence && Object.keys(presencesObj).length > 0) {
        const first = Object.values(presencesObj)[0] as any;
        lastKnownPresence = first?.lastKnownPresence;
      }

      if (!remoteJid || !lastKnownPresence) {
        return new Response(
          JSON.stringify({ success: true, message: 'Presence sem dados suficientes' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const presencePhone = extractPhoneNumber(remoteJid);
      if (!presencePhone || presencePhone.length < 8) {
        return new Response(
          JSON.stringify({ success: true, message: 'Presence sem phone valido' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const nowIso = new Date().toISOString();
      const update: Record<string, unknown> = { updated_at: nowIso };

      if (lastKnownPresence === 'composing' || lastKnownPresence === 'recording') {
        update.typing_state = lastKnownPresence;
        update.typing_expires_at = new Date(Date.now() + TYPING_TTL_MS).toISOString();
        update.is_online = true;
        update.last_seen = null;
      } else if (lastKnownPresence === 'available') {
        update.typing_state = null;
        update.typing_expires_at = null;
        update.is_online = true;
        update.last_seen = null;
      } else {
        // unavailable, paused, etc → offline + limpa typing
        update.typing_state = null;
        update.typing_expires_at = null;
        update.is_online = false;
        update.last_seen = nowIso;
      }

      await supabase
        .from('leads')
        .update(update)
        .eq('telefone_lead', presencePhone)
        .eq('organization_id', presenceInstance.organization_id);

      console.log(`✅ Presence atualizada: ${presencePhone} -> ${lastKnownPresence} (typing_state=${update.typing_state ?? 'null'})`);

      return new Response(
        JSON.stringify({ success: true, message: 'Presence atualizada', presence: lastKnownPresence }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
```

⚠️ Garanta que **apenas o handler `presence.update` foi substituído** — não toque em outros eventos (`messages.upsert`, `qrcode.updated`, etc).

- [ ] **Step 3: Deploy edge**

```bash
npx supabase functions deploy whatsapp-message-webhook --no-verify-jwt
```

Expected: `Deployed Functions on project ...: whatsapp-message-webhook`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat(webhook): handler presence.update separa composing/recording

Substitui o handler antigo que colapsava composing+recording+available
num booleano is_online. Agora escreve em leads.typing_state ou na nova
tabela group_typing com TTL de 12s. Grupos antes eram ignorados — agora
iteramos data.presences por participante."
```

---

## Task 3: Webhook — limpar typing state ao receber mensagem

**Files:**
- Modify: `supabase/functions/whatsapp-message-webhook/index.ts`

Quando o lead/participante de fato envia uma mensagem, ele obviamente parou de digitar. Limpar imediatamente para a bolha sumir sem esperar TTL.

- [ ] **Step 1: Localizar o INSERT em mensagens_grupo (branch de grupos)**

Procurar pela linha que faz `supabase.from('mensagens_grupo').insert(...)` no branch que começa com `if (remoteJid.endsWith('@g.us'))` (geralmente perto da linha 860-880).

- [ ] **Step 2: Adicionar limpeza após o INSERT (grupo)**

Logo APÓS o bloco `try { await supabase.from('mensagens_grupo').insert(...) } catch (err) { ... }` (linha onde termina o catch — geralmente perto da linha ~895), e ANTES do `return new Response(...)` que fecha o branch de grupos, adicione:

```typescript
      // Lead acabou de enviar msg → nao esta mais digitando.
      // Cleanup imediato para a bolha de typing sumir sem esperar TTL.
      if (senderJid) {
        await supabase
          .from('group_typing')
          .delete()
          .eq('whatsapp_instance_id', instanceId)
          .eq('group_id', remoteJid)
          .eq('participant_jid', senderJid);
      }
```

- [ ] **Step 3: Localizar o INSERT em mensagens_chat (branch de leads)**

Após o branch de grupos (depois do `return new Response(...)` daquele branch), procurar onde o fluxo de leads salva a mensagem em `mensagens_chat`. Geralmente uma chamada como:

```typescript
await supabase.from('mensagens_chat').insert({ id_lead: leadId, ... });
```

Atualmente próximo a linha ~1400 dependendo do estado do arquivo.

- [ ] **Step 4: Adicionar limpeza após o INSERT (privado)**

Imediatamente APÓS o `.from('mensagens_chat').insert(...)` (depois do `await` que retorna), adicione:

```typescript
      // Lead acabou de enviar msg → nao esta mais digitando.
      // Cleanup imediato; o webhook tambem atualiza last_message_at do lead.
      try {
        await supabase
          .from('leads')
          .update({ typing_state: null, typing_expires_at: null })
          .eq('id', leadId);
      } catch (cleanupErr) {
        console.warn('⚠️ Falha ao limpar typing_state do lead:', cleanupErr);
      }
```

⚠️ Se já houver um `UPDATE leads SET last_message_at = now()...` próximo (geralmente é o caso), você pode MERGEAR o cleanup nesse mesmo UPDATE em vez de fazer 2 round-trips. Procure por `.update({ last_message_at` e adicione `typing_state: null, typing_expires_at: null` ao mesmo objeto.

- [ ] **Step 5: Deploy edge**

```bash
npx supabase functions deploy whatsapp-message-webhook --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/whatsapp-message-webhook/index.ts
git commit -m "feat(webhook): limpa typing_state quando msg do lead chega

Evita atraso visual de ate 12s entre msg chegar e bolha de typing
desaparecer. Aplica nos 2 fluxos: grupos (DELETE em group_typing) e
privado (UPDATE leads SET typing_state=NULL)."
```

---

## Task 4: Frontend — useTypingIndicator hook (privado)

**Files:**
- Create: `src/hooks/useTypingIndicator.ts`

- [ ] **Step 1: Criar o arquivo**

Crie `src/hooks/useTypingIndicator.ts` com o conteúdo exato:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Faz polling de 2s na coluna leads.typing_state e retorna o estado atual
 * filtrando por expires_at > now() — defesa contra Evolution nao emitir
 * o evento de "stop typing".
 *
 * Pausa quando a aba esta em background (document.visibilityState !== 'visible')
 * para economizar requests.
 *
 * Retorna 'composing' | 'recording' | null.
 */
export function useTypingIndicator(leadId: string | null): 'composing' | 'recording' | null {
  const [state, setState] = useState<'composing' | 'recording' | null>(null);

  useEffect(() => {
    if (!leadId) {
      setState(null);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // Cast para any: typing_state nao esta no types.ts gerado ainda.
        const { data } = await (supabase as any)
          .from('leads')
          .select('typing_state, typing_expires_at')
          .eq('id', leadId)
          .maybeSingle();

        if (cancelled) return;

        if (!data?.typing_state || !data?.typing_expires_at) {
          setState(null);
          return;
        }
        if (new Date(data.typing_expires_at as string) <= new Date()) {
          setState(null);
          return;
        }
        setState(data.typing_state as 'composing' | 'recording');
      } catch {
        // Silencioso — proximo tick tenta de novo.
      }
    };

    tick();
    const interval = setInterval(tick, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [leadId]);

  return state;
}
```

- [ ] **Step 2: Validar TypeScript**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "useTypingIndicator" | head -5
```

Expected: sem output (sem erros no arquivo novo).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useTypingIndicator.ts
git commit -m "feat(hook): useTypingIndicator com polling 2s

Hook do chat privado — retorna typing_state do lead filtrando por
expires_at > now(). Pausa quando aba em background."
```

---

## Task 5: Frontend — useGroupTypingIndicator hook (grupos)

**Files:**
- Create: `src/hooks/useGroupTypingIndicator.ts`

- [ ] **Step 1: Criar o arquivo**

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GroupTyper {
  participant_jid: string;
  participant_pushname: string | null;
  typing_state: 'composing' | 'recording';
}

/**
 * Polling 2s da tabela group_typing. Retorna lista de participantes que
 * estao digitando ou gravando no grupo atual, filtrando por expires_at > now().
 *
 * Pausa quando a aba esta em background.
 */
export function useGroupTypingIndicator(
  instanceId: string | null,
  groupId: string | null
): GroupTyper[] {
  const [typers, setTypers] = useState<GroupTyper[]>([]);

  useEffect(() => {
    if (!instanceId || !groupId) {
      setTypers([]);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        // Cast para any: group_typing nao esta no types.ts gerado ainda.
        const { data } = await (supabase as any)
          .from('group_typing')
          .select('participant_jid, participant_pushname, typing_state, expires_at')
          .eq('whatsapp_instance_id', instanceId)
          .eq('group_id', groupId)
          .gt('expires_at', new Date().toISOString());

        if (cancelled) return;

        setTypers(
          (data || []).map((r: any) => ({
            participant_jid: r.participant_jid,
            participant_pushname: r.participant_pushname,
            typing_state: r.typing_state,
          }))
        );
      } catch {
        // Silencioso.
      }
    };

    tick();
    const interval = setInterval(tick, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [instanceId, groupId]);

  return typers;
}
```

- [ ] **Step 2: Validar TypeScript**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "useGroupTypingIndicator" | head -5
```

Expected: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useGroupTypingIndicator.ts
git commit -m "feat(hook): useGroupTypingIndicator com polling 2s

Hook de grupos — retorna lista de participantes digitando/gravando,
filtrando por expires_at > now()."
```

---

## Task 6: Frontend — componente TypingBubble

**Files:**
- Create: `src/components/chat/TypingBubble.tsx`

- [ ] **Step 1: Criar o arquivo**

```tsx
import { memo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mic } from "lucide-react";

interface TypingBubbleProps {
  state: 'composing' | 'recording';
  /** Em grupos: nome do participante. No privado, pode omitir. */
  senderName?: string;
  /** Em grupos: avatar do participante. No privado, avatar do lead. */
  senderAvatarUrl?: string;
}

/**
 * Bolha animada renderizada no fim da lista de mensagens quando o
 * lead/participante esta digitando ou gravando audio no WhatsApp.
 *
 * - composing: 3 dots pulsantes em sequencia
 * - recording: mic pulsante + barrinhas tipo wave
 */
export const TypingBubble = memo(function TypingBubble({
  state,
  senderName,
  senderAvatarUrl,
}: TypingBubbleProps) {
  return (
    <div className="flex items-end gap-2 justify-start">
      {senderAvatarUrl !== undefined && (
        <Avatar className="h-7 w-7 flex-shrink-0">
          {senderAvatarUrl ? <AvatarImage src={senderAvatarUrl} /> : null}
          <AvatarFallback className="text-[10px]">
            {(senderName || '?').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="max-w-[78%] rounded-lg rounded-bl-sm px-3 py-2 bg-muted border">
        {senderName && (
          <p className="text-[10.5px] font-semibold opacity-80 mb-1">{senderName}</p>
        )}
        {state === 'composing' ? <TypingDots /> : <RecordingWave />}
      </div>
    </div>
  );
});

function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-end h-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-muted-foreground/70"
          style={{
            animation: 'typingDot 1.4s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes typingDot {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30%           { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </span>
  );
}

function RecordingWave() {
  return (
    <span className="inline-flex items-center gap-2 h-4 text-muted-foreground">
      <Mic className="h-3.5 w-3.5 animate-pulse text-primary" />
      <span className="inline-flex items-end gap-0.5 h-4">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="block w-0.5 bg-primary/70 rounded-sm"
            style={{
              height: '40%',
              animation: 'recWave 0.7s ease-in-out infinite',
              animationDelay: `${i * 0.12}s`,
            }}
          />
        ))}
      </span>
      <style>{`
        @keyframes recWave {
          0%, 100% { height: 30%; }
          50%      { height: 100%; }
        }
      `}</style>
    </span>
  );
}
```

- [ ] **Step 2: Validar TypeScript**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "TypingBubble" | head -5
```

Expected: sem output.

- [ ] **Step 3: Commit**

```bash
git add src/components/chat/TypingBubble.tsx
git commit -m "feat(chat): componente TypingBubble com dots e wave animados

3 dots em sequencia para 'composing'; mic pulsante + barras tipo wave
para 'recording'. Suporta avatar+nome para uso em grupos."
```

---

## Task 7: Integração no Chat privado

**Files:**
- Modify: `src/pages/Chat.tsx`

- [ ] **Step 1: Adicionar import no topo**

Procure os imports existentes de `@/hooks/...` e adicione:

```typescript
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { TypingBubble } from "@/components/chat/TypingBubble";
```

- [ ] **Step 2: Adicionar o hook dentro do componente Chat**

Procure por outros hooks dentro do componente principal (próximo aos `useState`/`useEffect` no topo). Adicione (perto de onde `selectedLead` é declarado):

```typescript
const typingState = useTypingIndicator(selectedLead?.id || null);
```

- [ ] **Step 3: Renderizar a bolha no fim da lista de mensagens**

Encontre o local onde as mensagens são renderizadas (.map sobre `messages` retornando `<MessageBubble />`). Depois do `.map`, antes de qualquer marker de fim/scroll, adicione:

```tsx
{typingState && selectedLead && (
  <TypingBubble
    state={typingState}
    senderAvatarUrl={selectedLead.avatar_url || undefined}
  />
)}
```

Padrão a procurar: algo como
```tsx
{messages.map((msg) => (<MessageBubble ... />))}
<div ref={scrollEndRef} />  // <- a bolha vai ANTES deste div
```

Após o map e antes do `<div ref={scrollEndRef}>` (ou equivalente).

- [ ] **Step 4: Build local**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xs` (sem erros).

- [ ] **Step 5: Testar localmente**

Se o dev server estiver rodando em http://localhost:8090, recarregue a página. Senão:

```bash
npm run dev -- --port 8090 --strictPort
```

Abrir conversa privada com lead, pedir alguém pra digitar no WhatsApp. Bolha deve aparecer em ≤2s.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Chat.tsx
git commit -m "feat(chat): renderiza TypingBubble no fim da conversa privada

Consome useTypingIndicator(selectedLead.id). Quando typing_state nao for
null, mostra bolha animada com avatar do lead. Some automaticamente
quando o estado vira null."
```

---

## Task 8: Integração em GroupConversationView

**Files:**
- Modify: `src/components/chat/GroupConversationView.tsx`

- [ ] **Step 1: Adicionar imports**

No topo do arquivo, junto aos outros imports de `@/hooks/...` e `@/components/...`:

```typescript
import { useGroupTypingIndicator } from "@/hooks/useGroupTypingIndicator";
import { TypingBubble } from "@/components/chat/TypingBubble";
```

- [ ] **Step 2: Resolver instance_id**

O `GroupConversationView` recebe `instanceName` como prop. Para usar `useGroupTypingIndicator`, precisamos do `instance_id` (UUID), não do nome. Pode resolver:

(a) Se o componente já tem acesso ao `instance_id` por outra via, usar direto. Procurar por `whatsapp_instance_id` ou similar nas props.
(b) Senão, fazer uma query rápida via `useQuery` no topo:

```typescript
import { useQuery } from "@tanstack/react-query";

const { data: instanceRow } = useQuery({
  queryKey: ["whatsapp-instance-by-name", instanceName],
  queryFn: async () => {
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("instance_name", instanceName)
      .maybeSingle();
    return data;
  },
  enabled: !!instanceName,
  staleTime: 10 * 60 * 1000,
});
const instanceId = (instanceRow as any)?.id || null;
```

⚠️ Veja se já há algum `useQuery` ou hook semelhante no componente; aproveite o padrão existente.

- [ ] **Step 3: Adicionar o hook de typing**

Adicione (perto dos outros hooks):

```typescript
const typers = useGroupTypingIndicator(instanceId, group.id);
```

- [ ] **Step 4: Renderizar as bolhas após o map de mensagens**

Encontre o local onde as mensagens do grupo são renderizadas (geralmente `dayMsgs.map(...)` dentro de `dayKeys.map(...)`). Depois do final desse map exterior (de dias), antes de `<div ref={scrollEndRef}>` (ou marker similar):

```tsx
{typers.slice(0, 3).map((t) => (
  <TypingBubble
    key={t.participant_jid}
    state={t.typing_state}
    senderName={t.participant_pushname || t.participant_jid.split("@")[0]}
  />
))}
{typers.length > 3 && (
  <p className="text-[11px] text-muted-foreground text-center mt-1">
    +{typers.length - 3} pessoas digitando…
  </p>
)}
```

- [ ] **Step 5: Build local**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 6: Commit**

```bash
git add src/components/chat/GroupConversationView.tsx
git commit -m "feat(chat-group): renderiza TypingBubble por participante

Consome useGroupTypingIndicator. Mostra ate 3 bolhas simultaneas com
nome do participante; agrega '+X pessoas digitando' se passar de 3."
```

---

## Task 9: Cor da bolha de SAIDA em grupos

**Files:**
- Modify: `src/components/chat/GroupConversationView.tsx`

- [ ] **Step 1: Localizar a bolha principal de SAIDA**

Procure por `bg-primary text-primary-foreground` dentro do MessageRow component (geralmente próximo a linha 853):

```bash
```

Use Grep:
```
pattern: bg-primary text-primary-foreground
path: src/components/chat/GroupConversationView.tsx
output_mode: content
-n: true
```

- [ ] **Step 2: Trocar pela classe do chat privado**

Substitua **`bg-primary text-primary-foreground`** por **`bg-chat-bubble text-chat-bubble-foreground`** em todas as ocorrências dentro do MessageRow que se referem à bolha de SAIDA.

Padrão a substituir (linha ~853):
```tsx
isOut ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border rounded-bl-sm",
```
Vira:
```tsx
isOut ? "bg-chat-bubble text-chat-bubble-foreground rounded-br-sm" : "bg-card border rounded-bl-sm",
```

- [ ] **Step 3: Localizar o bloco de documento dentro da bolha (linha ~961)**

Procure por:
```
pattern: border-primary-foreground
path: src/components/chat/GroupConversationView.tsx
output_mode: content
-n: true
```

- [ ] **Step 4: Trocar para chat-bubble-foreground nesse bloco**

Substitua `primary-foreground` por `chat-bubble-foreground` nas classes do bloco de documento. Padrão típico:

```tsx
isOut ? "border-primary-foreground/30 bg-primary-foreground/5 hover:bg-primary-foreground/10"
//        ^^^^^^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^^
//        TROCAR estes 3 para chat-bubble-foreground em vez de primary-foreground
      : "border-border bg-muted/40 hover:bg-muted"
```

Vira:
```tsx
isOut ? "border-chat-bubble-foreground/30 bg-chat-bubble-foreground/5 hover:bg-chat-bubble-foreground/10"
      : "border-border bg-muted/40 hover:bg-muted"
```

- [ ] **Step 5: Procurar outras refs primary-foreground na bolha**

```
pattern: primary-foreground
path: src/components/chat/GroupConversationView.tsx
output_mode: content
-n: true
```

Para cada ocorrência DENTRO da bolha de SAIDA (não em DropdownMenu ou outros componentes UI globais), trocar para `chat-bubble-foreground`. Se for dúvida, deixe; o spec review verifica.

- [ ] **Step 6: Build local**

```bash
npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xs`.

- [ ] **Step 7: Testar visualmente**

Recarregue http://localhost:8090, abra um grupo. Bolhas de SAIDA devem ser teal/verde escuro (igual ao privado), não vermelho.

- [ ] **Step 8: Commit**

```bash
git add src/components/chat/GroupConversationView.tsx
git commit -m "fix(chat-group): cor da bolha de SAIDA alinhada com chat privado

Troca bg-primary (vermelho Kairoz) por bg-chat-bubble (teal/verde).
Mesma classe usada em MessageBubble.tsx no privado."
```

---

## Task 10: Push + PR + merge + smoke test

**Files:** N/A

- [ ] **Step 1: Verificar tudo commitado e working tree limpo**

```bash
git status --short
```

Expected: nada relacionado à feature (uns untracked não relacionados estão OK).

- [ ] **Step 2: Push da branch**

```bash
git push -u origin feature/typing-recording-indicator
```

Expected: `* [new branch] feature/typing-recording-indicator -> feature/typing-recording-indicator`.

- [ ] **Step 3: Abrir o PR**

```bash
gh pr create --base main --head feature/typing-recording-indicator --title "feat(chat): indicador digitando/gravando + cor bolha grupos" --body "$(cat <<'EOF'
## Summary

Spec: `docs/superpowers/specs/2026-05-14-typing-recording-indicator-design.md`
Plano: `docs/superpowers/plans/2026-05-14-typing-recording-indicator.md`

### Mudanças
- **Schema:** colunas `typing_state` + `typing_expires_at` em `leads`; nova tabela `group_typing` com RLS via `user_can_access_channel`
- **Webhook:** handler `presence.update` separa composing/recording/available/unavailable; agora trata grupos (antes ignorados); `messages.upsert` limpa typing imediatamente
- **Frontend:** 2 hooks (`useTypingIndicator`, `useGroupTypingIndicator`) + componente `<TypingBubble>` (3 dots animados ou mic+wave)
- **Cor:** bolha de SAIDA em grupos passa a usar `bg-chat-bubble` (teal/verde, igual ao privado) — não mais `bg-primary` (vermelho)

## Test plan

- [ ] Cor: abrir grupo, enviar msg → bolha teal/verde (não vermelha)
- [ ] Typing privado: pedir alguém pra digitar no WhatsApp → bolha de dots aparece em ≤2s
- [ ] Recording privado: pedir alguém pra gravar áudio → mic + wave aparece
- [ ] Typing grupo: 1 participante digitando → 1 bolha; 3+ → "+X pessoas digitando"
- [ ] Lead manda msg → bolha some em ≤2s (não espera TTL)
- [ ] Aba em background → polling pausa (sem requests no Network)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Anote o número do PR retornado.

- [ ] **Step 4: Aguardar checks**

```bash
until gh pr view <PR_NUMBER> --json mergeStateStatus 2>/dev/null | grep -q '"mergeStateStatus":"CLEAN"'; do sleep 5; done
gh pr view <PR_NUMBER> --json mergeStateStatus,statusCheckRollup
```

Expected: `mergeStateStatus: CLEAN`, `Vercel: SUCCESS`.

- [ ] **Step 5: Merge**

```bash
gh pr merge <PR_NUMBER> --merge --delete-branch=true
```

- [ ] **Step 6: Aguardar production deploy**

```bash
until gh api "repos/marcosviniiciusfs-png/CRM---Definitivo/commits/main/status" --jq '.state' 2>/dev/null | grep -qE 'success|failure'; do sleep 8; done
gh api "repos/marcosviniiciusfs-png/CRM---Definitivo/commits/main/status" --jq '{state, latest: .statuses[0].description}'
```

Expected: `state: "success"`, `description: "Deployment has completed"`.

- [ ] **Step 7: Smoke test em produção**

Abrir https://www.kairozcrm.com.br em janela anônima, fazer login com a conta `mateusabcck@gmail.com`. Verificar:

1. Ir para `/chat`
2. Abrir um grupo onde haja mensagens de SAIDA → bolha deve estar teal/verde
3. Abrir um chat privado com lead ativo → pedir pro lead digitar/gravar → ver bolha animada aparecer
4. Forçar erro: enviar uma msg do CRM imediatamente após o lead estar digitando → bolha some em ≤2s

- [ ] **Step 8: Se algo falhar — rollback**

A migration é parcialmente reversível. Se houver problema crítico:

```sql
-- Rollback SQL de emergência
ALTER TABLE public.leads DROP COLUMN IF EXISTS typing_state;
ALTER TABLE public.leads DROP COLUMN IF EXISTS typing_expires_at;
DROP TABLE IF EXISTS public.group_typing;
```

Salve como `supabase/tests/emergency_rollback_typing.sql` antes do deploy se quiser ter a vista quente. Aplicar via `npx supabase db query --linked -f`. Re-deployar a versão anterior do webhook via dashboard ou `git revert`.

---

## Self-review checklist

Antes de marcar plano como pronto:

- [ ] Toda função/RPC referenciada existe em uma task anterior (`user_can_access_channel` já existe da spec channel-access-control)
- [ ] Toda policy nova referenciada (`group_typing_select`) existe ← Task 1
- [ ] Nenhum step diz "TBD"
- [ ] Cada task tem `git commit` no final
- [ ] Branch nova criada antes da primeira mudança (Task 0)
- [ ] Plano de teste cobre todos os cenários da Spec §8 (Tasks 1-9 + smoke em Task 10)
- [ ] Tipo `'composing' | 'recording'` consistente entre hooks, componente e DB schema
- [ ] Nome da tabela `group_typing` consistente em migration, webhook, hook
- [ ] Nome da coluna `typing_state` consistente em leads + group_typing + hooks
- [ ] Polling de 2s consistente entre os 2 hooks

---

## Resumo de tasks

| # | Task | Risco | Tempo estimado |
|---|---|---|---|
| 0 | Setup branch | Baixo | 2 min |
| 1 | Migration | Baixo | 10 min |
| 2 | Webhook presence.update handler | **Médio** (substitui handler crítico) | 20 min |
| 3 | Webhook cleanup no messages.upsert | Médio | 15 min |
| 4 | useTypingIndicator hook | Baixo | 5 min |
| 5 | useGroupTypingIndicator hook | Baixo | 5 min |
| 6 | TypingBubble component | Baixo | 10 min |
| 7 | Integração Chat.tsx | Baixo | 10 min |
| 8 | Integração GroupConversationView | Médio (resolver instance_id) | 15 min |
| 9 | Cor da bolha de SAIDA em grupos | Baixo | 5 min |
| 10 | Push + PR + merge + smoke test | Médio | 20 min |

**Total estimado:** 1h45 - 2h30 com testes manuais.
