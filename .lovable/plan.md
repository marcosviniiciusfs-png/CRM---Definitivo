

# Proteger Admin Dashboard e Gerenciar Admins

## Situacao Atual

- A tabela `user_roles` existe mas esta **vazia** - nenhum usuario tem o role `super_admin`
- O `SuperAdminRoute` nao verifica o role no frontend - qualquer usuario autenticado pode acessar `/admin`
- A seguranca real esta nas RPCs (`list_all_users`, `count_main_users`) que verificam `super_admin` no backend, entao dados sensiveis nao vazam, mas a pagina carrega e mostra erros

## O que sera feito

### 1. Inserir o role `super_admin` para o usuario `mateusabcck@gmail.com`

Migracao SQL:
```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('d70f265d-0fc6-4ef9-800d-7734bd2ea107', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;
```

### 2. Corrigir o `SuperAdminRoute` para verificar o role no frontend

Atualmente o componente deixa qualquer usuario autenticado passar. Sera modificado para:
- Chamar `supabase.rpc('has_role', { _user_id: user.id, _role: 'super_admin' })` ao montar
- Se nao for super_admin, redirecionar para `/dashboard`
- Mostrar loading enquanto verifica

### 3. Adicionar funcionalidade de gerenciar admins no `AdminDashboard.tsx`

Adicionar uma secao no dashboard admin com:
- Lista dos usuarios com role `super_admin` (query na tabela `user_roles`)
- Botao "Adicionar Admin" que abre um dialog com campos de e-mail e senha
- Ao confirmar, chamar uma nova Edge Function que:
  1. Cria o usuario no `auth.users` (via admin API)
  2. Insere o role `super_admin` na tabela `user_roles`
- Botao de remover admin (exceto o proprio usuario logado)

### 4. Criar Edge Function `admin-manage-admins`

Nova Edge Function que aceita:
- **POST** com `{ action: 'create', email, password }` - cria usuario + insere role super_admin
- **POST** com `{ action: 'delete', userId }` - remove role super_admin (nao deleta o usuario)
- **GET** - lista todos os super_admins

Validacao: apenas usuarios com role `super_admin` podem chamar essa funcao (verificado via service_role no backend).

### 5. Adicionar RLS policy para super_admins gerenciarem user_roles

Atualmente so existe policy de SELECT para o proprio usuario. Sera adicionada policy para super_admins poderem INSERT e DELETE na tabela.

## Arquivos

| Arquivo | Acao |
|---------|------|
| Migracao SQL | Inserir super_admin para mateusabcck@gmail.com + RLS policies |
| `src/components/SuperAdminRoute.tsx` | Verificar role real via RPC |
| `src/pages/AdminDashboard.tsx` | Adicionar secao de gerenciamento de admins |
| `supabase/functions/admin-manage-admins/index.ts` | Nova Edge Function para CRUD de admins |
| `supabase/config.toml` | Registrar nova funcao com verify_jwt = false |

## Seguranca

- O role `super_admin` e verificado **no backend** via funcao `has_role()` (SECURITY DEFINER)
- A Edge Function valida o token JWT e verifica o role antes de executar qualquer acao
- Nenhuma credencial e armazenada no frontend
- O usuario nao pode remover a si mesmo da lista de admins

