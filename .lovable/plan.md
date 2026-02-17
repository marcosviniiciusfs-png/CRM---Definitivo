
# Corrigir Registro Duplicado de Sessoes e Limpeza Automatica

## Problema

Conforme a imagem, o mesmo usuario aparece com multiplos registros "Online" na aba Conexoes. Isso acontece porque:

1. O `AuthContext.tsx` chama `logUserSession(true)` em **dois lugares** a cada carregamento de pagina:
   - Linha 204: no evento `SIGNED_IN`
   - Linha 258: no `getSession()` inicial
   - Ambos disparam ao mesmo tempo, criando 2+ registros por carregamento

2. Alem disso, o evento `TOKEN_REFRESHED` pode disparar `SIGNED_IN` novamente, gerando ainda mais duplicatas.

3. Nao existe limpeza automatica de registros antigos (mais de 1 mes).

Resultado: o banco tem **20 registros de login** do mesmo usuario em poucos minutos, todos sem `logout_at`, todos aparecendo como "Online".

## Solucao

### A) Evitar duplicatas no AuthContext

Modificar `logUserSession` para verificar se ja existe uma sessao ativa (sem `logout_at`) para o mesmo usuario antes de criar uma nova. Se ja existir, apenas reutilizar o ID da sessao existente sem inserir um novo registro.

Tambem: remover a chamada duplicada no `getSession()` - manter apenas no `SIGNED_IN`.

### B) Registrar data e horario exatos do login

Ja esta sendo feito (`login_at: new Date().toISOString()`). O que falta e mostrar a data/hora exata na UI em vez de apenas "ha X minutos".

### C) Limpeza automatica de registros com mais de 1 mes

Criar um cron job no banco que roda diariamente e deleta registros de `user_sessions` com `login_at` mais antigo que 30 dias.

### D) Limpar registros duplicados existentes

Na mesma migracao, executar um cleanup dos registros duplicados ja existentes, mantendo apenas o mais recente por usuario/dia.

## Mudancas

### 1. `src/contexts/AuthContext.tsx`

- Modificar `logUserSession(isLogin=true)` para:
  1. Verificar se ja existe sessao ativa (sem `logout_at`) para o usuario
  2. Se existir, apenas armazenar o ID sem criar nova
  3. Se nao existir, criar normalmente
- Remover a chamada em `getSession()` (linha 258) - so manter no `SIGNED_IN`

```typescript
const logUserSession = async (userId: string, isLogin: boolean) => {
  try {
    const { data: memberData } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!memberData?.organization_id) return;

    if (isLogin) {
      // Verificar se ja existe sessao ativa para este usuario
      const { data: existingSession } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('user_id', userId)
        .is('logout_at', null)
        .order('login_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingSession) {
        // Reutilizar sessao existente
        currentSessionIdRef.current = existingSession.id;
        return;
      }

      // Criar nova sessao apenas se nao existir ativa
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          user_id: userId,
          organization_id: memberData.organization_id,
          login_at: new Date().toISOString()
        })
        .select('id')
        .single();

      if (!error && data) {
        currentSessionIdRef.current = data.id;
      }
    } else {
      // logout - sem mudanca
    }
  } catch (error) {
    console.error('Erro ao registrar sessao:', error);
  }
};
```

### 2. Migracao SQL

- Cron job para limpar sessoes com mais de 30 dias (executado diariamente)
- Cleanup imediato dos registros duplicados existentes

```sql
-- Limpar duplicatas existentes: manter apenas a sessao mais recente por usuario
DELETE FROM user_sessions
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM user_sessions
  WHERE logout_at IS NULL
  ORDER BY user_id, login_at DESC
)
AND logout_at IS NULL;

-- Funcao para limpeza de sessoes antigas
CREATE OR REPLACE FUNCTION cleanup_old_user_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions
  WHERE login_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cron job diario
SELECT cron.schedule(
  'cleanup-old-sessions',
  '0 3 * * *',  -- Todo dia as 3h da manha
  $$SELECT cleanup_old_user_sessions()$$
);
```

### 3. `src/pages/Atividades.tsx`

- Na aba Conexoes, mostrar a data/hora exata alem do "ha X minutos"
- Exemplo: "Login: 17/02/2026 14:10 (ha 10 minutos)"

### Resumo de arquivos

| Arquivo | Acao |
|---------|------|
| `src/contexts/AuthContext.tsx` | Evitar duplicatas + remover chamada dupla |
| `src/pages/Atividades.tsx` | Mostrar data/hora exata na aba Conexoes |
| Migracao SQL | Cleanup de duplicatas + cron de 30 dias |
