
Contexto do problema (o “porquê”)
- O erro não está mais no “cargo” (permissões granulares) em si. O cargo do Marcos (“Gestor de Tráfego”) está corretamente configurado com can_view_kanban = true, e o frontend já checa isso.
- O que ainda quebra a visualização do Kanban (e pode quebrar outras áreas do CRM) é um problema no backend: as funções usadas para validar organização ativa e papel do usuário foram criadas/alteradas usando uma coluna que não existe.

Evidência concreta (do que encontrei)
1) Erro no banco: “column om.status does not exist”
- Nos logs do banco aparecem erros “column om.status does not exist”.
- Na tabela public.organization_members não existe a coluna status. O que existe é is_active (boolean).
- Porém, as funções abaixo (que o sistema usa para multi-organização e para RLS) estão filtrando por om.status = 'active':
  - public.get_user_organization_id
  - public.get_user_organization_role
  - public.set_user_active_organization

2) Isso faz o “sync” da organização ativa falhar
- O OrganizationContext chama supabase.rpc('set_user_active_organization', { _org_id: targetOrgId }).
- Como a função está quebrada (usa om.status), o RPC falha (no console do Marcos aparece “Failed to sync active org …” e várias requisições 400).
- Resultado: o backend não registra qual é a organização ativa do usuário.

3) E isso impacta diretamente o Kanban e outras seções
- As políticas de segurança (RLS) do Kanban e de várias tabelas fazem checagens baseadas em “qual organização o usuário pertence”.
- Em especial: a tabela organization_members tem uma policy de SELECT que depende de get_user_organization_id(auth.uid()).
- Como get_user_organization_id está quebrada, as queries que dependem de organization_members (inclusive as subqueries das policies do Kanban) não encontram a “membership” correta e acabam bloqueadas/retornando vazio → o app interpreta como “não achei board” e tenta criar ou falha com “Erro ao carregar quadro”.

Isso acontece só com multi-organização (caso Marcos) ou com todos?
- Afeta especialmente quem tem múltiplas organizações, porque o app precisa “fixar” a organização ativa e isso está falhando.
- Mas também pode afetar usuários de uma única organização em cenários onde alguma policy/função chamada no fluxo dependa dessas funções. Ou seja: não é um bug “só do Marcos”; ele apenas expõe o problema com mais frequência.

Como vai funcionar depois de resolvido (resultado esperado)
1) Quando o Marcos selecionar uma organização no modal (ou trocar no switcher):
   - O app chamará set_user_active_organization com sucesso (retorno true).
   - O backend gravará public.user_active_org(user_id, active_organization_id).
2) As funções get_user_organization_id e get_user_organization_role passarão a:
   - Usar a organização ativa gravada (user_active_org) e validar membership via is_active = true.
   - Fazer fallback para a primeira org ativa se necessário.
3) Com isso, as policies RLS vão “entender” corretamente qual org está ativa, e:
   - O Kanban board da organização do Mateus (onde o Marcos é member) será encontrado e carregado.
   - O Marcos poderá visualizar e operar conforme o cargo (ex: criar/editar tarefas, etc.), sem 403/400.
4) Se não existir board naquela organização:
   - O KanbanBoard já foi ajustado para não tentar criar board para membros; ele mostrará uma tela amigável pedindo para um admin criar o quadro.

Plano de correção (o que vou implementar no próximo passo, em modo de edição)
A) Correção no backend (migração)
1. Atualizar as funções quebradas para usar is_active = true (em vez de status = 'active'):
   - public.get_user_organization_id(_user_id uuid)
   - public.get_user_organization_role(_user_id uuid)
   - public.set_user_active_organization(_org_id uuid)
2. Garantir que:
   - A validação de “o usuário é membro desta org” use organization_members.is_active = true
   - A validação de fallback (primeira org) use organization_members.is_active = true
3. (Verificação) Rodar um “sanity check” via query/leitura:
   - Confirmar que set_user_active_organization retorna true para o Marcos ao selecionar a org e94d…
   - Confirmar que public.user_active_org passa a ter uma linha para o user_id dele

B) Ajustes no frontend (robustez e UX)
1. OrganizationContext:
   - Tratar retorno “data === false” de set_user_active_organization como falha real (não só “sem erro”).
   - Se o usuário tem múltiplas orgs e o sync falhar, evitar seguir adiante “silenciosamente”:
     - Mostrar toast orientando a tentar novamente
     - Manter o gate de seleção (para não entrar em estado inconsistente que quebra RLS e telas)
2. KanbanBoard:
   - Já existe tratamento para impedir criação automática por membros; manter e melhorar mensagem quando ocorrer “fetchError” por RLS (após a correção do backend isso deve desaparecer, mas manter o guard melhora a confiabilidade).

C) Correção de conformidade (tipos gerados automaticamente)
- Verificar e reverter qualquer edição manual feita em src/integrations/supabase/types.ts (esse arquivo não deve ser alterado manualmente).
- Após a migração, garantir que o projeto use os tipos gerados corretamente (sem divergência que cause bugs em runtime/build).

Checklist de validação (antes de considerar “resolvido”)
1) Usuário Marcos (2 organizações)
- Login → modal de seleção aparece
- Seleciona “mateusabcck… Organization”:
  - Network: set_user_active_organization → 200 com true
  - user_active_org contém active_organization_id = e94d…
  - /tarefas carrega o board a285… e as colunas/cards
  - Sem toast “Erro ao carregar quadro”
- Troca para org “marcosviniicius… Organization”:
  - Sync novamente → 200 true
  - /tarefas carrega o outro board ef71…
2) Usuário member (uma org) com cargo can_view_kanban = true
- /tarefas carrega board normalmente
3) Usuário member sem can_view_kanban
- Continua vendo “Acesso Restrito” (comportamento esperado)

Risco/observação importante
- A tabela organization_members tem user_id nullable (isso é usado para convites pendentes). Então não vamos “forçar NOT NULL” agora para não quebrar convites. A validação de membership para permissões continuará usando user_id = auth.uid() e is_active = true, o que ignora convites pendentes corretamente.

Entregáveis (o que será alterado)
- Nova migração corrigindo as 3 funções para is_active
- Ajustes pontuais no OrganizationContext para não continuar quando o sync falhar em multi-org
- Auditoria/ajuste para remover edições manuais de types.ts (conformidade)
