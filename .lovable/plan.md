
# Correcoes Criticas do CRM: Modal, Calendar, Pipeline, Facebook e Persistencia

## Problema 1: Modal de edicao do lead - sidebar direita nao responsiva

O modal `EditLeadModal.tsx` tem uma sidebar fixa de `w-80` (320px) que nao se adapta em telas menores. Os blocos "Valor do negocio" e "Dados do negocio" ficam cortados ou escondidos atras do conteudo principal.

### Solucao
- Trocar o layout `flex` horizontal por um layout que empilha verticalmente em telas menores
- A sidebar `w-80` deve usar `w-80 min-w-0` e em telas menores o modal deve usar `flex-col` em vez de `flex-row`
- Adicionar `overflow-y-auto` na sidebar para garantir scroll quando o conteudo exceder a tela

### Arquivo: `src/components/EditLeadModal.tsx`
- Linha 784: Trocar `<div className="flex-1 flex overflow-hidden">` por `<div className="flex-1 flex flex-col md:flex-row overflow-hidden">`
- Linha 1455: Trocar `<div className="w-80 border-l bg-muted/20 flex flex-col flex-shrink-0 overflow-y-auto">` por `<div className="w-full md:w-80 border-t md:border-t-0 md:border-l bg-muted/20 flex flex-col flex-shrink-0 overflow-y-auto max-h-[40vh] md:max-h-none">`

---

## Problema 2: Botao "Agendar" visivel para todos os usuarios no LeadDetailsDialog

O `LeadDetailsDialog.tsx` mostra o botao "Agendar" (Google Calendar) para todos os usuarios. Conforme a regra do CRM, essa funcionalidade deve ser restrita ao dono (mateusabcck@gmail.com).

### Solucao
- Importar `useAuth` no `LeadDetailsDialog`
- Verificar `user?.email === "mateusabcck@gmail.com"` antes de renderizar o botao "Agendar"
- Esconder tambem o `CreateEventModal` para outros usuarios

### Arquivo: `src/components/LeadDetailsDialog.tsx`
- Importar `useAuth` de `@/contexts/AuthContext`
- No componente, adicionar `const { user } = useAuth();` e `const isOwner = user?.email === "mateusabcck@gmail.com";`
- Linha 191-199: Envolver o botao "Agendar" em `{isOwner && (...)}`
- Linha 368-401: Envolver a secao de evento do calendario em `{isOwner && (...)}`
- Linha 458-462 (CreateEventModal): Envolver em `{isOwner && (...)}`

---

## Problema 3: Pipeline recarrega inteiro ao editar lead no modal

Quando o usuario faz qualquer alteracao no `EditLeadModal` (responsavel, valor, etc.), o `onUpdate` callback chama `loadLeads()` que recarrega TODOS os leads do zero, causando o flash visual mostrado na imagem 3.

### Solucao
Duas partes:

**Parte A - EditLeadModal: parar de chamar onUpdate a cada micro-edicao**

Atualmente, cada acao individual (mudar responsavel, adicionar item, mudar data) chama `onUpdate()` imediatamente. Isso dispara `loadLeads()` no Pipeline. A solucao e:
- Remover todas as chamadas `onUpdate()` das acoes intermediarias (responsavel, datas, idade, descricao, items)
- Manter `onUpdate()` APENAS no `handleSaveChanges` (botao Salvar) e no `onClose`
- As atualizacoes de DB individuais (responsavel, data, etc.) continuam salvando no banco, mas sem disparar reload do Pipeline

**Parte B - Pipeline: usar atualizacao local em vez de reload completo**

Quando o EditLeadModal fecha (onClose/onUpdate), em vez de chamar `loadLeads()`, atualizar apenas o lead editado no estado local:
- Criar funcao `refreshSingleLead(leadId)` que busca apenas 1 lead do banco e atualiza no estado
- Usar isso no callback `onUpdate` do EditLeadModal

### Arquivo: `src/components/EditLeadModal.tsx`
Remover `onUpdate()` das seguintes funcoes:
- `handleAddItem` (linha 317)
- `handleRemoveItem` (linha 338)
- `handleUpdateQuantity` (linha 360)
- `handleSaveQuickValue` (linha 409)
- Selecao de colaborador (linha 1636)
- Data de inicio (linhas 1702, 1730)
- Data de conclusao (linhas 1811, 1839)
- Idade (linha 2000)
- Agendamento de venda (linhas 2069, 2094)
- `saveDadosNegocio` (linha 158)

Manter `onUpdate()` APENAS em `handleSaveChanges` (linha 739).

### Arquivo: `src/pages/Pipeline.tsx`
- Criar funcao `refreshSingleLead`:
```typescript
const refreshSingleLead = useCallback(async (leadId: string) => {
  const { data } = await supabase
    .from("leads")
    .select("id, nome_lead, telefone_lead, email, stage, funnel_stage_id, funnel_id, position, avatar_url, responsavel, responsavel_user_id, valor, updated_at, created_at, source, descricao_negocio")
    .eq("id", leadId)
    .single();
  
  if (data) {
    setLeads(prev => prev.map(l => l.id === data.id ? { ...l, ...data } : l));
  }
}, []);
```
- Linha 1204: Trocar `onUpdate={() => loadLeads(undefined, false)}` por `onUpdate={() => editingLead && refreshSingleLead(editingLead.id)}`

---

## Problema 4: Leads do Facebook com nome "Lead do Facebook"

O webhook `facebook-leads-webhook` usa `leadInfo.full_name || leadInfo.first_name || leadInfo.name || 'Lead do Facebook'` para definir o nome. Porem os campos do formulario Facebook podem ter nomes variados como `nome_completo`, `first name` (com espaco), etc. que nao sao mapeados.

