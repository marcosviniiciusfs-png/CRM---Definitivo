
## Diagnóstico (com evidência)

Hoje **não está funcionando** (sem som e sem ícone amarelo) porque **não existe nenhuma notificação sendo criada na tabela `notifications`** quando uma tarefa é atribuída.

Eu conferi no banco (ambiente de teste) e encontrei:

1) Existem atribuições reais:
- A tabela `kanban_card_assignees` tem registros recentes para o colaborador `kerlyskauan@gmail.com` (user_id `c673...`) em cards criados em `2026-02-08`.

2) Mas **a tabela `notifications` está vazia**:
- Não há nenhuma linha `task_assigned` (na verdade, não há linhas de notificação de nenhum tipo).

3) Por que isso acontece?
- A tabela `notifications` está com RLS ativo e **não existe policy de INSERT**.
- Além disso, existe uma policy “Deny public access to notifications” com `FOR ALL USING (false)`, que efetivamente impede INSERTs vindos do app.
- O frontend (`KanbanBoard.tsx`) tenta fazer `supabase.from("notifications").insert(...)`, porém esse INSERT **é bloqueado** pela segurança e o código **não checa/mostra erro**, então “parece que não aconteceu nada”.

Resultado: o `TaskAlertContext` consulta por notificações pendentes, encontra 0, então:
- `hasPendingTasks = false`
- não aparece bolinha/triângulo no menu
- não toca som
- não aparece card amarelo no topo

## Objetivo da correção

Garantir que **sempre** que um colaborador for atribuído a uma tarefa (assignee), o sistema crie uma notificação “task_assigned” de forma confiável e segura (sem depender do cliente ter permissão de inserir em `notifications`).

## Solução proposta (robusta e “à prova de falhas”)

### A) Mover a criação da notificação para o banco (gatilho/trigger)
Criar uma função SQL `SECURITY DEFINER` + trigger em `kanban_card_assignees`:

- Quando um assignee é inserido (novo responsável),
- o banco automaticamente insere em `notifications`:
  - `user_id` = `NEW.user_id` (responsável)
  - `type` = `'task_assigned'`
  - `title` = `'Tarefa atribuída'`
  - `message` = texto com o título do card
  - `card_id` = `NEW.card_id`
  - `due_date` e `time_estimate` = puxados de `kanban_cards`
  - `from_user_id` = `COALESCE(NEW.assigned_by, auth.uid())`

**Validações dentro da função (para não gerar notificações erradas/abusos):**
1. Confirmar que o card pertence a uma organização em que o usuário que está atribuindo tem acesso (o RLS de assignees já garante isso, mas vamos validar também).
2. Confirmar que o `NEW.user_id` (destinatário) é membro da mesma organização do card antes de notificar.
3. (Opcional – decisão) Não notificar quando alguém se atribui a si mesmo (reduz ruído). Se você quiser “notificar até quando for o próprio”, a gente não faz essa exceção.

**Por que isso garante que vai funcionar?**
- O INSERT em `notifications` passa a ser feito pelo próprio banco via `SECURITY DEFINER`, sem depender de policy de INSERT no cliente.
- Isso é exatamente o padrão já usado no projeto para notificar atribuição de lead (há função `SECURITY DEFINER` no schema).

### B) Backfill (corrigir tarefas já atribuídas que não geraram notificação)
Como você já atribuiu tarefas e “nada aconteceu”, precisamos “reparar” o estado atual.

Na mesma migração, executar um INSERT em lote:
- Para cada linha em `kanban_card_assignees` recente (ex.: últimos 90 dias) que **não tenha** ainda uma notificação `task_assigned` correspondente (`NOT EXISTS` por `user_id + card_id + type`),
- criar a notificação.

Isso vai fazer o colaborador passar a ver o indicador e o card imediatamente, e o som (depois que ele ativar o áudio, se necessário).

### C) Ajustes no frontend para evitar duplicidade e “falha silenciosa”
Depois que o trigger existir:

1) **Remover** (ou desativar) os `supabase.from("notifications").insert({ type: "task_assigned" ... })` do `KanbanBoard.tsx`, porque:
- eles hoje falham por RLS
- e depois do trigger, seriam redundantes (e poderiam gerar duplicidade se um dia as policies mudarem)

2) Adicionar logging/handling mínimo para o fluxo de atribuição:
- se a inserção em `kanban_card_assignees` falhar, mostrar toast de erro.
- (Opcional temporário) durante validação, logar no console quando `checkPendingTasks()` encontrar pendências e qual o `count`.

