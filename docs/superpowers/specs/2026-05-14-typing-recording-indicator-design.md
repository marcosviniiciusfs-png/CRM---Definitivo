# Indicador "digitando…" / "gravando áudio…" + cor da bolha de grupos

**Data:** 2026-05-14
**Status:** Aguardando review do usuário
**Escopo:** Chat privado + Chat de grupos

## 1. Problema

Dois ajustes na sessão Chat:

1. **Cor da bolha de saída em grupos** hoje usa `bg-primary` (vermelho Kairoz), inconsistente com o privado que usa `bg-chat-bubble` (teal/verde). Quebra a expectativa de coerência visual entre os dois chats.

2. **Sem indicador de "digitando…"/"gravando áudio…"** no CRM. Quando o lead (ou um participante de grupo) começa a digitar ou gravar no WhatsApp, o usuário do CRM não vê. O Evolution já emite `presence.update` com `lastKnownPresence ∈ {available, composing, recording, unavailable, paused}`, mas o webhook hoje colapsa `composing` + `recording` + `available` num único booleano `is_online`, perdendo a distinção. Grupos são explicitamente ignorados.

## 2. Escopo

### No escopo
- Bolha de SAIDA em `GroupConversationView` muda para `bg-chat-bubble`/`text-chat-bubble-foreground` (igual privado).
- Webhook captura `composing` e `recording` separadamente para privado e grupos.
- Frontend mostra **bolha animada no fim da conversa** quando o lead/participante está digitando ou gravando.
- TTL automático (12s) — não depende de Evolution emitir o "stop typing".
- `messages.upsert` limpa o typing state do sender imediatamente.

### Fora do escopo
- Indicador no header da conversa (ficou só na bolha no fim).
- Histórico de presença (não persistimos transições para análise).
- Notificações desktop quando o lead começa a digitar.
- Presença "online" continua usando `is_online` separadamente; este spec só mexe em `typing_state`.

## 3. Arquitetura

Evento Evolution → webhook escreve em colunas/tabela no Postgres → frontend faz polling de 2s e lê o estado. Sem realtime broadcast (consistente com o resto do chat que usa polling 2-3s, evita dependência do Realtime do projeto, e dá persistência do estado se o user abrir a conversa depois).

```
Lead/participante digita no WhatsApp
   ↓
Evolution emite presence.update {lastKnownPresence: 'composing'}
   ↓
webhook (whatsapp-message-webhook):
   - privado: UPDATE leads SET typing_state='composing', typing_expires_at=now()+12s
   - grupo:   UPSERT group_typing (instance, group, participant) SET typing_state='composing', expires_at=now()+12s
   ↓
Frontend (polling 2s):
   - useTypingIndicator(leadId) le leads.typing_state
   - useGroupTypingIndicator(instance, group) le group_typing
   - filtra por expires_at > now()
   ↓
<TypingBubble> renderiza no fim da lista de mensagens
```

## 4. Schema (DDL)

Em uma nova migration `20260514120000_typing_indicator.sql`:

```sql
-- 4.1 Privado: colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS typing_state text
    CHECK (typing_state IN ('composing','recording')),
  ADD COLUMN IF NOT EXISTS typing_expires_at timestamptz;

-- Indice para limpeza futura (opcional, ajuda em queries por estado ativo)
CREATE INDEX IF NOT EXISTS idx_leads_typing_active
  ON public.leads (id)
  WHERE typing_state IS NOT NULL;

-- 4.2 Grupos: tabela dedicada (uma linha por participante digitando)
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

-- 4.3 RLS — segue o padrao da spec channel-access-control
ALTER TABLE public.group_typing ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_typing_select ON public.group_typing
  FOR SELECT TO authenticated
  USING (public.user_can_access_channel(whatsapp_instance_id));

-- INSERT/UPDATE/DELETE so via service_role (webhooks), nao expomos para authenticated.

-- 4.4 Add to realtime publication (frontend pode optar por subscribe futuramente)
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_typing;
```

### Limpeza de linhas expiradas

Frontend filtra por `expires_at > now()`, mas linhas mortas acumulam. Duas opções:
- **(escolhida)** Cron diário: `DELETE FROM group_typing WHERE expires_at < now() - interval '1 hour'`. Adiciona como migration.
- Alternativa: deletar inline a cada UPSERT (caro). Não.

