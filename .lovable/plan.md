

# Corrigir Google Calendar para Usuarios Multi-Org

## Diagnostico

Os logs mostram claramente o problema:

```
❌ Erro no callback OAuth: Error: Organização do usuário não encontrada
```

### Causa Raiz

A edge function `google-calendar-oauth-callback` usa `.single()` para buscar a organizacao do usuario:

```typescript
const { data: memberData } = await supabase
  .from('organization_members')
  .select('organization_id')
  .eq('user_id', user_id)
  .single();  // ← FALHA quando usuario tem 2+ organizações!
```

Para usuarios multi-org, `.single()` retorna erro porque encontra mais de um registro.

## Solucao

Passar a `organization_id` ativa do usuario no fluxo OAuth, garantindo que a integracao seja vinculada a organizacao correta.

### Mudanca 1: Edge Function `google-calendar-oauth-initiate`

Buscar a organizacao ativa do usuario usando a tabela `user_active_org` ou fallback para primeira organizacao, e incluir no `state` do OAuth:

```typescript
// Buscar organizacao ativa do usuario (multi-org aware)
const { data: activeOrg } = await supabase
  .from('user_active_org')
  .select('active_organization_id')
  .eq('user_id', user.id)
  .maybeSingle();

let organizationId = activeOrg?.active_organization_id;

// Fallback: buscar primeira organizacao do usuario
if (!organizationId) {
  const { data: memberData } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  
  organizationId = memberData?.organization_id;
}

if (!organizationId) {
  throw new Error('Organizacao do usuario nao encontrada');
}

// Incluir organization_id no state
const state = btoa(JSON.stringify({ 
  user_id: user.id, 
  organization_id: organizationId,  // ← NOVO
  origin 
}));
```

### Mudanca 2: Edge Function `google-calendar-oauth-callback`

Usar a `organization_id` do state ao inves de buscar no banco:

```typescript
// Decodificar state com organization_id
const { user_id, organization_id, origin } = JSON.parse(atob(state));

// Validar que organization_id existe
if (!organization_id) {
  throw new Error('Organization ID ausente no state');
}

// Validar que usuario pertence a organizacao (seguranca)
const { data: membership } = await supabase
  .from('organization_members')
  .select('id')
  .eq('user_id', user_id)
  .eq('organization_id', organization_id)
  .eq('is_active', true)
  .maybeSingle();

if (!membership) {
  throw new Error('Usuario nao pertence a esta organizacao');
}

// Usar organization_id diretamente ao salvar integracao
const { data: integration } = await supabase
  .from('google_calendar_integrations')
  .insert({
    organization_id: organization_id,  // ← Do state, nao de query
    user_id,
    token_expires_at: expiresAt,
    calendar_id: 'primary',
    is_active: true,
  })
  .select('id')
  .single();
```

## Fluxo Corrigido

```
1. Usuario clica "Conectar Google Calendar"
2. Frontend chama google-calendar-oauth-initiate
3. Initiate busca org ativa via user_active_org
4. Initiate gera state com {user_id, organization_id, origin}
5. Usuario autoriza no Google
6. Google redireciona para callback com state
7. Callback extrai organization_id do state
8. Callback valida que usuario pertence a org
9. Callback salva integracao com org correta
10. Usuario redirecionado com sucesso
```

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/google-calendar-oauth-initiate/index.ts` | Buscar org ativa e incluir no state |
| `supabase/functions/google-calendar-oauth-callback/index.ts` | Usar org_id do state ao inves de buscar com .single() |

## Validacao de Seguranca

O callback ainda valida que o usuario realmente pertence a organizacao antes de criar a integracao, prevenindo manipulacao do state.

