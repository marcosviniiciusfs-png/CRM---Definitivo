
# Plano: Correção da Criação de Contas de Colaboradores

## Diagnóstico do Problema

### Causa Raiz Identificada
A função `handle_new_user()` no banco de dados **perdeu a lógica de vinculação de convidados** durante uma atualização anterior. 

**Histórico:**
1. Migração `20251121142206` implementou corretamente o UPDATE para vincular `user_id` por email
2. Migração `20260125174807` reescreveu a função para prevenir duplicatas de owners, **mas removeu acidentalmente o UPDATE**

**Resultado atual:**
- O usuário é criado em `auth.users` com senha ✅
- O registro de membro fica com `user_id = NULL` em `organization_members` ❌
- O sistema não reconhece o usuário como membro válido da organização
- Login com a senha funciona (auth.users existe), mas acesso ao CRM falha

### Evidência Concreta
```
Usuário: kerlyskauan@gmail.com
auth.users.id: c6733123-c6a0-46a4-ba77-3f474283a06d (existe ✅)
organization_members.user_id: NULL (não vinculado ❌)
```

---

## Solução

### 1. Corrigir a Função `handle_new_user()` (Migração)

Reescrever a função para:
1. Manter a prevenção de duplicatas de owners (lógica existente)
2. **Adicionar** verificação por EMAIL além de user_id
3. **Restaurar** o UPDATE que vincula convidados

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_org_id UUID;
  existing_owner_count INT;
  existing_member_count INT;
  invited_member_count INT;
BEGIN
  -- PREVENÇÃO DE DUPLICATAS: Verificar se usuário JÁ É OWNER
  SELECT COUNT(*) INTO existing_owner_count
  FROM public.organization_members
  WHERE user_id = NEW.id AND role = 'owner';
  
  IF existing_owner_count > 0 THEN
    RAISE LOG 'User % already owns organization(s). Skipping.', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Verificar se foi CONVIDADO (registro com email mas sem user_id)
  SELECT COUNT(*) INTO invited_member_count
  FROM public.organization_members
  WHERE email = NEW.email AND user_id IS NULL;
  
  IF invited_member_count > 0 THEN
    -- VINCULAR: Atualizar registros pendentes com o user_id
    UPDATE public.organization_members
    SET user_id = NEW.id,
        is_active = true
    WHERE email = NEW.email AND user_id IS NULL;
    
    RAISE LOG 'User % linked to % invited membership(s).', NEW.id, invited_member_count;
    RETURN NEW;
  END IF;
  
  -- Verificar se já é membro de alguma org (por user_id)
  SELECT COUNT(*) INTO existing_member_count
  FROM public.organization_members
  WHERE user_id = NEW.id;
  
  IF existing_member_count > 0 THEN
    RAISE LOG 'User % is already a member. Skipping org creation.', NEW.id;
    RETURN NEW;
  END IF;
  
  -- Criar nova organização para usuários completamente novos
  INSERT INTO public.organizations (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)) || '''s Organization')
  RETURNING id INTO new_org_id;
  
  INSERT INTO public.organization_members (organization_id, user_id, email, role, is_active)
  VALUES (new_org_id, NEW.id, NEW.email, 'owner', true);
  
  RAISE LOG 'Created organization % for user %', new_org_id, NEW.id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in handle_new_user for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
```

### 2. Corrigir Usuários Pendentes Existentes (Query de Correção)

Executar um UPDATE para vincular usuários que já foram criados mas não vinculados:

```sql
UPDATE public.organization_members om
SET user_id = u.id,
    is_active = true
FROM auth.users u
WHERE om.email = u.email
  AND om.user_id IS NULL;
```

Isso irá corrigir o "kerlys kauan" e qualquer outro colaborador na mesma situação.

### 3. Adicionar Fallback na Edge Function (Segurança Extra)

Como medida de segurança, modificar `add-organization-member` para fazer o UPDATE explicitamente após criar o usuário, não dependendo apenas do trigger:

```typescript
// Após criar o usuário com sucesso (linha 277)
userId = newUser.user.id;

// FALLBACK: Atualizar o registro pré-inserido com o user_id
const { error: linkError } = await supabaseAdmin
  .from('organization_members')
  .update({ user_id: userId, is_active: true })
  .match({ email: emailLower, organization_id: organizationId, user_id: null });

if (linkError) {
  console.warn('Failed to link user via fallback, trigger should handle:', linkError);
}
```

---

## Fluxo Corrigido

```
┌─────────────────────────────────────────────────────────────┐
│ Admin clica "Adicionar Colaborador"                         │
│ Nome: kerlys kauan | Email: kerlys@... | Senha: ****        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Edge Function: add-organization-member                      │
│ 1. INSERT organization_members (user_id=NULL, email=kerlys) │
│ 2. CREATE USER in auth.users (com senha)                    │
│ 3. FALLBACK: UPDATE organization_members SET user_id=...    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Trigger: handle_new_user (em auth.users)                    │
│ - Detecta email em organization_members com user_id=NULL    │
│ - UPDATE organization_members SET user_id = NEW.id          │
│ - Não cria organização nova (é convidado)                   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ RESULTADO:                                                  │
│ auth.users.id = c6733123-...                         ✅     │
│ organization_members.user_id = c6733123-...          ✅     │
│ organization_members.is_active = true                ✅     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Colaborador faz LOGIN                                       │
│ Email: kerlys@... | Senha: (a que foi definida)             │
│ → Autenticado ✅                                            │
│ → Reconhecido como membro da organização ✅                 │
│ → Acessa Kanban, Pipeline, Chat conforme cargo ✅           │
└─────────────────────────────────────────────────────────────┘
```

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| **Nova migração SQL** | Reescrever `handle_new_user()` com lógica de UPDATE por email + query para corrigir registros existentes |
| `supabase/functions/add-organization-member/index.ts` | Adicionar UPDATE fallback explícito após criar usuário |

---

## Checklist de Validação

Após implementação:

1. **Corrigir usuário existente:**
   - [ ] Query: `SELECT user_id FROM organization_members WHERE email = 'kerlyskauan@gmail.com'`
   - [ ] Esperado: `user_id = c6733123-c6a0-46a4-ba77-3f474283a06d` (não mais NULL)

2. **Testar login do Kerlys:**
   - [ ] Login com `kerlyskauan@gmail.com` + senha definida
   - [ ] Deve acessar o dashboard sem erros
   - [ ] Deve ver as funcionalidades conforme cargo "Gestor de Trafego"

3. **Testar criação de novo colaborador:**
   - [ ] Admin cria novo colaborador com email/senha
   - [ ] Verificar que `organization_members.user_id` é preenchido
   - [ ] Novo colaborador consegue fazer login
   - [ ] Status muda de "Pendente" para "Ativo"

4. **Verificar que não quebra usuários existentes:**
   - [ ] Owners continuam funcionando
   - [ ] Admins continuam funcionando
   - [ ] Membros já ativos continuam funcionando