Pra `leads.typing_state`, não tem cleanup separado — o UPDATE do webhook seta `NULL` no fluxo natural (recebimento de mensagem ou transição para `available`/`unavailable`).

## 5. Webhook (`whatsapp-message-webhook/index.ts`)

### 5.1 Handler `presence.update` reescrito

```typescript
const TYPING_TTL_MS = 12_000; // 12s — WhatsApp tipico e 10s, deixa folga

if (event === 'presence.update' || event === 'PRESENCE_UPDATE') {
  const remoteJid = data?.id || data?.remoteJid || '';
  const presencesObj = data?.presences || {};

  // Pegar org_id da instancia (necessario tanto para privado quanto grupo)
  const { data: presenceInstance } = await supabase
    .from('whatsapp_instances')
    .select('id, organization_id')
    .eq('instance_name', instance)
    .maybeSingle();
  if (!presenceInstance) return ok();

  // ----- GRUPO -----
  if (remoteJid.endsWith('@g.us')) {
    // Evolution envia presences como dict { "<participant_jid>": { lastKnownPresence } }
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
        // available, unavailable, paused → limpar
        await supabase.from('group_typing')
          .delete()
          .eq('whatsapp_instance_id', presenceInstance.id)
          .eq('group_id', remoteJid)
          .eq('participant_jid', participantJid);
      }
    }
    return ok();
  }

  // ----- PRIVADO -----
  let lastKnownPresence =
    data?.presence
    || data?.lastKnownPresence
    || (remoteJid && presencesObj[remoteJid]?.lastKnownPresence)
    || (Object.values(presencesObj)[0] as any)?.lastKnownPresence;
  if (!lastKnownPresence) return ok();

  const presencePhone = extractPhoneNumber(remoteJid);
  if (!presencePhone || presencePhone.length < 8) return ok();

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TYPING_TTL_MS).toISOString();

  let update: Record<string, any> = { updated_at: nowIso };
  if (lastKnownPresence === 'composing' || lastKnownPresence === 'recording') {
    update.typing_state = lastKnownPresence;
    update.typing_expires_at = expiresAt;
    update.is_online = true;
    update.last_seen = null;
  } else if (lastKnownPresence === 'available') {
    update.typing_state = null;
    update.typing_expires_at = null;
    update.is_online = true;
    update.last_seen = null;
  } else { // unavailable, paused, etc
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

  return ok();
}
```

### 5.2 Limpar typing state no `messages.upsert`

Quando uma mensagem realmente chega, o sender obviamente parou de digitar. Limpar imediatamente para a bolha sumir sem esperar TTL.

**Privado** — depois do INSERT em `mensagens_chat` (no fluxo de leads):
```typescript
// Lead acabou de enviar msg → nao esta mais digitando
await supabase
  .from('leads')
  .update({ typing_state: null, typing_expires_at: null })
  .eq('id', leadId);
```

**Grupo** — depois do INSERT em `mensagens_grupo`, usando `senderJid`:
```typescript
if (senderJid) {
  await supabase
    .from('group_typing')
    .delete()
    .eq('whatsapp_instance_id', instanceId)
    .eq('group_id', remoteJid)
    .eq('participant_jid', senderJid);
}
```

## 6. Frontend

### 6.1 Hooks

**Novo arquivo:** `src/hooks/useTypingIndicator.ts`

```typescript
/**
 * Polling 2s da coluna typing_state do lead. Retorna estado atual
 * filtrando por expires_at > now() (defesa contra Evolution nao emitir stop).
 *
 * Pausa quando a aba esta em background (document.visibilityState).
 */
export function useTypingIndicator(leadId: string | null): 'composing' | 'recording' | null {
  const [state, setState] = useState<'composing' | 'recording' | null>(null);

  useEffect(() => {
    if (!leadId) { setState(null); return; }
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data } = await (supabase as any)
        .from('leads')
        .select('typing_state, typing_expires_at')
        .eq('id', leadId)
        .maybeSingle();
      if (cancelled) return;
      if (!data?.typing_state || new Date(data.typing_expires_at) <= new Date()) {
        setState(null);
      } else {
        setState(data.typing_state);
      }
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [leadId]);

  return state;
}
```

