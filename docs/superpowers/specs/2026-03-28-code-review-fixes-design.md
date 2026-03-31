# Design Spec: Correções de Code Review - CRM Kairoz

**Data:** 2026-03-28
**Autor:** Claude (Brainstorming Session)
**Status:** Aguardando Aprovação

---

## Resumo

Este spec aborda 8 problemas identificados na revisão de código do CRM Kairoz, organizados em 4 sub-projetos priorizados por risco e esforço.

---

## Sub-Projeto A: Segurança Crítica

### A.1 - Remover Email Hardcodeado

**Problema:** Email hardcodeado `mateusabcck@gmail.com` usado para verificação de permissão de "owner".

**Arquivo:** `src/components/LeadDetailsDialog.tsx`

**Solução:**
- Remover verificação `user?.email === "mateusabcck@gmail.com"`
- Usar `isSuperAdmin` do AuthContext (já funciona via RPC `has_role('super_admin')`)
- Renomear variável `isOwner` para `isSuperAdmin`

**Código atual:**
```typescript
const isOwner = user?.email === "mateusabcck@gmail.com";
```

**Código novo:**
```typescript
const { isSuperAdmin } = useAuth();
```

---

### A.2 - Corrigir Fallback Generoso

**Problema:** Fallback de assinatura permite 999 colaboradores.

**Arquivo:** `src/contexts/AuthContext.tsx`

**Solução:**
- Alterar `max_collaborators` de 999 para 5
- Alterar `subscribed` de `true` para `false`
- Alterar `product_id` de `'enterprise_free'` para `'free'`

**Código atual:**
```typescript
subData = {
  subscribed: true,
  product_id: 'enterprise_free',
  max_collaborators: 999,
  extra_collaborators: 0,
  total_collaborators: 999
};
```

**Código novo:**
```typescript
subData = {
  subscribed: false,
  product_id: 'free',
  max_collaborators: 5,
  extra_collaborators: 0,
  total_collaborators: 5
};
```

---

## Sub-Projeto B: Qualidade TypeScript

### B.1 - Logger Condicional

**Problema:** 1330 console.log/warn/info espalhados pelo código.

**Solução:** Criar utilitário de logger que só loga em desenvolvimento.

**Novo arquivo:** `src/lib/logger.ts`

```typescript
const isDev = import.meta.env.DEV;

export const logger = {
  log: (...args: unknown[]) => isDev && console.log('[LOG]', ...args),
  warn: (...args: unknown[]) => isDev && console.warn('[WARN]', ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => isDev && console.log('[DEBUG]', ...args),
  info: (...args: unknown[]) => isDev && console.info('[INFO]', ...args),
};
```

**Escopo da substituição:**
- `console.log` → `logger.log`
- `console.warn` → `logger.warn`
- `console.info` → `logger.info`
- `console.debug` → `logger.debug`
- `console.error` → manter como está (erros sempre devem ser logados)

---

### B.2 - Reduzir Uso de `any`

**Problema:** 532 ocorrências de `any` em 140 arquivos.

**Solução:** Abordagem faseada por prioridade.

| Fase | Arquivos | Ação |
|------|----------|------|
| 1 | Contexts (AuthContext, OrganizationContext) | Definir interfaces, substituir any |
| 2 | Hooks (useOrganizationMembers, etc) | Tipar parâmetros e retornos |
| 3 | Pages (Dashboard, Pipeline, etc) | Tipar props e estados |
| 4 | Components (KanbanBoard, etc) | Tipar props e callbacks |

---

### B.3 - TypeScript Strict Mode (Gradual)

**Problema:** TypeScript configurado de forma permissiva.

**Arquivo:** `tsconfig.json`

**Solução:** Habilitar flags gradualmente, após corrigir erros.

**Ordem:**
1. Após B.2 Fase 1-2: habilitar `noImplicitAny: true`
2. Após corrigir null checks: habilitar `strictNullChecks: true`
3. Opcional: `noUnusedParameters: true`

---

## Sub-Projeto C: Refatoração de Arquitetura

