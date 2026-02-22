
# Correcoes: Lucro Real nos Blocos de Producao e Imagem OG do CRM

## Problema 1: Lucro no card nao subtrai despesas operacionais

**Causa raiz**: A funcao `ensureCurrentMonthBlock` em `ProductionDashboard.tsx` calcula o lucro como `totalRevenue - totalCost` (apenas custo dos produtos). As despesas operacionais da tabela `production_expenses` NAO sao subtraidas. O modal calcula corretamente na linha 165 (`realProfit = block.total_revenue - block.total_cost - totalExpenses`), mas esse valor nunca e salvo de volta no campo `total_profit` do bloco.

### Correcao em `src/components/ProductionDashboard.tsx`:

Na funcao `ensureCurrentMonthBlock`, apos calcular as metricas de vendas, buscar tambem as despesas da tabela `production_expenses` para o bloco e subtraí-las do lucro:

```typescript
// Buscar despesas do bloco
const { data: expenses } = await supabase
  .from("production_expenses")
  .select("amount")
  .eq("organization_id", organizationId)
  .eq("production_block_id", blockId);

const totalExpenses = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
const profit = totalRevenue - totalCost - totalExpenses;
```

Isso requer um ajuste no fluxo: ao atualizar um bloco existente, precisamos usar o `existing.id` para buscar as despesas. Ao criar um novo bloco, primeiro inserimos, depois buscamos as despesas (que serao 0 para um bloco novo).

O campo `total_profit` salvo no banco passara a refletir o lucro real (receita - custos - despesas), e o card mostrara o valor correto.

---

## Problema 2: Imagem OG mostra Lovable ao inves de KairoZ CRM

**Causa raiz**: O `index.html` nas linhas 32 e 36 aponta para `https://lovable.dev/opengraph-image-p98pqg.png`. Quando o link do CRM e compartilhado em redes sociais, essa imagem da Lovable aparece na preview.

### Correcao:

1. Criar uma imagem OG (1200x630px) para o KairoZ CRM e salva-la em `public/og-image.png`
2. Atualizar `index.html`:
   - Linha 32: `og:image` -> apontar para a URL absoluta da imagem no dominio publicado (`https://www.kairozcrm.com.br/og-image.png`)
   - Linha 36: `twitter:image` -> mesma URL
   - Linha 35: remover `@Lovable` do `twitter:site`

A imagem sera gerada usando o logo existente do KairoZ (`src/assets/kairoz-logo-full-new.png`) com fundo escuro e o texto descritivo do CRM, em formato 1200x630 para compatibilidade com todas as redes sociais.

Como nao e possivel gerar imagens programaticamente aqui, sera criada uma pagina HTML simples em `public/og-image.html` que renderiza o design, ou usaremos diretamente o logo existente redimensionado. A abordagem mais pratica: copiar o logo `kairoz-logo-full-new.png` para `public/og-image.png` e ajustar as meta tags.

**Alternativa recomendada**: Criar um SVG inline convertido para PNG com fundo escuro (#1a1a1a), o logo centralizado e o texto "Sistema completo de CRM" abaixo. Se o usuario preferir, pode fornecer uma imagem personalizada.

---

## Resumo

| Problema | Arquivo(s) | Correcao |
|----------|-----------|---------|
| Lucro sem despesas no card | ProductionDashboard.tsx | Subtrair production_expenses no calculo |
| Imagem OG da Lovable | index.html + public/og-image.png | Nova imagem + meta tags atualizadas |
