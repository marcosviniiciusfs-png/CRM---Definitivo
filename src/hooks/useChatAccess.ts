import { usePermissions } from "@/hooks/usePermissions";
import { useAssignedChannels } from "@/hooks/useAssignedChannels";

/**
 * Decide se o usuario logado pode acessar a sessao /chat.
 *
 * Regras (qualquer uma libera):
 *  1. Owner / admin / superadmin (hasFullAccess) — sempre.
 *  2. Member com cargo customizado que tem can_view_chat = true.
 *  3. Member atribuido a pelo menos 1 canal WhatsApp em
 *     whatsapp_channel_members. A atribuicao implica que o member
 *     trabalha com aquele canal — exigir tambem permissao de cargo
 *     seria redundante e bloquearia o caso de uso.
 *  4. Member SEM nenhuma atribuicao em uma org que nunca configurou WCM:
 *     liberamos por compatibilidade (legado pre-feature). Sem isso, todos
 *     os members nessas orgs perdem o /chat sem nenhuma sinalizacao.
 *
 * `loading` reflete se ainda esperamos as atribuicoes carregarem
 * (so importa para members; owner/admin retorna loading=false).
 */
export function useChatAccess(): { canAccessChat: boolean; loading: boolean } {
  const permissions = usePermissions();
  const { assignedChannelIds, hasFullAccess, loading } = useAssignedChannels();

  // 1) Owner / admin / superadmin
  if (hasFullAccess) return { canAccessChat: true, loading: false };

  // 2) Cargo customizado libera explicitamente
  if (permissions.canViewChat) return { canAccessChat: true, loading: false };

  // Enquanto as atribuicoes ainda carregam, esperamos antes de decidir
  // para nao oscilar entre denied/allowed.
  if (loading) return { canAccessChat: false, loading: true };

  // 3) Atribuido a 1+ canal -> libera chat (so vai ver leads desses canais)
  if (assignedChannelIds && assignedChannelIds.size > 0) {
    return { canAccessChat: true, loading: false };
  }

  // 4) Set vazio (member sem atribuicao em org que nao opt-ou para WCM):
  //    libera. Comportamento alinhado com isLeadVisibleByChannel — se a
  //    org nao usa o filtro de canais, members veem o chat normalmente.
  if (assignedChannelIds && assignedChannelIds.size === 0) {
    return { canAccessChat: true, loading: false };
  }

  return { canAccessChat: false, loading: false };
}
