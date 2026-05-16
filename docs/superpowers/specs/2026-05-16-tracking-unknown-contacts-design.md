# Tracking por contato desconhecido + reposicionar tag no Chat

**Status:** Incremento ao spec `2026-05-15-whatsapp-tracking-design.md` (mesma feature branch `feature/whatsapp-tracking`, ainda não mergeada em main). Constraint local-first segue valendo — qualquer DB write em prod precisa de OK explícito do usuário.

**Data:** 2026-05-16

## Problema

A heurística atual de tagueamento "Lead de anúncio" depende de **keywords** baterem na primeira mensagem do lead. Funciona quando o lead manda a mensagem pré-preenchida do anúncio do Meta. Mas leads frequentemente **apagam a mensagem pré-preenchida e escrevem coisa aleatória** ("Oi", "Boa tarde", "Quero saber sobre o produto") — e perdemos o tracking.

Insight: um lead que chega no WhatsApp do canal pela primeira vez E cujo número **não está nos contatos do aparelho** é, com alta probabilidade, alguém que conseguiu o número via fonte pública (anúncio, site, indicação). Conhecidos já estariam na agenda.

Solução: heurística complementar opt-in por canal. Se ativada, leads novos cujo número não está nos contatos do aparelho recebem a tag "Lead de anúncio" mesmo se as keywords não baterem.

Bônus solicitado: mover a posição da tag no Chat — atualmente aparece ao lado do **nome** (onde aperta o layout); deve aparecer ao lado do **telefone**, que tem mais espaço horizontal.

## Não-objetivos (v1)

- **Não** modo OR exclusivo: as duas heurísticas (keyword + desconhecido) são opt-in independentes. Admin pode ligar uma, outra, ou ambas. Sem opção "AND".
- **Não** cache da lista completa de contatos. Lookup pontual por número via Evolution API por lead novo. Otimização posterior se virar gargalo.
- **Não** retroativo: leads já existentes que não foram taggeados por keyword no passado NÃO ganham tag automaticamente quando admin liga o detect_unknown_contacts.
- **Não** distinguir "fonte do tag" no banco além do `matched_keyword='__unknown_contact__'`. Sem coluna nova `tag_reason`.

## Modelo de dados

### Alterar `whatsapp_tracking_rules`

```sql
ALTER TABLE public.whatsapp_tracking_rules
  ADD COLUMN IF NOT EXISTS detect_unknown_contacts BOOLEAN NOT NULL DEFAULT false;
```

Default `false` preserva comportamento atual sem opt-in. Coluna se junta às existentes (`enabled`, `keywords`, `match_mode`, `case_sensitive`).

### `tracking_match_log`: sem mudança de schema

Coluna `matched_keyword` continua TEXT. Para tags via heurística de desconhecido, o helper insere o **sentinel `'__unknown_contact__'`**. Stats UI trata esse valor com label dedicado.

## Helper: `_shared/ad-lead-tagging.ts`

Modificação no fluxo após a leitura da rule. A função `maybeApplyAdLeadTag` ganha esse comportamento:

```
1. Lê rule. Se !rule || !enabled → return no_active_rule.
2. Extrai texto da msg. Normaliza.
3. Tenta match por keyword (se keywords não-vazias):
   - Se bate alguma → tag + log com keyword original. Return tagged.
4. NOVO: Se NÃO bateu E rule.detect_unknown_contacts === true:
   - Resolve EVOLUTION_API_URL + EVOLUTION_API_KEY (já tem helpers).
   - Lê instance_name a partir de whatsapp_instances pelo instanceId.
   - Chama POST /chat/findContacts/{instance_name} com body
     { where: { remoteJid: <senderJid> } }, timeout 5s.
   - Interpreta resposta:
     - Array vazio → desconhecido. Tag + log com '__unknown_contact__'.
     - Array com item E item.isMyContact === false → desconhecido. Tag + log.
     - Array com item E item.isMyContact === true → conhecido. Sem tag.
     - Array com item SEM campo isMyContact → trata como desconhecido
       (conservador-positivo, dado que admin opt-ou explicitamente).
   - Em qualquer erro (timeout, 4xx, 5xx, JSON parse) → NÃO tag, log warn.
5. Se nenhuma heurística bateu → return no_match.
```

