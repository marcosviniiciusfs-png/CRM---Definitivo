

# Correcoes: Sidebar Colapsada, Admin Dashboard Cores, e Gestao de Planos

## Problema 1: Sidebar colapsada - icones de Lock quebrados

Quando a sidebar esta no modo colapsado (apenas icones), os itens bloqueados mostram o icone do item E o icone de Lock lado a lado, quebrando o layout dentro do espaco limitado de 3rem. O icone de Lock nao deveria aparecer quando a sidebar esta colapsada - apenas o icone principal do item deve ser visivel, com opacity reduzida para indicar que esta bloqueado.

### Solucao

No `AppSidebar.tsx`, nos dois blocos de itens bloqueados (menu principal e bottomItems):
- Quando `!open` (colapsado): renderizar apenas o icone do item com `opacity-50`, sem o Lock e sem o texto
- Quando `open` (expandido): manter o layout atual (icone + texto + Lock com tooltip)
- Envolver o item colapsado em um Tooltip que mostra "Em breve" ao passar o mouse

### Arquivo: `src/components/AppSidebar.tsx`

Bloco de itens principais (linhas ~150-163):
```
{isLocked ? (
  open ? (
    <div className="flex items-center gap-2 opacity-50 cursor-not-allowed text-sidebar-foreground text-base px-3 py-2.5">
      <item.icon className="h-5 w-5 flex-shrink-0" />
      <span className="truncate">{item.title}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Lock className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">Em breve</TooltipContent>
      </Tooltip>
    </div>
  ) : (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center opacity-50 cursor-not-allowed text-sidebar-foreground py-2.5">
          <item.icon className="h-5 w-5" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">
        {item.title} - Em breve
      </TooltipContent>
    </Tooltip>
  )
)
```

Mesma logica para o bloco de bottomItems (linhas ~221-237).

---

## Problema 2: Admin Dashboard (AdminUserDetails) - cores quebradas no dark mode

A imagem mostra que a pagina de detalhes do usuario (`AdminUserDetails.tsx`) usa fundo escuro/preto com textos em cores escuras, tornando ilegivel. O problema e que a pagina usa classes de cores fixas como `bg-gray-50`, `text-gray-900` etc. que funcionam em tema claro mas nao no escuro.

### Solucao

Forcar o tema claro no Admin Dashboard e AdminUserDetails, ja que foram projetados com estetica branca/clara. Adicionar `className="bg-white"` e classes explicitas de cor clara em todos os elementos.

### Arquivo: `src/pages/AdminUserDetails.tsx`

- Linha 229: Trocar `bg-gray-50` por `bg-white` no loading
- Linha 256: Trocar `min-h-screen bg-gray-50` por `min-h-screen bg-gray-50 text-gray-900`
- Linha 268: Adicionar `text-gray-900` ao titulo
- Linha 269: Adicionar `text-gray-500` na descricao
- Card principal: Forcar `bg-white` e `text-gray-900` no Card
- Todas as labels e textos: usar cores explicitas de tema claro (`text-gray-900`, `text-gray-500`, `text-gray-600`)
- Botoes de acao: garantir cores visiveis em fundo branco
- Tabela de colaboradores: forcar cores explicitas de texto

---

## Problema 3: Gestao de planos no Admin - alterar plano do usuario

Atualmente o AdminUserDetails nao tem nenhuma funcionalidade para alterar o plano/assinatura de um usuario. O admin precisa poder:
- Ver o plano atual do usuario (ou "Sem plano")
- Alterar o plano (star, pro, elite) ou remover plano

### Solucao

Adicionar uma secao "Plano e Assinatura" no AdminUserDetails com:
1. Exibir o plano atual buscando da tabela `subscriptions` pelo `user_id`
2. Um Select para escolher o novo plano (Nenhum, Star, Pro, Elite)
3. Um botao "Salvar Plano" que faz upsert na tabela `subscriptions`

### Arquivo: `src/pages/AdminUserDetails.tsx`

Adicionar apos a secao de "Informacoes da Conta":
- Novo estado: `currentPlan`, `selectedPlan`, `savingPlan`
- No `loadUserDetails`: buscar assinatura do usuario na tabela `subscriptions`
- Nova secao Card com titulo "Plano e Assinatura"
- Select com opcoes: Nenhum, Star (R$47,99), Pro (R$197,99), Elite (R$499,00)
- Botao "Salvar Plano" que faz upsert na tabela `subscriptions` com os campos:
  - `user_id`, `plan_id`, `status: 'authorized'`, `amount` (conforme plano)
  - Se "Nenhum": deletar o registro de subscription
- Exibir badge com plano atual

### Migracao necessaria

Criar uma policy RLS que permita super_admins gerenciar subscriptions, ou usar uma Edge Function para isso (mais seguro).

Opcao escolhida: usar update direto via Supabase client, pois o super_admin ja tem acesso administrativo. Precisaremos de uma RLS policy que permita super_admins fazer INSERT/UPDATE/DELETE na tabela `subscriptions`.

---

## Resumo de arquivos

| Arquivo | Acao |
|---------|------|
| `src/components/AppSidebar.tsx` | Condicionar Lock icon baseado no estado open/collapsed |
| `src/pages/AdminUserDetails.tsx` | Forcar cores claras, adicionar secao de gestao de planos |
| Migracao SQL | Adicionar RLS policy para super_admins gerenciarem subscriptions |

