# Spec — Tag cinza no card de lead redistribuído da etapa Perdido

**Data:** 2026-05-19
**Stakeholder:** Hurtz (owner)
**Tipo:** UI — diferenciação visual do badge de redistribuição por `trigger_source`

## Contexto

A redistribuição de leads na etapa Perdido já funciona ponta a ponta (ver [[2026-05-07-redistribute-by-collaborator-and-lost-fix]]):

- O owner clica "Redistribuir Perdidos" → escolhe roleta destino → backend processa
- Leads vão para o **topo** (`position: 0`) da **primeira etapa do funil configurado na roleta**
- Cada redistribuição é gravada em `lead_distribution_history` com `trigger_source = 'lost_redistribution'` e `is_redistribution = true`

Hoje, qualquer lead com `is_redistribution = true` no histórico recebe no card:

- **Border azul** (`border-blue-900 dark:border-blue-800`)
- **Badge "Redistribuído" azul** (`bg-blue-950 text-blue-300 border-blue-800`)
- **Tooltip:** "Lead redistribuído automaticamente pois o colaborador anterior (X) não interagiu dentro de Y min"

Isso é correto para `trigger_source = 'auto_redistribution'` (timeout de inatividade), mas **errado para `lost_redistribution`**: a lead estava em Perdido, não havia "timeout de interação". O tooltip mente.

Além disso, visualmente o owner não consegue distinguir, batendo o olho no pipeline, se aquele lead veio de "Perdido recuperado" (oportunidade revisitada) ou de "agente largou a bola" (precisa cobrar o agente anterior). Os dois casos pedem ações diferentes.

## Resultado esperado

Lead redistribuída a partir da etapa Perdido aparece no Pipeline com:

- **Badge "Redistribuído" cinza** (Tailwind slate)
- **Border cinza-escuro** no card (sutil, igual ao azul de hoje porém em slate)
- **Tooltip:** "Lead recuperado da etapa Perdido e redistribuído via roleta"

Outras redistribuições (`auto_redistribution`, `manual`, etc.) continuam com a aparência azul e tooltip atuais — comportamento inalterado.