Detalhe: o helper precisa do `senderJid` (formato `5511...@s.whatsapp.net`) e do `instance_name`. Hoje recebe `instanceId` (UUID interno). Vamos passar também `instanceName` e `senderJid` como novos argumentos. Webhook já tem essas duas variáveis em escopo no ponto da chamada (`instance` é o nome, `messageKey.remoteJid` é o JID).

Nova assinatura:

```ts
interface MaybeApplyAdLeadTagArgs {
  supabase: SupabaseClient;
  organizationId: string;
  leadId: string;
  instanceId: string;
  instanceName: string;        // NOVO — para chamada na Evolution API
  senderJid: string;           // NOVO — formato @s.whatsapp.net
  messageInfo: any;
}
```

`reason` adiciona valores: `'unknown_contact_check_failed'` (API erro), `'contact_known'` (achou e é conhecido).

## UI

### Modal `TrackingChannelDialog`

Adiciona um **segundo card de toggle** abaixo do existente "Trackear este canal", dentro do mesmo `space-y-4`:

```tsx
{/* Toggle existente: master enabled */}
<div className="flex items-center justify-between p-3 border ...">
  Trackear este canal + switch
</div>

{/* NOVO: detect unknown contacts */}
<div className={cn(
  "flex items-center justify-between p-3 border border-border rounded-md bg-muted/30",
  !enabled && "opacity-50 pointer-events-none"
)}>
  <div>
    <Label className="text-sm font-medium">
      Detectar contatos desconhecidos
    </Label>
    <p className="text-[11px] text-muted-foreground mt-0.5">
      Tagueia leads cujo número não está na agenda do aparelho do canal.
      Útil pra pegar leads que apagaram a mensagem pré-preenchida do anúncio.
    </p>
  </div>
  <Switch
    checked={detectUnknown}
    disabled={!canEdit || !enabled}
    onCheckedChange={handleDetectUnknownToggle}
    aria-label="Detectar contatos desconhecidos"
    className="data-[state=checked]:bg-green-500"
  />
</div>

{/* Keywords editor (existente, gated por enabled) */}
...
{/* Stats (existente) */}
...
```

Estado local mirror estende: além de `enabled`, `keywords`, agora `detectUnknown`. Mesmo padrão de debounce 800ms. `scheduleSave` aceita `detect_unknown_contacts?: boolean` no patch.

### Card compacto `TrackingChannelCard`

Footer do card ganha indicador quando `detect_unknown_contacts === true`. Layout:

```
[●] Mateus                              [ON ●green]
    +55 94 9216-1227
    ─────────────────────────────────
    3 palavras • 📵 desconhecidos • Configurar →
```

Se nenhuma das heurísticas tem dados (keywords vazias E detect_unknown_contacts=false), mostra apenas "0 palavras cadastradas".

### Stats `TrackingChannelStats`

Lista de keywords renderiza uma entrada extra quando aplicável:

- Antes da lista de keywords cadastradas, se `counts['__unknown_contact__'] > 0`, mostra uma linha destacada:

```tsx
<div className="flex items-center justify-between gap-2 px-2 py-1 rounded text-[11px] bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100">
  <span className="flex-1 flex items-center gap-1">
    <UserX className="h-3 w-3" /> Número desconhecido
  </span>
  <span className="font-mono tabular-nums font-medium">{counts['__unknown_contact__']}</span>
</div>
```

Counter `total` no header já inclui automaticamente.

### Reposicionar tag no Chat (`ChatLeadItem`)

Hoje a tag aparece ao lado do **nome** do lead, espremendo o layout. Move pra ao lado do **telefone** (linha abaixo), que tem mais espaço.

Layout atual (esquema):
```
[avatar] Mateus Brito SUPOR... [Lead de anúncio]
         +55 94 9103-1837
         Marcos santos
```

Layout novo:
```
[avatar] Mateus Brito SUPORTE
         +55 94 9103-1837 [Lead de anúncio]
         Marcos santos
```

Mudança em `src/components/chat/ChatLeadItem.tsx`: o `<LeadTagsBadge>` move da linha do nome pra logo após o número de telefone. O fix de truncation (icon+tooltip) feito antes continua valendo.

## Migration

Arquivo: `supabase/migrations/20260516120000_tracking_detect_unknown_contacts.sql`

