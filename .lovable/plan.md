

## Diagnóstico: Seções "trancando" momentaneamente em produção

### Problema identificado

O problema é uma **condição de corrida (race condition)** no fluxo de carregamento do `sectionAccess` no `AuthContext`. Quando o token de autenticação é renovado automaticamente (o que acontece periodicamente em produção), o Supabase Auth dispara eventos que resetam o estado das seções, causando:

1. **Flash de "trancado"**: As seções como Integrações, Chat e Roleta de Leads aparecem brevemente como bloqueadas porque o `sectionAccess` é limpo e resetado a `null`, enquanto `sectionAccessLoading` é colocado como `false`. Nesse momento, o sistema aplica o comportamento padrão: essas seções estão na lista `LOCKED_FEATURES` e aparecem como trancadas.

2. **Redirecionamento automático**: O `SectionGate` detecta que a seção está "trancada" (porque `sectionAccess` é `null` mas `loading` é `false`) e redireciona o usuário para `/dashboard`. Quando os dados recarregam, o acesso é restaurado.

### Causa raiz técnica

No `AuthContext.tsx`, o handler de `SIGNED_OUT` faz:
```
setSectionAccess(null);
setSectionAccessLoading(false);
clearSectionAccessCache();
```

Quando o token é renovado ou há qualquer evento de auth, há uma janela onde o estado fica inconsistente: `loading = false` + `sectionAccess = null`. O `SectionGate` interpreta isso como "seção trancada" e redireciona.

Além disso, o `SubscriptionGate` também pode causar flash ao resetar `subscriptionData` para `null`.

### Solução

Três correções coordenadas:

---

**1. `AuthContext.tsx` — Proteger contra resets desnecessários**

- No handler de `onAuthStateChange`, só limpar `sectionAccess` e `subscriptionData` quando o evento for realmente `SIGNED_OUT` E não houver mais sessão ativa
- Manter `sectionAccessLoading = true` enquanto `sectionAccess` for `null` e houver um usuário logado (nunca permitir o estado inconsistente `loading=false` + `access=null` + `user exists`)
- Adicionar proteção no evento `TOKEN_REFRESHED` para não resetar dados

**2. `SectionGate.tsx` — Tratar estado `null` como "carregando"**

- Adicionar uma verificação extra: se `loading` é `false` mas `sectionAccess` é `null` e existe um usuário logado, continuar mostrando o loading em vez de aplicar os defaults (que trancam as seções)
- Isso previne o redirect para `/dashboard` durante a janela de inconsistência

**3. `useSectionAccess.ts` — Não trancar quando dados ainda não carregaram**

- Quando `sectionAccess` é `null`, reportar `loading = true` para impedir que componentes tomem decisões com dados incompletos
- Isso corrige tanto o `SectionGate` quanto o menu lateral (`AppSidebar`)

---

### Arquivos a serem editados

| Arquivo | Mudança |
|---------|---------|
| `src/contexts/AuthContext.tsx` | Proteger contra reset de estado em token refresh; manter loading consistente |
| `src/components/SectionGate.tsx` | Tratar `sectionAccess === null` como loading |
| `src/hooks/useSectionAccess.ts` | Reportar loading quando `sectionAccess` é null mas user existe |

### Por que funciona no preview mas não em produção

No preview da Lovable, a sessão é recém-criada e o cache está fresco. Em produção, os tokens expiram e são renovados automaticamente pelo Supabase Auth, disparando eventos de auth que causam o reset temporário do estado. A renovação de token é mais frequente em sessões longas, que é exatamente o cenário de produção.

Após a implementação, será necessário **publicar o projeto** para que as mudanças cheguem à produção.

