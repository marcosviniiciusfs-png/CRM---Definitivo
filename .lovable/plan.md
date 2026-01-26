

# Plano: Posicionar Cards Lado a Lado

## Situação Atual

Os cards "Resumo - Este Mês" e "Destaques" estão empilhados verticalmente dentro do `RankingSidePanel`:

```
┌──────────────────┐
│ Resumo - Este Mês│
│ ...              │
└──────────────────┘
        ↓
┌──────────────────┐
│ Destaques        │
│ ...              │
└──────────────────┘
```

## Mudança Proposta

Alterar o layout para que fiquem lado a lado:

```
┌──────────────────┐  ┌──────────────────┐
│ Resumo - Este Mês│  │ Destaques        │
│ ...              │  │ ...              │
└──────────────────┘  └──────────────────┘
```

---

## Mudança Técnica

**Arquivo:** `src/components/dashboard/RankingSidePanel.tsx`

### Alterar o container principal (linha 305)

De:
```tsx
<div className="space-y-4 w-full max-w-xs">
```

Para:
```tsx
<div className="flex gap-4 w-full">
```

### Adicionar largura igual aos dois cards

Adicionar `flex-1` a cada Card para que ocupem espaço igual:

**Card de Resumo (linha 307):**
```tsx
<Card className="p-4 flex-1">
```

**Card de Destaques (linha 321):**
```tsx
<Card className="p-4 flex-1">
```

---

## Resultado Visual Esperado

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  PÓDIO  │  LISTA DE RANKING  │  RESUMO - Este Mês  │  DESTAQUES                       │
│  TOP 3  │                    │                     │                                  │
│         │  [1] Mateus  0pt   │  Total de Pontos    │  ⚡ Mais Produtivo               │
│  🥇 🥈 🥉│  [2] Marcos  0pt   │  Tarefas Concluídas │     Mateus - 5 pts               │
│         │  [3] Kerlys  0pt   │  Taxa Pontualidade  │  ⏱️ Mais Pontual                 │
│         │                    │  Média por Membro   │     Mateus - 100% no prazo       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquivo a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/dashboard/RankingSidePanel.tsx` | Mudar layout de vertical para horizontal usando `flex` |