Ha 1492 leads com nome "Lead do Facebook", dos quais:
- 407 tem campo `nome_completo` na descricao
- 1085 tem campo `first name` (com espaco) na descricao

### Solucao - Duas partes:

**Parte A - Corrigir webhook para futuros leads:**

### Arquivo: `supabase/functions/facebook-leads-webhook/index.ts`
Linha 458: Expandir o mapeamento de nome para incluir mais variantes:
```typescript
nome_lead: leadInfo.full_name || leadInfo.nome_completo || leadInfo['first name'] || leadInfo.first_name || leadInfo.name || leadInfo.nome || 'Lead do Facebook',
```

Tambem ajustar a secao de parsing (linhas 322-327) para normalizar nomes de campos:
```typescript
fieldData.forEach((field: any) => {
  const normalizedName = field.name.toLowerCase().replace(/\s+/g, '_');
  leadInfo[field.name] = field.values?.[0] || '';
  leadInfo[normalizedName] = field.values?.[0] || '';
});
```

**Parte B - Corrigir leads existentes via SQL migration:**

Criar uma migration que atualiza os 1492 leads existentes:
```sql
-- Atualizar leads que tem nome_completo no descricao_negocio
UPDATE leads 
SET nome_lead = (
  SELECT trim(substring(descricao_negocio from 'nome_completo: ([^\n]+)'))
)
WHERE nome_lead = 'Lead do Facebook' 
  AND descricao_negocio LIKE '%nome_completo:%'
  AND trim(substring(descricao_negocio from 'nome_completo: ([^\n]+)')) IS NOT NULL
  AND trim(substring(descricao_negocio from 'nome_completo: ([^\n]+)')) != '';

-- Atualizar leads que tem "first name" no descricao_negocio (e nao tem nome_completo)
UPDATE leads 
SET nome_lead = (
  SELECT trim(substring(descricao_negocio from 'first name: ([^\n]+)'))
)
WHERE nome_lead = 'Lead do Facebook' 
  AND descricao_negocio LIKE '%first name:%'
  AND descricao_negocio NOT LIKE '%nome_completo:%'
  AND trim(substring(descricao_negocio from 'first name: ([^\n]+)')) IS NOT NULL
  AND trim(substring(descricao_negocio from 'first name: ([^\n]+)')) != '';
```

---

## Problema 5: Alteracoes no modal nao refletem na pagina Leads

A pagina `Leads.tsx` tem um listener realtime que faz reload com debounce de 500ms. Quando o usuario edita um lead no modal e salva, o realtime detecta o UPDATE e faz `loadLeads(true)` que recarrega tudo. Porem o problema reportado e que o valor nao atualiza -- isso ocorre porque as edicoes intermediarias (sem clicar Salvar) nao sao capturadas.

### Solucao
Apos a correcao do Problema 3 (onUpdate so no Salvar), o fluxo sera:
1. Usuario edita campos no modal
2. Clica "Salvar" -> `handleSaveChanges` atualiza o lead no banco -> chama `onUpdate()`
3. O realtime listener da pagina Leads detecta o UPDATE e faz reload automatico (com 500ms debounce)

Isso ja funciona. O problema real e que o modal chama `onUpdate` nas micro-edicoes mas essas alteram campos que a pagina Leads nao busca (ex: `data_inicio`), e o campo `valor` e atualizado via `lead_items` (tabela separada) sem trigger no `leads`. 

A correcao adicional: no `handleSaveChanges`, garantir que o valor editado e salvo no banco antes de chamar `onUpdate`.

---

## Problema 6: Pipeline, Leads e Chat - Persistencia com React Query

### Pipeline (`src/pages/Pipeline.tsx`)
Migrar para React Query com `staleTime: 5min`:
- A funcao `loadLeads` vira a `queryFn` de um `useQuery`
- Key: `['pipeline-leads', selectedFunnelId, user?.id]`
- Realtime INSERT continua adicionando leads ao estado local
- `refreshSingleLead` usa `queryClient.setQueryData` para atualizar localmente

### Leads (`src/pages/Leads.tsx`)
Migrar para React Query:
- Key: `['leads-list', user?.id]`
- `staleTime: 5min`
- O realtime listener muda para `queryClient.invalidateQueries` com debounce
- Infinite scroll continua funcionando via paginacao manual (ou `useInfiniteQuery`)

### Chat (`src/pages/Chat.tsx`)
Chat e o mais complexo por ter realtime intenso. Migrar parcialmente:
- Lista de leads do chat: `useQuery` com `staleTime: 5min`
- Mensagens: manter realtime direto (nao cachear mensagens antigas com React Query pois muda constantemente)

### Arquivos afetados:
- `src/pages/Pipeline.tsx` - Migrar carregamento para useQuery
- `src/pages/Leads.tsx` - Migrar loadLeads para useQuery  
- `src/pages/Chat.tsx` - Migrar lista de leads para useQuery

---

## Resumo de impacto

| Problema | Arquivo(s) | Tipo |
|----------|-----------|------|
| Modal responsivo | EditLeadModal.tsx | CSS/Layout |
| Calendar restrito | LeadDetailsDialog.tsx | Logica |
| Pipeline nao recarrega | EditLeadModal.tsx + Pipeline.tsx | Logica |
| Facebook nome_completo | facebook-leads-webhook + Migration SQL | Backend + DB |
| Leads nao reflete edits | Leads.tsx (ja funciona apos fix 3) | - |
| Persistencia Pipeline | Pipeline.tsx | React Query |
| Persistencia Leads | Leads.tsx | React Query |
| Persistencia Chat | Chat.tsx | React Query |