**Novo arquivo:** `src/hooks/useGroupTypingIndicator.ts`

```typescript
interface GroupTyper {
  participant_jid: string;
  participant_pushname: string | null;
  typing_state: 'composing' | 'recording';
}

export function useGroupTypingIndicator(
  instanceId: string | null,
  groupId: string | null
): GroupTyper[] {
  const [typers, setTypers] = useState<GroupTyper[]>([]);

  useEffect(() => {
    if (!instanceId || !groupId) { setTypers([]); return; }
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === 'hidden') return;
      const { data } = await (supabase as any)
        .from('group_typing')
        .select('participant_jid, participant_pushname, typing_state, expires_at')
        .eq('whatsapp_instance_id', instanceId)
        .eq('group_id', groupId)
        .gt('expires_at', new Date().toISOString());
      if (cancelled) return;
      setTypers(data || []);
    };
    tick();
    const interval = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [instanceId, groupId]);

  return typers;
}
```

### 6.2 Componente `<TypingBubble>`

**Novo arquivo:** `src/components/chat/TypingBubble.tsx`

```typescript
interface TypingBubbleProps {
  state: 'composing' | 'recording';
  senderName?: string;        // exibido em grupos; null no privado
  senderAvatarUrl?: string;   // ditto
}

export function TypingBubble({ state, senderName, senderAvatarUrl }: TypingBubbleProps) {
  return (
    <div className="flex items-end gap-2 justify-start">
      {senderAvatarUrl && (
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarImage src={senderAvatarUrl} />
          <AvatarFallback>{(senderName || '?').slice(0, 2).toUpperCase()}</AvatarFallback>
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
}

// 3 dots animados em sequencia
function TypingDots() {
  return (
    <span className="inline-flex gap-1 items-end h-4">
      {[0, 1, 2].map(i => (
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

// Mic pulsante + barrinhas tipo "wave" simulando audio
function RecordingWave() {
  return (
    <span className="inline-flex items-center gap-2 h-4 text-muted-foreground">
      <Mic className="h-3.5 w-3.5 animate-pulse text-primary" />
      <span className="inline-flex items-end gap-0.5 h-4">
        {[0, 1, 2, 3].map(i => (
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

### 6.3 Integração nos containers de chat

**Chat privado** (na lista de mensagens dentro de Chat.tsx, depois do `.map` das mensagens):
```typescript
const typingState = useTypingIndicator(selectedLead?.id || null);
// ...no JSX, depois do .map de mensagens:
{typingState && (
  <TypingBubble
    state={typingState}
    senderAvatarUrl={selectedLead?.avatar_url}
  />
)}
```

**Grupos** (`GroupConversationView.tsx`, similar):
```typescript
const typers = useGroupTypingIndicator(instanceId, group.id);
// ...no JSX, depois do .map de mensagens:
{typers.slice(0, 3).map(t => (
  <TypingBubble
    key={t.participant_jid}
    state={t.typing_state}
    senderName={t.participant_pushname || t.participant_jid.split('@')[0]}
  />
))}
{typers.length > 3 && (
  <p className="text-[11px] text-muted-foreground text-center">
    +{typers.length - 3} pessoas digitando…
  </p>
)}
```

### 6.4 Auto-scroll

A bolha aparece junto com as mensagens — o `scrollEndRef.current?.scrollIntoView()` que já existe no auto-scroll de novas msgs cobre isso. Se o usuário rolou pra cima, **não** força scroll (evita pular onde ele está lendo). Isso já é o comportamento atual dos hooks de mensagens — não precisa mudar nada.

### 6.5 Cor das bolhas de grupos (Seção A do design)

Em `GroupConversationView.tsx`:

```typescript
// linha ~853 (MessageRow JSX da bolha principal):
isOut ? "bg-chat-bubble text-chat-bubble-foreground rounded-br-sm" : "bg-card border rounded-bl-sm",
//        ^ era bg-primary text-primary-foreground