A lógica de "qual badge mostrar" lê `trigger_source` da entrada mais recente em `lead_distribution_history` para aquele lead.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Diferenciar por motivo ou padronizar tudo cinza? | **Diferenciar.** Cinza só para `lost_redistribution`. Azul para `auto_redistribution`. Cinza também para `manual` (redistribuição de colaborador, vai junto). |
| Mostrar até quando? | **Mesma regra de hoje** — badge aparece enquanto a linha em `lead_distribution_history` for a mais recente para aquele lead. Quando o lead muda de stage ou ganha nova entrada de histórico não-redistribuição, o badge some naturalmente na próxima visita. (Não vamos adicionar TTL nem flag de "dismiss" — YAGNI.) |
| Cor exata do cinza | **slate-700 / slate-300** dark mode. Em light mode `bg-slate-100 text-slate-700 border-slate-300`. Combina com o look do CRM (não usa amarelo, vermelho ou verde que já têm significado). |
| Backend muda? | **Não.** `trigger_source: 'lost_redistribution'` já é gravado em [redistribute-lost-leads/index.ts:298](../../supabase/functions/redistribute-lost-leads/index.ts#L298). |
| Cards mobile também? | **Sim.** [MobileLeadCard.tsx](../../src/components/MobileLeadCard.tsx) tem o mesmo problema (hoje usa purple), mesma correção. |

## Componentes

### 1. Backend — `lead_distribution_history`

**Sem mudanças.** Coluna `trigger_source` já existe com os valores corretos.

### 2. Frontend — query em `Pipeline.tsx`

**Arquivo:** [src/pages/Pipeline.tsx](../../src/pages/Pipeline.tsx)

**Mudança 1 — adicionar `trigger_source` no SELECT:**

```ts
// Linha ~1040 (loadRedistributionData)
const { data } = await supabase
  .from('lead_distribution_history')
  .select('lead_id, from_user_id, config_id, trigger_source, created_at') // + trigger_source
  .in('lead_id', leadIds)
  .eq('is_redistribution', true)
  .order('created_at', { ascending: false });
```

**Mudança 2 — propagar `trigger_source` no `redistributedMap`:**

Atualizar o tipo do state:

```ts
const [redistributedMap, setRedistributedMap] = useState<Record<string, {
  fromName: string;
  minutes: number;
  triggerSource: string; // novo
}>>({});
```

Salvar `triggerSource: row.trigger_source` nos dois lugares onde o map é populado:
- `loadRedistributionData` (linha ~1074)
- O listener realtime que adiciona uma entrada nova (linha ~422)

**Mudança 3 — passar para o card:**

Em `PipelineColumn` (linha ~132) e `MobilePipelineView` (linha ~169), já é passado um `redistributedMap[lead.id]` — só precisa o card consumir o novo campo.

### 3. Frontend — `LeadCard.tsx`

**Arquivo:** [src/components/LeadCard.tsx](../../src/components/LeadCard.tsx)

**Prop nova:** `redistributionReason?: 'inactivity' | 'lost' | 'manual'`

Derivar de `triggerSource`:
- `'lost_redistribution'` → `'lost'`
- `'auto_redistribution'` → `'inactivity'`
- `'manual'` → `'manual'`
- qualquer outro → `'inactivity'` (default seguro, mantém comportamento atual)

**Lógica de cor (linha ~266, border):**

```tsx
hasRedBorder && !dragging
  ? "border-border animate-glow-pulse"
  : isRedistributed && !dragging && redistributionReason === 'inactivity'
  ? "border-blue-900 dark:border-blue-800 hover:border-blue-700 hover:shadow-[0_4px_18px_0_rgba(30,58,138,0.35)]"
  : isRedistributed && !dragging && (redistributionReason === 'lost' || redistributionReason === 'manual')
  ? "border-slate-600 dark:border-slate-500 hover:border-slate-400 hover:shadow-[0_4px_18px_0_rgba(100,116,139,0.35)]"
  : isDuplicate && !dragging
  ? "border-yellow-400 ..."
  ...
```

**Lógica de badge (linha ~288):**

```tsx
{isRedistributed && (() => {
  const isLost = redistributionReason === 'lost';
  const isManual = redistributionReason === 'manual';
  const isInactivity = redistributionReason === 'inactivity';

  const className = isInactivity
    ? "bg-blue-950 text-blue-300 border-blue-800"
    : "bg-slate-800 text-slate-300 border-slate-700";

  const tooltip = isLost
    ? "Lead recuperado da etapa Perdido e redistribuído via roleta"
    : isManual
    ? `Lead redistribuído via roleta${redistributedFromName ? ` (vinha do colaborador ${redistributedFromName})` : ''}`
    : redistributedFromName && redistributionMinutes
    ? `Lead redistribuído automaticamente pois o colaborador anterior (${redistributedFromName}) não interagiu dentro de ${redistributionMinutes} min`
    : "Lead redistribuído automaticamente para este colaborador";

  return (
    <Badge variant="secondary" title={tooltip}
      className={`w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 ${className} cursor-default`}>
      <RefreshCw className="h-2.5 w-2.5" />
      Redistribuído
    </Badge>
  );
})()}
```

**Memo:** atualizar a função de comparação na linha ~640 para incluir `redistributionReason`.

### 4. Frontend — `MobileLeadCard.tsx`

**Arquivo:** [src/components/MobileLeadCard.tsx](../../src/components/MobileLeadCard.tsx)

Mesma prop `redistributionReason`. Duas mudanças em [MobileLeadCard.tsx:180-184](../../src/components/MobileLeadCard.tsx#L180-L184):

1. **Gating:** hoje só renderiza quando `redistributedFromName` está presente. Em `lost_redistribution`, o lead pode nunca ter tido `from_user_id` (entrou direto em Perdido sem agente). Trocar para gating por `reason`:

   ```tsx
   {isRedistributed && (redistributionReason !== 'inactivity' || redistributedFromName) && (
     <span className={cn(
       'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border',
       redistributionReason === 'inactivity'
         ? 'bg-blue-50 text-blue-700 border-blue-200'
         : 'bg-slate-100 text-slate-700 border-slate-300'
     )}>
       <RefreshCw className="h-2.5 w-2.5" />Redistribuído
     </span>
   )}
   ```

   Justificativa: `inactivity` precisa do nome (tooltip implícito faz parte do significado). `lost` e `manual` aparecem mesmo sem nome anterior.

2. **Mobile não tem tooltip** — toque ≠ hover. O texto do badge fica só "Redistribuído"; o owner consulta o detalhe da lead se quiser saber mais.

### 5. Frontend — `PipelineColumn.tsx` e `MobilePipelineView.tsx`

**Arquivos:** [src/components/PipelineColumn.tsx](../../src/components/PipelineColumn.tsx), [src/components/MobilePipelineView.tsx](../../src/components/MobilePipelineView.tsx)

Passar `redistributionReason` derivado de `redistributedMap[lead.id]?.triggerSource` para o card:

```tsx
redistributionReason={(() => {
  const t = redistributedMap[lead.id]?.triggerSource;
  if (t === 'lost_redistribution') return 'lost';
  if (t === 'manual') return 'manual';
  return 'inactivity'; // default seguro
})()}
```

Helper pequeno extraído para `src/lib/redistribution.ts` para evitar duplicação:

```ts
export type RedistributionReason = 'inactivity' | 'lost' | 'manual';

export function mapTriggerSourceToReason(triggerSource?: string | null): RedistributionReason {
  if (triggerSource === 'lost_redistribution') return 'lost';
  if (triggerSource === 'manual') return 'manual';
  return 'inactivity';
}
```

## Casos de borda

| Caso | Comportamento |
|---|---|
| Lead nunca foi redistribuída | Sem badge. (Igual hoje — `redistributedMap[lead.id]` undefined.) |
| Lead redistribuída por timeout | Badge azul + tooltip atual. (Inalterado.) |
| Lead redistribuída da etapa Perdido | Badge cinza + tooltip novo. |
| Lead redistribuída via "Redistribuir colaborador" | Badge cinza + tooltip "via roleta". |
| Lead com `from_user_id` nulo (caso lost sem agente anterior) | Badge cinza renderiza normalmente. Tooltip não cita nome. |
| `trigger_source` desconhecido em dados antigos | Default `'inactivity'` — badge azul (mantém compatibilidade visual com leads anteriores). |
| Lead foi movida após redistribuição | Badge continua até nova entrada de histórico não-redistribuição substituir. Sem mudança de regra. |
| Dark mode | Slate-800/slate-300 com border slate-700 → contraste OK. Light mode slate-100/slate-700/slate-300 idem. |
| Mobile vs Desktop | Ambos cobertos. Mobile sem tooltip por design (toque ≠ hover). |

## Arquivos afetados

- **Editado:** [src/pages/Pipeline.tsx](../../src/pages/Pipeline.tsx) — `select` + tipo do state + 2 lugares que setam o map
- **Editado:** [src/components/LeadCard.tsx](../../src/components/LeadCard.tsx) — prop, border, badge, memo
- **Editado:** [src/components/MobileLeadCard.tsx](../../src/components/MobileLeadCard.tsx) — prop, badge
- **Editado:** [src/components/PipelineColumn.tsx](../../src/components/PipelineColumn.tsx) — passar reason
- **Editado:** [src/components/MobilePipelineView.tsx](../../src/components/MobilePipelineView.tsx) — passar reason
- **Novo:** [src/lib/redistribution.ts](../../src/lib/redistribution.ts) — helper `mapTriggerSourceToReason`

## Testes manuais (golden path)

1. **Setup:** Org com 3 leads:
   - Lead A nunca redistribuída
   - Lead B redistribuída por timeout (`auto_redistribution`)
   - Lead C redistribuída a partir de Perdido (`lost_redistribution`)

2. **Pipeline (desktop):**
   - A sem badge
   - B com badge azul + tooltip menciona "X min"
   - C com badge **cinza** + tooltip "Lead recuperado da etapa Perdido"
   - Border do card de C também cinza (não azul)

3. **Pipeline (mobile):**
   - B com badge azul
   - C com badge cinza

4. **Regression check:**
   - Leads antigas (banco já tem `trigger_source` mas talvez não `lost_redistribution`) continuam com cor azul. Sem regressão de cor inesperada.

## Fora de escopo

- TTL/expiração do badge — fica como o comportamento atual (badge enquanto for a entrada mais recente).
- Filtro no Pipeline ("mostrar só leads redistribuídos da etapa Perdido") — YAGNI. Pode entrar em follow-up se virar dor.
- Mudar a cor da `DistributionTimeline` em outras telas (admin). Esta spec é só do card do lead no Pipeline.
- Backend / migration — zero mudança.
