# Tag cinza no card de lead redistribuído da etapa Perdido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Diferenciar visualmente, no card do lead, redistribuições oriundas da etapa Perdido (cinza) vs por inatividade (azul atual) vs manual (cinza). Backend já grava `trigger_source` em `lead_distribution_history`; só precisamos ler isso e renderizar condicionalmente.

**Architecture:** Helper compartilhado mapeia `trigger_source` → `RedistributionReason`. `Pipeline.tsx` adiciona `trigger_source` no SELECT e propaga em `redistributedMap`. `PipelineColumn` e `MobilePipelineView` passam `redistributionReason` derivado. `LeadCard` e `MobileLeadCard` recebem a prop e aplicam classes Tailwind + tooltip por reason.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, Supabase JS client.

**Spec:** [docs/superpowers/specs/2026-05-19-lost-redistribution-gray-badge-design.md](../specs/2026-05-19-lost-redistribution-gray-badge-design.md)

**Note about testing:** O projeto não tem infra de testes unitários para componentes React (ver plan anterior). Verificações são via build (`npm run build`) + teste manual no browser. Tasks de teste no fim usam SQL Editor para criar dados e visualização no Pipeline.

**Note about deploys:** Feature é 100% frontend. Vai pro GitHub e o deploy do frontend é automático via Lovable/Vercel (não é Edge Function). Owner autorizou Claude a fazer deploys de Edge Functions, mas aqui nem isso é necessário.

---

## File Map

**Novo:**
- `src/lib/redistribution.ts` — helper `mapTriggerSourceToReason(triggerSource)` + tipo `RedistributionReason`. Único ponto de verdade do mapeamento; consumido por todos os componentes.

**Editados:**
- `src/pages/Pipeline.tsx` — adicionar `trigger_source` no select e no state `redistributedMap`. 2 lugares populam o map (loadRedistributionData + realtime listener).
- `src/components/PipelineColumn.tsx` — atualizar tipo de `redistributedMap`, passar `redistributionReason` derivado para `SortableLeadCard`.
- `src/components/MobilePipelineView.tsx` — idem para `MobileLeadCard`.
- `src/components/LeadCard.tsx` — receber prop `redistributionReason`, aplicar cor/tooltip via switch.
- `src/components/MobileLeadCard.tsx` — receber prop `redistributionReason`, aplicar cor + relaxar gating.

---

## Task 1: Criar helper `redistribution.ts`

**Files:**
- Create: `src/lib/redistribution.ts`

Helper único para mapear strings vindas do banco (`trigger_source`) ao tipo de UI (`RedistributionReason`). Centraliza para que se um novo `trigger_source` aparecer (ex.: `lost_redistribution_v2`), tem um único lugar pra ajustar.

- [ ] **Step 1.1: Criar arquivo com helper e tipo**

Criar `src/lib/redistribution.ts` com:

```ts
export type RedistributionReason = 'inactivity' | 'lost' | 'manual';

/**
 * Mapeia o trigger_source gravado em lead_distribution_history para
 * a categoria visual usada nos cards do Pipeline.
 *
 * - 'lost_redistribution' (vindo de redistribute-lost-leads) -> 'lost'
 * - 'manual' (redistribuir colaborador via UI) -> 'manual'
 * - tudo o mais (incluindo 'auto_redistribution', undefined, ou
 *   trigger_sources antigos sem categoria) -> 'inactivity'
 *
 * O default 'inactivity' preserva a aparencia atual (badge azul) para
 * dados historicos sem categoria conhecida.
 */
export function mapTriggerSourceToReason(triggerSource?: string | null): RedistributionReason {
  if (triggerSource === 'lost_redistribution') return 'lost';
  if (triggerSource === 'manual') return 'manual';
  return 'inactivity';
}
```

- [ ] **Step 1.2: Verificar imports do tipo**