### D) Garantir que o som usado é o arquivo que você enviou
Substituir o áudio atual por **exatamente** o arquivo enviado:
- `user-uploads://dragon-studio-bell-ring-390294.mp3` → `public/task-notification.mp3`

Assim o `/task-notification.mp3` é sempre o sino correto.

## Mudanças (o que será alterado)

### 1) Migração SQL (banco)
Criar uma nova migration contendo:

1. Função `public.notify_task_assignment()` (SECURITY DEFINER)
2. Trigger `AFTER INSERT ON public.kanban_card_assignees`
3. Backfill de notificações para atribuições existentes sem notificação
4. (Manter) `viewed_at` e índice já criados (se já existem, não mexe)

### 2) Arquivos do frontend
- `src/components/KanbanBoard.tsx`
  - remover as inserções diretas de `notifications` para `task_assigned` (a criação passa a ser automática pelo banco)
- `public/task-notification.mp3`
  - substituir pelo arquivo novo enviado

Nenhuma mudança estrutural é necessária no:
- `TaskAlertContext.tsx`
- `AppSidebar.tsx`
- `TaskPermissionAlert.tsx`
porque a lógica deles já funciona desde que existam notificações pendentes de verdade.

## Plano de validação (para ter certeza absoluta)

### Teste 1 — Criação de tarefa com atribuição (colaborador fora de /tasks)
1. Logar como Admin/Owner.
2. Criar uma tarefa e atribuir ao colaborador (aquele que aparece com “fotinho”).
3. Verificar no banco:
   - existe linha em `notifications` com:
     - `user_id = colaborador`
     - `type = 'task_assigned'`
     - `card_id = id do card`
     - `viewed_at IS NULL`
4. Logar como colaborador (em outra aba/navegador):
   - o menu “Tarefas” deve mostrar:
     - bolinha amarela pulsando, ou
     - triângulo amarelo pulsando (se áudio ainda não liberado)
   - se o navegador bloquear autoplay:
     - o card amarelo na página /tasks deve aparecer com o botão “Ativar som”
   - após clicar em “Ativar som”, o som deve começar a tocar a cada 5s (quando houver pendência e ele não estiver em /tasks)

### Teste 2 — Parada do som ao “ver” tarefas
1. Com pendências ativas e som tocando fora de /tasks,
2. Navegar para `/tasks`
3. Permanecer por pelo menos 5 segundos
4. Verificar:
   - `viewed_at` foi preenchido nas notificações `task_assigned` pendentes
   - o indicador do menu some
   - o som para

### Teste 3 — Funciona para todos (inclusive dono)
1. Atribuir tarefa ao Owner e repetir os testes acima.

### Teste 4 — Reatribuição / novos assignees em tarefa existente
1. Pegar um card existente
2. Adicionar um novo responsável
3. Confirmar que a notificação aparece para esse novo responsável

## Riscos e como vamos mitigar

1) **Duplicidade de notificações**
- Mitigação:
  - backfill usa `NOT EXISTS`
  - trigger cria apenas quando há INSERT em `kanban_card_assignees` (que é UNIQUE por `card_id,user_id`)

2) **Atribuir tarefa para um usuário que não é membro da organização**
- Mitigação:
  - trigger valida membership antes de criar notificação

3) **Autoplay bloqueado (comportamento do navegador)**
- Mitigação:
  - indicador no menu + card amarelo com botão “Ativar som”
  - (Importante) não existe “permissão do navegador” específica para som; o requisito real é “interação do usuário” para liberar áudio. O botão resolve isso.

## Checklist final antes de publicar em produção
- Confirmar em teste: notificações surgindo no banco + indicador no menu + som/stop após 5s em /tasks.
- Publicar o frontend (Update no Publish) para refletir as mudanças no site publicado.
- Garantir que a migration também foi aplicada no ambiente publicado (via Publish).

## Observação importante (manutenção)
Como o projeto está com RLS impedindo INSERT direto em `notifications`, qualquer notificação criada pelo frontend (ex.: `task_mention`) também tende a falhar. Se você quiser que “menções @nome” também notifiquem sempre, eu proponho um passo 2 depois: criar um caminho seguro (função no backend) para essas notificações também. Para o que você pediu agora (atribuição de responsável com foto), o trigger resolve 100%.
