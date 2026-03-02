

## Diagnóstico: Por que as seções ainda aparecem trancadas

### Problema encontrado

A correção anterior protegeu o `SectionGate` (que controla redirects), mas **não corrigiu o `AppSidebar`** — o componente que renderiza os ícones de cadeado no menu lateral.

No `AppSidebar.tsx` (linha 92-109), o código faz:

```typescript
const { sectionAccess, isSectionUnlocked } = useSectionAccess();
// NÃO usa 'loading' ⬆️

const isFeatureLocked = useCallback((url: string) => {
  const access = isSectionVisible(url);
  if (access === true) return false;
  if (access === false) return true;
  return LOCKED_FEATURES.includes(url); // ← Quando sectionAccess é null, cai aqui = TRANCADO
}, [isSectionVisible]);
```

Quando `sectionAccess` é `null` (durante token refresh ou carregamento), `isSectionVisible` retorna `undefined`, e `isFeatureLocked` aplica o comportamento padrão: **trancar** Chat, Integrações, Métricas e Roleta de Leads. Isso causa o flash de cadeado visível na screenshot.

### Solução

**Arquivo: `src/components/AppSidebar.tsx`**

1. Extrair `loading` do `useSectionAccess()`
2. No `isFeatureLocked`, quando `loading` é `true`, retornar `false` (não mostrar cadeado enquanto dados estão carregando)

Mudança específica:

- Linha 92: `const { sectionAccess, isSectionUnlocked, loading: sectionLoading } = useSectionAccess();`
- Linha 104-109: Adicionar verificação no início de `isFeatureLocked`:
  ```typescript
  const isFeatureLocked = useCallback((url: string) => {
    if (sectionLoading) return false; // Don't show locks while loading
    const access = isSectionVisible(url);
    if (access === true) return false;
    if (access === false) return true;
    return LOCKED_FEATURES.includes(url);
  }, [isSectionVisible, sectionLoading]);
  ```

Isso é uma mudança de **2 linhas** que resolve o flash de cadeados. Depois de implementar, será necessário **publicar** para que chegue à produção.