Não precisa importar de lugar nenhum. Verificar que o arquivo compila sozinho:

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npx tsc --noEmit src/lib/redistribution.ts`
Expected: sem erros.

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/redistribution.ts
git commit -m "feat(redistribution): helper mapTriggerSourceToReason

Centraliza o mapeamento trigger_source (banco) -> RedistributionReason
(UI). Default 'inactivity' preserva comportamento atual para dados
historicos sem categoria.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Adicionar `trigger_source` no SELECT e no state em `Pipeline.tsx`

**Files:**
- Modify: `src/pages/Pipeline.tsx:163` (tipo do state `redistributedMap`)
- Modify: `src/pages/Pipeline.tsx:1040` (SELECT em `loadRedistributionData`)
- Modify: `src/pages/Pipeline.tsx:1074-1080` (popular `map` em `loadRedistributionData`)
- Modify: `src/pages/Pipeline.tsx:410-430` (realtime listener que adiciona ao map)

Sem isso, o card não consegue saber o motivo da redistribuição. Tudo se conecta a partir daqui.

- [ ] **Step 2.1: Atualizar tipo do state `redistributedMap`**

Localizar [Pipeline.tsx:163](../../src/pages/Pipeline.tsx#L163):

```tsx
const [redistributedMap, setRedistributedMap] = useState<Record<string, { fromName: string; minutes: number }>>({});;
```

Substituir por:

```tsx
const [redistributedMap, setRedistributedMap] = useState<Record<string, { fromName: string; minutes: number; triggerSource: string }>>({});
```

(Também remove o `;` duplicado que tinha no fim da linha — bug existente.)

- [ ] **Step 2.2: Adicionar `trigger_source` no SELECT**

Localizar [Pipeline.tsx:1038-1043](../../src/pages/Pipeline.tsx#L1038-L1043):

```tsx
    const { data } = await supabase
      .from('lead_distribution_history')
      .select('lead_id, from_user_id, config_id, created_at')
      .in('lead_id', leadIds)
      .eq('is_redistribution', true)
      .order('created_at', { ascending: false });
```

Substituir por:

```tsx
    const { data } = await supabase
      .from('lead_distribution_history')
      .select('lead_id, from_user_id, config_id, trigger_source, created_at')
      .in('lead_id', leadIds)
      .eq('is_redistribution', true)
      .order('created_at', { ascending: false });
```

- [ ] **Step 2.3: Popular `triggerSource` no map**

Localizar [Pipeline.tsx:1074-1080](../../src/pages/Pipeline.tsx#L1074-L1080):

```tsx
    const map: Record<string, { fromName: string; minutes: number }> = {};
    latestByLead.forEach((row, leadId) => {
      map[leadId] = {
        fromName: row.from_user_id ? (profilesById[row.from_user_id] || '') : '',
        minutes: row.config_id ? (configsById[row.config_id] || 0) : 0,
      };
    });
```

Substituir por:

```tsx
    const map: Record<string, { fromName: string; minutes: number; triggerSource: string }> = {};
    latestByLead.forEach((row, leadId) => {
      map[leadId] = {
        fromName: row.from_user_id ? (profilesById[row.from_user_id] || '') : '',
        minutes: row.config_id ? (configsById[row.config_id] || 0) : 0,
        triggerSource: row.trigger_source || '',
      };
    });
```

- [ ] **Step 2.4: Popular `triggerSource` no listener realtime**

Localizar [Pipeline.tsx:417-428](../../src/pages/Pipeline.tsx#L417-L428):

```tsx
          setRedistributedMap(prev => ({
            ...prev,
            [row.lead_id]: {
              fromName: (profileRes.data as any)?.full_name || '',
              minutes: (configRes.data as any)?.redistribution_timeout_minutes || 0,
            },
          }));
```

Substituir por:

```tsx
          setRedistributedMap(prev => ({
            ...prev,
            [row.lead_id]: {
              fromName: (profileRes.data as any)?.full_name || '',
              minutes: (configRes.data as any)?.redistribution_timeout_minutes || 0,
              triggerSource: row.trigger_source || '',
            },
          }));
