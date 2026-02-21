
# Fix: Erro ao Salvar Plano no Admin Dashboard

## Problema

Quando o administrador tenta alterar o plano de um usuario que nao tem assinatura, o sistema retorna o erro:
**"there is no unique or exclusion constraint matching the ON CONFLICT specification"**

Isso acontece porque o codigo usa `upsert` com `onConflict: 'user_id'`, mas a tabela `subscriptions` nao possui uma constraint UNIQUE na coluna `user_id` -- apenas um indice regular (nao-unico).

## Solucao

Adicionar uma constraint UNIQUE na coluna `user_id` da tabela `subscriptions`. Isso permite que o `upsert` funcione corretamente: se o usuario ja tem uma assinatura, ela sera atualizada; se nao tem, uma nova sera criada.

## Alteracoes

### 1. Migracao SQL

Criar uma migracao que adiciona um indice unico na coluna `user_id`:

```sql
ALTER TABLE public.subscriptions
ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
```

Antes de criar, dropar o indice regular existente (`idx_subscriptions_user_id`) ja que o novo indice unico o substitui:

```sql
DROP INDEX IF EXISTS public.idx_subscriptions_user_id;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);
```

### 2. Verificacao de dados duplicados

Antes da migracao, verificar se existem registros duplicados de `user_id` na tabela que possam bloquear a criacao da constraint. Se houver duplicados, manter apenas o mais recente.

Nenhuma alteracao de codigo e necessaria -- o `AdminUserDetails.tsx` ja esta correto, so precisa da constraint no banco.

## Resumo

| Alteracao | Descricao |
|-----------|-----------|
| Migracao SQL | Adicionar UNIQUE constraint em `subscriptions.user_id` |
| Codigo | Nenhuma alteracao necessaria |
