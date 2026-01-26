

# Plano: Centralizar Conteúdo do Ranking

## Problema Atual

Na imagem, o pódio (Top 3) e a lista de ranking estão posicionados à esquerda da tela, deixando muito espaço vazio à direita. O layout usa `grid-cols-[auto_1fr]` que faz a segunda coluna ocupar todo o espaço disponível.

## Solução Proposta

Modificar o container principal para centralizar todo o conteúdo horizontalmente na tela.

---

## Mudanças Técnicas

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

### Alterar o container principal (linha 430)

De:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
```

Para:
```tsx
<div className="grid grid-cols-1 lg:grid-cols-[auto_auto] gap-8 items-start justify-center mx-auto">
```

Isso irá:
- Mudar de `1fr` para `auto` na segunda coluna, permitindo que ela tenha apenas o tamanho do conteúdo
- Adicionar `justify-center` para centralizar horizontalmente as colunas do grid
- Adicionar `mx-auto` para garantir que o grid fique centralizado no container pai

---

## Resultado Visual Esperado

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│            ┌───────────────────┐    ┌──────────────────────┐                 │
│            │    Pódio Top 3    │    │  Ranking de Tarefas  │                 │
│            │                   │    │                      │                 │
│            │  🥈   🥇   🥉     │    │ [1] Mateus  [Eq] 0pt│                 │
│            │ Marcos Mateus     │    │ [2] Marcos  [Eq] 0pt│                 │
│            │        Kerlys     │    │ [3] Kerlys  [Eq] 0pt│                 │
│            │                   │    │                      │                 │
│            └───────────────────┘    └──────────────────────┘                 │
│                                                                              │
│         (espaço equilibrado)    CENTRO    (espaço equilibrado)               │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/TaskLeaderboard.tsx` | Centralizar grid com `justify-center` e `mx-auto` |

---

## Checklist de Validação

1. **Centralização:**
   - [ ] Pódio e lista aparecem centralizados na tela
   - [ ] Espaço equilibrado à esquerda e à direita
   - [ ] Layout responsivo mantido em mobile (coluna única)

2. **Visual:**
   - [ ] Cards de ranking mantêm largura compacta
   - [ ] Espaço entre pódio e lista adequado