```

(O `row` aqui é o payload do realtime — `lead_distribution_history` INSERT — então `row.trigger_source` está disponível direto.)

- [ ] **Step 2.5: Verificar typecheck**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "(Pipeline\.tsx|redistribution)" | head -20`
Expected: sem erros relacionados a Pipeline.tsx ou redistribution. Se houver erros mencionando que `triggerSource` falta em algum lugar, é Task 3 e 4 que ainda não rodaram — esperado neste ponto.

(O comando acima filtra só para erros das nossas mudanças; erros pré-existentes do projeto não nos interessam.)

- [ ] **Step 2.6: Commit**

```bash
git add src/pages/Pipeline.tsx
git commit -m "feat(pipeline): propagar trigger_source em redistributedMap

Sem isso, o card nao consegue distinguir lost vs inactivity vs manual.
Backend ja grava trigger_source - so faltava o front ler e propagar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Atualizar `PipelineColumn` e `MobilePipelineView` para passar `redistributionReason`

**Files:**
- Modify: `src/components/PipelineColumn.tsx:32` (tipo da prop `redistributedMap`)
- Modify: `src/components/PipelineColumn.tsx:132` (passar `redistributionReason` ao card)
- Modify: `src/components/MobilePipelineView.tsx:20` (tipo da prop `redistributedMap`)
- Modify: `src/components/MobilePipelineView.tsx:169-170` (passar `redistributionReason` ao card)

- [ ] **Step 3.1: Atualizar tipo da prop em `PipelineColumn.tsx`**

Localizar [PipelineColumn.tsx:32](../../src/components/PipelineColumn.tsx#L32):

```tsx
  redistributedMap?: Record<string, { fromName: string; minutes: number }>;
```

Substituir por:

```tsx
  redistributedMap?: Record<string, { fromName: string; minutes: number; triggerSource: string }>;
```

- [ ] **Step 3.2: Importar helper e passar reason em `PipelineColumn.tsx`**

No topo do arquivo, adicionar após os outros imports:

```tsx
import { mapTriggerSourceToReason } from "@/lib/redistribution";
```

Localizar [PipelineColumn.tsx:132-134](../../src/components/PipelineColumn.tsx#L132-L134):

```tsx
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionMinutes={redistributedMap[lead.id]?.minutes}
```

Substituir por:

```tsx
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionMinutes={redistributedMap[lead.id]?.minutes}
                  redistributionReason={mapTriggerSourceToReason(redistributedMap[lead.id]?.triggerSource)}
```

- [ ] **Step 3.3: Atualizar tipo da prop em `MobilePipelineView.tsx`**

Localizar [MobilePipelineView.tsx:20](../../src/components/MobilePipelineView.tsx#L20):

```tsx
  redistributedMap: Record<string, { fromName: string; minutes: number }>;
```

Substituir por:

```tsx
  redistributedMap: Record<string, { fromName: string; minutes: number; triggerSource: string }>;
```

- [ ] **Step 3.4: Importar helper e passar reason em `MobilePipelineView.tsx`**

No topo do arquivo, adicionar após os outros imports:

```tsx
import { mapTriggerSourceToReason } from "@/lib/redistribution";
```

Localizar [MobilePipelineView.tsx:169-170](../../src/components/MobilePipelineView.tsx#L169-L170):

```tsx
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
```

Substituir por:

```tsx
                  isRedistributed={!!redistributedMap[lead.id]}
                  redistributedFromName={redistributedMap[lead.id]?.fromName}
                  redistributionReason={mapTriggerSourceToReason(redistributedMap[lead.id]?.triggerSource)}
```

- [ ] **Step 3.5: Commit**

```bash
git add src/components/PipelineColumn.tsx src/components/MobilePipelineView.tsx
git commit -m "feat(pipeline): propagar redistributionReason aos cards

Cada coluna deriva o reason via helper compartilhado e passa
como prop adicional. Cards ainda nao consomem - vem em Task 4.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Aplicar cor e tooltip por reason em `LeadCard.tsx` (desktop)

