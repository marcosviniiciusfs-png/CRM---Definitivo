

# Corrigir Badge "Em breve" no Menu Lateral

## Problema

O badge "Em breve" esta quebrando o layout do menu: em itens como "Roleta de Leads" o texto do item trunca demais e o badge ocupa espaco excessivo, especialmente quando o badge quebra em duas linhas ("Em / breve").

## Solucao

Trocar o Badge de texto por um icone compacto com tooltip. Em vez de mostrar o texto "Em breve", usar um pequeno icone de cadeado (`Lock`) de 3.5x3.5 com um tooltip que mostra "Em breve" ao passar o mouse. Isso resolve o problema de espaco e fica minimalista.

Alternativamente, se preferirmos manter texto, reduzir drasticamente o badge:
- Fonte: `text-[8px]` com `leading-none`
- Padding: `px-1 py-px`
- Forcar `whitespace-nowrap` para nunca quebrar linha
- Adicionar `flex-shrink-0` no badge
- Adicionar `min-w-0` e `truncate` no span do titulo

## Abordagem escolhida: Icone com Tooltip

Usar um pequeno icone `Lock` (cadeado) ao lado do item, com Tooltip mostrando "Em breve". Mais limpo, mais minimalista, sem problemas de espaco.

## Alteracoes

### `src/components/AppSidebar.tsx`

**Nos dois blocos de itens bloqueados** (items do menu principal, linha ~150-158, e bottomItems, linha ~217-228):

Substituir:
```
<Badge variant="outline" className="ml-auto text-[10px] px-1.5 py-0 border-sidebar-foreground/30 text-sidebar-foreground/60">
  Em breve
</Badge>
```

Por:
```
<Tooltip>
  <TooltipTrigger asChild>
    <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
  </TooltipTrigger>
  <TooltipContent side="right" className="text-xs">
    Em breve
  </TooltipContent>
</Tooltip>
```

Adicionar imports de `Tooltip`, `TooltipTrigger`, `TooltipContent` de `@/components/ui/tooltip` e envolver o sidebar com `TooltipProvider` (ou verificar se ja existe um no App).

O icone Lock ja esta importado no arquivo. Basta adicionar os imports do Tooltip e substituir os dois blocos de Badge.