// linha ~961 (bloco de documento dentro da bolha):
isOut ? "border-chat-bubble-foreground/30 bg-chat-bubble-foreground/5 hover:bg-chat-bubble-foreground/10"
//        ^ era border-primary-foreground/30 bg-primary-foreground/5 hover:bg-primary-foreground/10
```

Procurar globalmente outras refs a `primary-foreground` dentro da bolha de saída e trocar — o spec review pega.

## 7. Tratamento de erro / edge cases

| Caso | Comportamento |
|---|---|
| Evolution não envia "stop typing" | TTL de 12s expira → frontend filtra `expires_at > now()` → bolha some |
| Lead manda mensagem enquanto bolha está visível | `messages.upsert` limpa `typing_state` no DB → próximo tick de polling (≤2s) sume |
| Multi-participantes digitando em grupo | Renderiza até 3 bolhas; "+ X pessoas" se mais |
| Aba do navegador em background | `visibilityState !== 'visible'` pausa o polling — economia de bateria/banda |
| Sem `participant_pushname` (Evolution não enviou) | Fallback: número formatado a partir do JID |
| `group_typing` table não foi criada ainda no DB | `.from('group_typing')` falha silenciosamente; hook retorna `[]` |
| Race: msg do user no CRM E typing do lead chegando junto | Não há conflito — typing é do lado do lead, msg do user vai pelo outbound. Estados independentes. |

## 8. Plano de teste

### 8.1 DB
- Migration aplica sem erro: `psql ... -f 20260514120000_typing_indicator.sql`
- `INSERT INTO group_typing (...)` como service_role: OK
- `SELECT FROM group_typing` como authenticated SEM access ao canal: 0 linhas (RLS bloqueia)
- `SELECT FROM group_typing` como authenticated COM access: linhas visíveis

### 8.2 Webhook
- Simular `presence.update` de privado com `composing`: lead.typing_state vira 'composing', typing_expires_at = now+12s
- Simular `recording`: lead.typing_state vira 'recording'
- Simular `available`: lead.typing_state vira NULL
- Simular `presence.update` de grupo com 2 participantes em `composing`: 2 rows em `group_typing`
- Simular `messages.upsert` de privado: lead.typing_state vira NULL (mesmo se Evolution não emitiu stop)
- Simular `messages.upsert` de grupo: row do sender é deletada

### 8.3 Frontend manual
- Abrir conversa privada com lead → pedir alguém pra digitar → ver bolha aparecer ≤2s
- Idem para gravação de áudio
- Lead manda msg → bolha some em ≤2s
- Bolha não aparece quando aba está em background (verifica console: tick pausado)
- Em grupo: 1 participante digitando → 1 bolha; 3 simultâneos → 3 bolhas; 5 simultâneos → 3 bolhas + "+2 pessoas digitando"

### 8.4 Cor da bolha em grupos
- Abrir um grupo, enviar uma msg → ver bolha teal/verde (não vermelho)

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Polling 2s adiciona ~30 req/min por usuário ativo no chat | Aceitável — está alinhado com o polling de mensagens. Pausa em background. |
| Evolution muda formato de `presences` | Defensive coding (várias estratégias para extrair `lastKnownPresence`). Já feito no handler atual; mantido. |
| `group_typing` cresce indefinidamente em orgs ativas | Limpeza inline + cleanup cron diário. |
| Mudança de cor pode quebrar contraste em modo escuro | `chat-bubble` já está testado em modo escuro no privado — sem regressão esperada. |

## 10. Migration order (deploy)

1. **Migration SQL** (`20260514120000_typing_indicator.sql`). Aplicar via `supabase db query --linked -f`.
2. **Deploy `whatsapp-message-webhook`** com novo handler + limpeza no `messages.upsert`.
3. **Deploy frontend** (cor + hooks + componente + integrações em Chat.tsx + GroupConversationView.tsx).

Etapa 1+2 ativam captura no backend; etapa 3 mostra na UI. Sem dependência cruzada.

## 11. Decisões registradas

- Indicador renderizado como **bolha animada no fim da conversa** (não no header).
- Transporte via **DB + polling 2s** (consistente com mensagens).
- TTL de **12s**, com limpeza imediata no `messages.upsert`.
- Grupos mostram **até 3 bolhas simultâneas**, depois agrega como "+X pessoas".
- Polling **pausa em background** (`visibilityState !== 'visible'`).
- Cor da bolha de SAIDA em grupos passa a ser `bg-chat-bubble` (mesmo do privado).