**Files:**
- Modify: `src/components/LeadCard.tsx` — interface, default, render, memo

- [ ] **Step 4.1: Adicionar prop nas interfaces**

Localizar [LeadCard.tsx:131-133](../../src/components/LeadCard.tsx#L131-L133) (interface `BaseLeadCardProps`):

```tsx
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
```

Substituir por:

```tsx
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
  redistributionReason?: RedistributionReason;
```

E em [LeadCard.tsx:152-154](../../src/components/LeadCard.tsx#L152-L154) (segunda interface, `LeadCardViewProps`):

```tsx
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
```

Substituir por:

```tsx
  isRedistributed?: boolean;
  redistributedFromName?: string;
  redistributionMinutes?: number;
  redistributionReason?: RedistributionReason;
```

- [ ] **Step 4.2: Importar o tipo `RedistributionReason`**

No topo de `LeadCard.tsx`, adicionar:

```tsx
import { type RedistributionReason } from "@/lib/redistribution";
```

- [ ] **Step 4.3: Adicionar default da prop no componente**

Localizar [LeadCard.tsx:191-193](../../src/components/LeadCard.tsx#L191-L193):

```tsx
  isRedistributed = false,
  redistributedFromName,
  redistributionMinutes,
```

Substituir por:

```tsx
  isRedistributed = false,
  redistributedFromName,
  redistributionMinutes,
  redistributionReason = 'inactivity',
```

- [ ] **Step 4.4: Atualizar o border condicional do card**

Localizar [LeadCard.tsx:263-273](../../src/components/LeadCard.tsx#L263-L273):

```tsx
          : "transition-[border-color,box-shadow] duration-200 ease-in-out",
        hasRedBorder && !dragging
          ? "border-border animate-glow-pulse"
          : isRedistributed && !dragging
          ? "border-blue-900 dark:border-blue-800 hover:border-blue-700 hover:shadow-[0_4px_18px_0_rgba(30,58,138,0.35)]"
          : isDuplicate && !dragging
          ? "border-yellow-400 dark:border-yellow-500 hover:border-yellow-400 hover:shadow-[0_4px_18px_0_rgba(234,179,8,0.25)]"
```

Substituir por:

```tsx
          : "transition-[border-color,box-shadow] duration-200 ease-in-out",
        hasRedBorder && !dragging
          ? "border-border animate-glow-pulse"
          : isRedistributed && !dragging && redistributionReason === 'inactivity'
          ? "border-blue-900 dark:border-blue-800 hover:border-blue-700 hover:shadow-[0_4px_18px_0_rgba(30,58,138,0.35)]"
          : isRedistributed && !dragging
          ? "border-slate-600 dark:border-slate-500 hover:border-slate-400 hover:shadow-[0_4px_18px_0_rgba(100,116,139,0.35)]"
          : isDuplicate && !dragging
          ? "border-yellow-400 dark:border-yellow-500 hover:border-yellow-400 hover:shadow-[0_4px_18px_0_rgba(234,179,8,0.25)]"
```

(O segundo `isRedistributed && !dragging` cobre `lost` e `manual` — cinza-escuro slate.)

- [ ] **Step 4.5: Atualizar o badge "Redistribuído"**

Localizar [LeadCard.tsx:288-299](../../src/components/LeadCard.tsx#L288-L299):

```tsx
                  {isRedistributed && (
                    <Badge
                      variant="secondary"
                      title={redistributedFromName && redistributionMinutes
                        ? `Lead redistribuído automaticamente pois o colaborador anterior (${redistributedFromName}) não interagiu dentro de ${redistributionMinutes} min`
                        : "Lead redistribuído automaticamente para este colaborador"}
                      className="w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 bg-blue-950 text-blue-300 border-blue-800 cursor-default"
                    >
                      <RefreshCw className="h-2.5 w-2.5" />
                      Redistribuído
                    </Badge>
                  )}
```

Substituir por:

```tsx
                  {isRedistributed && (() => {
                    const isInactivity = redistributionReason === 'inactivity';
                    const isLost = redistributionReason === 'lost';
                    const colorClass = isInactivity
                      ? "bg-blue-950 text-blue-300 border-blue-800"
                      : "bg-slate-800 text-slate-300 border-slate-700";
                    const tooltip = isLost
                      ? "Lead recuperado da etapa Perdido e redistribuído via roleta"
                      : isInactivity
                      ? (redistributedFromName && redistributionMinutes
                          ? `Lead redistribuído automaticamente pois o colaborador anterior (${redistributedFromName}) não interagiu dentro de ${redistributionMinutes} min`
                          : "Lead redistribuído automaticamente para este colaborador")
                      : (redistributedFromName
                          ? `Lead redistribuído via roleta (vinha do colaborador ${redistributedFromName})`
                          : "Lead redistribuído via roleta");
                    return (
                      <Badge
                        variant="secondary"
                        title={tooltip}
                        className={`w-fit text-[9px] px-1.5 py-0 h-4 flex items-center gap-0.5 ${colorClass} cursor-default`}
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                        Redistribuído
                      </Badge>
                    );
                  })()}
```

- [ ] **Step 4.6: Adicionar `redistributionReason` à comparação do `memo`**

Localizar [LeadCard.tsx:640-646](../../src/components/LeadCard.tsx#L640-L646):

```tsx
    prevProps.isDuplicate === nextProps.isDuplicate &&
    prevProps.dataAgendamentoReuniao === nextProps.dataAgendamentoReuniao &&
    prevProps.dataAgendamentoVenda === nextProps.dataAgendamentoVenda &&
    prevProps.isRedistributed === nextProps.isRedistributed
  );
});
```

Substituir por:

```tsx
    prevProps.isDuplicate === nextProps.isDuplicate &&
    prevProps.dataAgendamentoReuniao === nextProps.dataAgendamentoReuniao &&
    prevProps.dataAgendamentoVenda === nextProps.dataAgendamentoVenda &&
    prevProps.isRedistributed === nextProps.isRedistributed &&
    prevProps.redistributionReason === nextProps.redistributionReason
  );
});
```

Sem isso, mudança de reason não re-renderiza (otimização do memo descartaria a atualização).

- [ ] **Step 4.7: Verificar typecheck**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "LeadCard\.tsx" | head -20`
Expected: sem erros em LeadCard.tsx.

- [ ] **Step 4.8: Commit**

```bash
git add src/components/LeadCard.tsx
git commit -m "feat(leadcard): badge e border por redistributionReason

- inactivity (timeout): azul, tooltip atual com 'X min'
- lost: cinza (slate), tooltip 'recuperado da etapa Perdido'
- manual: cinza, tooltip 'via roleta'
- default ('inactivity') preserva visual atual para dados antigos

memo() ganhou comparacao do reason para nao engolir mudancas.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Aplicar cor por reason em `MobileLeadCard.tsx`

**Files:**
- Modify: `src/components/MobileLeadCard.tsx` — interface, render

- [ ] **Step 5.1: Adicionar prop na interface**

Localizar [MobileLeadCard.tsx:27](../../src/components/MobileLeadCard.tsx#L27) (logo abaixo de `isRedistributed?: boolean;`):

```tsx
  isRedistributed?: boolean;
```

Substituir por:

```tsx
  isRedistributed?: boolean;
  redistributionReason?: RedistributionReason;
```

- [ ] **Step 5.2: Importar tipo**

No topo do arquivo:

```tsx
import { type RedistributionReason } from "@/lib/redistribution";
```

- [ ] **Step 5.3: Adicionar default da prop no componente**

Localizar [MobileLeadCard.tsx:34](../../src/components/MobileLeadCard.tsx#L34):

```tsx
  isRedistributed, redistributedFromName,
```

Substituir por:

```tsx
  isRedistributed, redistributedFromName, redistributionReason = 'inactivity',
```

- [ ] **Step 5.4: Atualizar render do badge**

Localizar [MobileLeadCard.tsx:163](../../src/components/MobileLeadCard.tsx#L163):

```tsx
      {(isDuplicate || agendStatus || isRedistributed) && (
```

Manter como está (a condição externa não muda — pode ter algum dos três).

Localizar [MobileLeadCard.tsx:180-184](../../src/components/MobileLeadCard.tsx#L180-L184):

```tsx
          {isRedistributed && redistributedFromName && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
              <RefreshCw className="h-2.5 w-2.5" />Redistribuído
            </span>
          )}
```

Substituir por:

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

Mudanças vs hoje:
1. Gating: `(reason !== 'inactivity' || redistributedFromName)` — `lost`/`manual` aparecem mesmo sem nome anterior; `inactivity` continua exigindo nome.
2. Cor: cinza para `lost`/`manual`, **azul** para `inactivity` (mudei de roxo `purple-50` que não tinha relação semântica, para azul que combina com o desktop).

(`cn` já é importado neste arquivo — verificar; se não estiver, adicionar `import { cn } from "@/lib/utils";`.)

- [ ] **Step 5.5: Confirmar import de `cn`**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && grep -n "import.*cn" src/components/MobileLeadCard.tsx`
Expected: linha mostrando `import { cn } from "@/lib/utils"` ou similar. Se ausente, adicionar.

- [ ] **Step 5.6: Verificar typecheck**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "MobileLeadCard\.tsx" | head -20`
Expected: sem erros em MobileLeadCard.tsx.

- [ ] **Step 5.7: Commit**

```bash
git add src/components/MobileLeadCard.tsx
git commit -m "feat(mobile-leadcard): badge cinza para lost/manual + azul inactivity

- Antes: badge roxo unico, so renderiza se redistributedFromName
- Agora: azul para inactivity (consistente com desktop), cinza para
  lost/manual. lost/manual nao exigem mais 'fromName' (lead pode nao
  ter tido agente anterior).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Build final + verificação visual

**Files:** nenhum (só verificação)

- [ ] **Step 6.1: Rodar build**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && npm run build 2>&1 | tail -30`
Expected: `built in Xs` no fim, sem erros (warnings de chunk size são OK).

- [ ] **Step 6.2: Verificação manual no browser (golden path)**

Rodar dev server: `npm run dev`

Setup via SQL Editor do Supabase (org de teste do owner):

```sql
-- 1. Pegar IDs reais (substituir o org_id pela sua org de teste)
SELECT id, nome FROM leads WHERE organization_id = '<ORG_ID>' LIMIT 5;

-- 2. Criar 3 entradas em lead_distribution_history simulando os 3 motivos
-- (substituir lead_id_a, lead_id_b, lead_id_c, user_id, config_id)
INSERT INTO lead_distribution_history (lead_id, organization_id, to_user_id, from_user_id, config_id, distribution_method, trigger_source, is_redistribution, created_at)
VALUES
  ('<LEAD_A>', '<ORG_ID>', '<USER>', '<USER>', '<CONFIG>', 'round_robin', 'auto_redistribution', true, now()),
  ('<LEAD_B>', '<ORG_ID>', '<USER>', '<USER>', '<CONFIG>', 'round_robin', 'lost_redistribution', true, now()),
  ('<LEAD_C>', '<ORG_ID>', '<USER>', '<USER>', '<CONFIG>', 'round_robin', 'manual', true, now());
```

Abrir o Pipeline no browser:

- [ ] **Lead A:** badge **azul** "Redistribuído", border azul. Hover mostra tooltip com "X min" ou texto padrão.
- [ ] **Lead B:** badge **cinza** (slate). Hover mostra "Lead recuperado da etapa Perdido e redistribuído via roleta".
- [ ] **Lead C:** badge **cinza**. Hover mostra "via roleta (vinha do colaborador X)".
- [ ] **Lead D** (sem entrada em history): sem badge, border normal.

Mobile (redimensionar janela para ≤768px ou usar DevTools mobile mode):

- [ ] Lead A: badge azul claro "Redistribuído"
- [ ] Lead B: badge cinza claro "Redistribuído"
- [ ] Lead C: badge cinza claro

- [ ] **Step 6.3: Limpar dados de teste**

```sql
DELETE FROM lead_distribution_history
WHERE lead_id IN ('<LEAD_A>', '<LEAD_B>', '<LEAD_C>')
  AND trigger_source IN ('auto_redistribution', 'lost_redistribution', 'manual')
  AND created_at > now() - interval '1 hour';
```

---

## Task 7: Push para o GitHub + sincronizar vault

**Files:**
- Modify: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Changelog.md`
- Modify: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Home.md`
- Modify: `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\02 - Plans\` (copiar plan)

- [ ] **Step 7.1: Push para origin/main**

Run: `cd "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo" && git push origin main 2>&1 | tail -5`
Expected: `main -> main` no fim, sem rejeição.

- [ ] **Step 7.2: Copiar spec para o vault**

(Já foi feito ao final da brainstorming — pular se já existir `01 - Specs/2026-05-19-lost-redistribution-gray-badge.md`.)

- [ ] **Step 7.3: Copiar plan para o vault**

Run:
```bash
cp "/c/Users/Brito/Desktop/principal/Kairoz/Teste - CRM Kairoz/CRM---Definitivo/docs/superpowers/plans/2026-05-19-lost-redistribution-gray-badge.md" \
   "/c/Users/Brito/Desktop/principal/Projetos/Kairoz CRM/02 - Plans/2026-05-19-lost-redistribution-gray-badge.md"
```

- [ ] **Step 7.4: Atualizar Changelog do vault**

Adicionar no topo de `c:\Users\Brito\Desktop\principal\Projetos\Kairoz CRM\Changelog.md`:

```markdown
## 2026-05-19

- **[Spec+Plan+Feature]** Tag cinza no card de lead redistribuído da etapa Perdido — diferencia visualmente lost/manual (cinza) de inactivity (azul) → [[2026-05-19-lost-redistribution-gray-badge]]
```

- [ ] **Step 7.5: Atualizar Home.md do vault**

Em `Home.md`:
- Incrementar "Specs de Design (28)" → "Specs de Design (29)"
- Incrementar "Plans de Implementação (24)" → "Plans de Implementação (25)"
- Adicionar `[[2026-05-19-lost-redistribution-gray-badge]]` no fim da lista de Specs e no fim da lista de Plans
- Atualizar "Última sincronização" para `2026-05-19`

---

## Self-Review da spec

Cobertura da spec por task:

| Requisito (spec) | Onde está coberto |
|---|---|
| Helper `mapTriggerSourceToReason` em `src/lib/redistribution.ts` | Task 1 |
| Backend sem mudanças | (não há task — confirmado) |
| `Pipeline.tsx` SELECT inclui `trigger_source` | Task 2.2 |
| `redistributedMap` ganha `triggerSource` | Task 2.1, 2.3, 2.4 |
| `LeadCard` prop `redistributionReason` | Task 4.1, 4.2, 4.3 |
| `LeadCard` border condicional | Task 4.4 |
| `LeadCard` badge condicional (cor + tooltip) | Task 4.5 |
| `LeadCard` memo atualizado | Task 4.6 |
| `MobileLeadCard` prop + render | Task 5 |
| `MobileLeadCard` gating relaxado para lost/manual | Task 5.4 |
| `PipelineColumn` e `MobilePipelineView` passam reason | Task 3 |
| Casos de borda (default `inactivity`, `from_user_id` nulo) | Cobertos pelo helper (default `inactivity`) e pelo gating (Task 4.5, 5.4) |
| Testes manuais golden path | Task 6.2 |

Sem placeholders, sem TBDs, todos os caminhos de código mostram o código inteiro.

Type consistency: `RedistributionReason` definido em Task 1, importado igual em Tasks 3, 4, 5. `triggerSource` (camelCase) usado consistente; `trigger_source` (snake_case) só para a coluna do banco no SELECT.

Plan pronto.
