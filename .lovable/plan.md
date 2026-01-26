

# Plano: Reduzir Largura dos Cards de Ranking

## Problema Identificado

Na imagem, os cards de colaboradores na lista de ranking estão ocupando 100% da largura disponível, criando muito espaço vazio entre as informações do colaborador e os badges de equipe/pontos à direita. Isso deixa o layout pouco atrativo.

## Solução Proposta

Limitar a largura máxima dos cards de ranking para que fiquem mais compactos e visualmente agradáveis.

---

## Mudanças Técnicas

**Arquivo:** `src/components/dashboard/TaskLeaderboard.tsx`

### 1. Adicionar largura máxima ao container da lista (linha 452)

De:
```tsx
<div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2">
```

Para:
```tsx
<div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-2 max-w-xl">
```

### 2. Alternativa: Ajustar o RankingCard diretamente (linha 253-255)

De:
```tsx
<div 
  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border hover:border-primary/40 transition-all"
>
```

Para:
```tsx
<div 
  className="flex items-center gap-3 p-2 rounded-lg bg-card border border-border hover:border-primary/40 transition-all max-w-lg"
>
```

Isso irá:
- Limitar a largura máxima do card para aproximadamente 512px (`max-w-lg`)
- Reduzir o padding de `p-3` para `p-2` para cards mais compactos

---

## Resultado Visual Esperado

```
┌────────────────────────────────────────────────────────────────────┐
│ Pódio Top 3            │  Lista Compacta                          │
│                        │                                          │
│   🥈    🥇    🥉       │  ┌─────────────────────────────────────┐ │
│  Marcos Mateus Kerlys  │  │ [1] [🔵] Mateus Brito  [Eq] [0pts] │ │
│                        │  └─────────────────────────────────────┘ │
│                        │  ┌─────────────────────────────────────┐ │
│                        │  │ [2] [🔵] Marcos        [Eq] [0pts] │ │
│                        │  └─────────────────────────────────────┘ │
│                        │  ┌─────────────────────────────────────┐ │
│                        │  │ [3] [🔵] Kerlys kauan  [Eq] [0pts] │ │
│                        │  └─────────────────────────────────────┘ │
│                        │                                          │
│                        │                    (espaço livre)        │
└────────────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/TaskLeaderboard.tsx` | Adicionar `max-w-lg` ao RankingCard e reduzir padding |

---

## Checklist de Validação

1. **Largura dos Cards:**
   - [ ] Cards ocupam no máximo ~512px de largura
   - [ ] Espaço vazio fica à direita (fora dos cards)
   - [ ] Informações continuam visíveis e legíveis

2. **Visual:**
   - [ ] Cards mais compactos e elegantes
   - [ ] Badges de equipe e pontos próximos ao nome
   - [ ] Layout responsivo em telas menores