```sql
-- ============================================================
-- Tracking: detect_unknown_contacts
-- ============================================================
-- Heuristica complementar: leads cujo numero nao esta na agenda do
-- aparelho do canal recebem tag "Lead de anuncio" mesmo sem match
-- de keyword. Opt-in por canal. Default false preserva comportamento.
-- ============================================================

ALTER TABLE public.whatsapp_tracking_rules
  ADD COLUMN IF NOT EXISTS detect_unknown_contacts BOOLEAN NOT NULL DEFAULT false;
```

Sem RLS adicional (column herda policies da tabela). Sem realtime publication.

## Steps de implementação (preview)

1. Migration `tracking_detect_unknown_contacts.sql` (criar arquivo, controlador aplica).
2. Atualizar tipos no frontend (`TrackingRule.detect_unknown_contacts`).
3. Atualizar `useTrackingRules.upsertRule` para aceitar `detect_unknown_contacts` no patch.
4. Atualizar `ad-lead-tagging.ts`: nova assinatura + lógica de contato desconhecido + chamada Evolution API.
5. Atualizar webhook: passar `instanceName` e `senderJid` na chamada do helper.
6. Atualizar `TrackingChannelDialog`: 2º toggle + estado + save.
7. Atualizar `TrackingChannelCard`: indicador "📵 desconhecidos" no footer.
8. Atualizar `TrackingChannelStats`: linha especial para `'__unknown_contact__'`.
9. Atualizar `ChatLeadItem`: mover `LeadTagsBadge` da linha do nome para após o telefone.
10. Aplicar migration em prod (gated em OK do usuário).
11. Redeploy do webhook em prod.
12. Smoke test final.

## Constraint operacional

LOCAL-FIRST mantido. Migration não aplica em prod sem o usuário confirmar. Webhook só redeploya após migration estar aplicada onde ela for testada.

## Edge cases consolidados

1. **Evolution API down/timeout (5s)** → não tagueia por desconhecido, logado como warn. Keyword path independente continua.
2. **Resposta sem `isMyContact`** → trata como desconhecido (admin opt-in explícito).
3. **Ambas heurísticas batem** (keyword + desconhecido) → tag aplica uma vez, log preserva a keyword (mais informativa).
4. **Lead já existente envia msg** → helper não roda (semântica de "lead novo" intacta).
5. **`detect_unknown_contacts=true` mas `enabled=false`** → master-toggle bloqueia, nada roda.
6. **Performance** → 1 call extra na Evolution API por lead novo do canal opt-in. <300ms esperado. Sem cache no v1.
7. **Reposicionamento da tag no Chat** → afeta TODOS os tipos de tag, não só "Lead de anúncio". Outros usos visuais (Pipeline, página de Leads) NÃO mudam — só ChatLeadItem.

## Componentes (resumo)

| Arquivo | Ação |
|---|---|
| `supabase/migrations/20260516120000_tracking_detect_unknown_contacts.sql` | Create |
| `supabase/functions/_shared/ad-lead-tagging.ts` | Modify (extensão da assinatura + lógica) |
| `supabase/functions/whatsapp-message-webhook/index.ts` | Modify (passa instanceName + senderJid) |
| `src/hooks/useTrackingRules.ts` | Modify (campo novo no type + upsertRule) |
| `src/components/integrations/TrackingChannelDialog.tsx` | Modify (2º toggle + state) |
| `src/components/integrations/TrackingChannelCard.tsx` | Modify (indicador no footer) |
| `src/components/integrations/TrackingChannelStats.tsx` | Modify (linha especial unknown_contact) |
| `src/components/chat/ChatLeadItem.tsx` | Modify (mover tag pra linha do telefone) |

## Testes (esboço)

- Manual local após deploy:
  - Cenário A — keyword bate: tag aplica como antes (regressão zero).
  - Cenário B — keyword falha, `detect_unknown_contacts=true`, número novo desconhecido: tag aplica via heurística.
  - Cenário C — keyword falha, número está nos contatos: sem tag.
  - Cenário D — Evolution API timeout: sem tag, logado.
  - Cenário E — Stats: barra "Número desconhecido" aparece com counter quando tags via heurística existem.
  - Cenário F — Chat: tag aparece na linha do telefone, não do nome.

## Aberto (deferido)

- Cache de contatos por instance (TTL ~5min) se Evolution API ficar lenta.
- Suporte a múltiplas tags por canal (segmentação por campanha).
- Aplicação retroativa em leads históricos.
