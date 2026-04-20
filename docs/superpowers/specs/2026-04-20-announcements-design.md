# Sistema de Avisos (Announcements) — Design Spec

## Resumo

Sistema de avisos que permite ao Super Admin criar notificações exibidas como pop-up modal para usuários do CRM ao entrarem no sistema. Inclui templates prontos, agendamento, preview e controle de dispensa por usuário.

## Permissões

- **Criação/Gerência**: Somente Super Admin
- **Destinatários**: Global (todas as organizações) ou por organização específica

## Banco de Dados

### Tabela `announcements`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Auto-gerado |
| `title` | text | Título do aviso |
| `content` | text | Conteúdo formatado (suporta negrito, itálico, links) |
| `gif_url` | text (nullable) | URL do GIF exibido no popup |
| `template_type` | text (nullable) | Tipo de template: `meta_reconnect`, `new_feature`, `maintenance`, `custom` |
| `target_type` | text | `global` ou `organization` |
| `target_organization_id` | uuid (nullable, FK organizations) | Org destino (se target_type = organization) |
| `is_active` | boolean | Se está ativo/visível |
| `scheduled_at` | timestamptz (nullable) | Data/hora agendada para disparo |
| `created_by` | uuid (FK auth.users) | Super admin que criou |
| `created_at` | timestamptz | Data de criação |

### Tabela `announcement_dismissals`

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid (PK) | Auto-gerado |
| `announcement_id` | uuid (FK announcements) | Aviso dispensado |
| `user_id` | uuid (FK auth.users) | Usuário que dispensou |
| `dismissed_at` | timestamptz | Quando dispensou |

**Constraint**: UNIQUE(announcement_id, user_id) — um usuário só pode dispensar cada aviso uma vez.

## Templates

Cada template tem um ícone SVG e cor específica, e pré-preenche título e conteúdo:

| Template | Ícone | Cor | Imagem no popup | Conteúdo pré-definido |
|---|---|---|---|---|
| `meta_reconnect` | Link/chain | Cyan (#06b6d4) | PNG fixa (ícone Meta, 48x48px) | Passo a passo de reconexão com Meta (4 passos) |
| `new_feature` | Estrela | Verde (#22c55e) | GIF (48x48px, customizável) | Placeholder para descrever nova funcionalidade |
| `maintenance` | Engrenagem | Amarelo (#eab308) | GIF (48x48px, customizável) | Aviso de sistema indisponível com data/hora |
| `custom` | Lápis | Roxo (#a855f7) | GIF (48x48px, customizável) | Em branco |

**Nota**: O template `meta_reconnect` usa uma imagem PNG estática (ícone do Meta/Facebook) no lugar do GIF. Os demais templates usam GIF animado (configurável via campo `gif_url`).

O Super Admin pode editar o conteúdo pré-definido após selecionar um template.

## Admin Dashboard — Aba "Avisos"

Nova aba dentro do `AdminDashboard.tsx`, com layout de **cards**:

### Lista de Avisos
- Cards mostrando: título, template (ícone + cor), destinatário (Global / Nome da Org), status (Ativo/Inativo), data de criação, data agendada (se houver)
- Botões por card: Editar, Ativar/Desativar
- Botão "+ Novo Aviso" no topo

### Formulário de Criação/Edição
- **Seletor de template** — 4 cards clicáveis (Meta, Novidade, Manutenção, Customizado)
- **Campo de título** — texto simples
- **Editor de conteúdo** — texto formatado (negrito, itálico, links)
- **Upload/URL de GIF** — campo para URL do GIF (opcional)
- **Seletor de destinatário** — Todos ou organização específica (dropdown)
- **Agendamento** — toggle "Agora" / "Agendar":
  - Se "Agendar": campos de data e horário, botão "Agendar"
  - Se "Agora": abre modal de confirmação com preview
- **Botão Preview** — mostra o popup exatamente como o usuário vai ver

### Fluxo de envio
1. Super Admin preenche o formulário
2. Se "Agendar": salva com `scheduled_at` preenchido, status ativo, aguarda a data
3. Se "Agora": abre modal de confirmação:
   - Mostra preview visual do aviso (GIF + título + conteúdo + checkbox)
   - Texto: "Este aviso será enviado **agora** para **[destinatário]**"
   - Botões: Cancelar / Confirmar disparo
4. Ao confirmar: salva com `is_active = true` e `scheduled_at = now()`

## Popup do Usuário — Modal Centralizado

No `DashboardLayout`, ao carregar a página:

### Consulta de avisos
- Busca avisos com `is_active = true` E (`scheduled_at` é null OU `scheduled_at <= now()`)
- Filtra por `target_type = 'global'` OU `target_organization_id = org_do_usuario`
- Exclui avisos que o usuário já dispensou (estão em `announcement_dismissals`)
- Se múltiplos avisos: mostra um por vez (fila), próximo após dispensar o anterior

### Exibição do modal
- **Preload de imagem**: o modal só aparece após a imagem (GIF ou PNG) estar totalmente carregada (`onload`). Enquanto carrega, o modal fica invisível.
- **Layout**:
  - Imagem (GIF ou PNG, 48x48px, `object-fit: contain`) ao lado esquerdo. Template `meta_reconnect` usa PNG fixo; demais usam GIF.
  - Ícone do template (SVG pequeno, cor do template) + label do tipo
  - Título do aviso
  - Conteúdo formatado abaixo
- **Checkbox**: "Entendi e não quero mais ver esse aviso"
- **Botão**: "Fechar"
- **Overlay escuro** bloqueando interação até dispensar

### Comportamento de dispensa
- Se checkbox marcado + fechar: grava em `announcement_dismissals`
- Aviso não aparece mais para aquele usuário
- Próximo aviso na fila (se houver) é exibido

## Agendamento (Execução)

- Avisos com `scheduled_at` futuro ficam com `is_active = true` mas não aparecem para usuários até a data chegar
- A consulta de avisos no `DashboardLayout` filtra por `scheduled_at <= now()`
- Não precisa de cron job — a verificação é feita no momento da consulta

## Escopo Local

Tudo funciona localmente em localhost:
- Migrações no Supabase local
- Componentes React no Vite dev server
- Sem dependências externas adicionais