### C.1 - Extrair Hooks do KanbanBoard

**Problema:** KanbanBoard.tsx tem 1013 linhas.

**Solução:** Extrair lógica em custom hooks, deixar componente só com UI.

**Novos arquivos:**

| Hook | Responsabilidade |
|------|------------------|
| `src/hooks/useKanbanBoard.ts` | Estado do board, load/create columns |
| `src/hooks/useKanbanCards.ts` | CRUD de cards, assignees, timer |
| `src/hooks/useKanbanDrag.ts` | Lógica de drag & drop, validações |
| `src/hooks/useKanbanPermissions.ts` | Permissões granulares |

**Resultado:** KanbanBoard.tsx reduzido para ~300 linhas.

---

### C.2 - Extrair Hooks do FacebookLeadsConnection

**Problema:** FacebookLeadsConnection.tsx tem 814 linhas.

**Solução:** Extrair lógica em custom hooks.

**Novos arquivos:**

| Hook | Responsabilidade |
|------|------------------|
| `src/hooks/useFacebookOAuth.ts` | Fluxo OAuth, callback, popup |
| `src/hooks/useFacebookForms.ts` | Buscar forms, configurar funis |
| `src/hooks/useFacebookConnection.ts` | Status de conexão, disconnect |

**Resultado:** FacebookLeadsConnection.tsx reduzido para ~250 linhas.

---

### C.3 - Dashboard Queries

**Decisão:** Manter queries paralelas - React Query já otimiza bem.

**Única mudança:** Adicionar comentário documentando a decisão.

```typescript
// NOTE: Queries mantidas paralelas para cache granular.
// Cada métrica pode ser invalidada independentemente pelo React Query.
```

---

## Sub-Projeto D: Padronização DB

### D.1 - Documentar Padrão de Migrations

**Problema:** 38 migrations com nomes inconsistentes.

**Solução:** Documentar padrão para futuras migrations (não alterar existentes).

**Novo arquivo:** `docs/database/migrations-guide.md`

**Conteúdo:**
- Formato: `YYYYMMDDHHMMSS_description.sql`
- Exemplos corretos e incorretos
- Checklist para nova migration

---

## Ordem de Execução

| Ordem | Sub-Projeto | Tarefa | Risco |
|-------|-------------|--------|-------|
| 1 | A.1 | Remover email hardcodeado | Baixo |
| 2 | A.2 | Corrigir fallback generoso | Médio |
| 3 | B.1 | Logger condicional | Baixo |
| 4 | B.2 Fase 1 | Reduzir `any` em contexts | Médio |
| 5 | C.1 | Extrair hooks KanbanBoard | Baixo |
| 6 | C.2 | Extrair hooks FacebookLeadsConnection | Baixo |
| 7 | D.1 | Documentar padrão migrations | Zero |
| 8 | B.2 Fase 2-4 | Reduzir `any` em hooks/pages/components | Médio |
| 9 | B.3 | Habilitar strict mode | Médio |

---

## Critérios de Sucesso

- [ ] Email hardcodeado removido, `isSuperAdmin` funcionando
- [ ] Fallback de assinatura limitado a 5 colaboradores
- [ ] Logger condicional implementado, console.logs removidos
- [ ] `any` reduzido em contexts e hooks principais
- [ ] KanbanBoard.tsx com menos de 400 linhas
- [ ] FacebookLeadsConnection.tsx com menos de 300 linhas
- [ ] Guia de migrations documentado

---

## Riscos e Mitigações

| Risco | Mitigação |
|-------|-----------|
| Fallback pode bloquear usuários | Testar com contas existentes antes de deploy |
| Remoção de `any` pode expor bugs | Fazer por fases, testar cada fase |
| Refatoração pode quebrar funcionalidade | Testes manuais em cada componente refatorado |

---

## Próximos Passos

Após aprovação deste spec:
1. Invocar `writing-plans` skill para criar plano de implementação detalhado
2. Executar implementação na ordem definida
3. Testar cada sub-projeto antes de passar para o próximo
