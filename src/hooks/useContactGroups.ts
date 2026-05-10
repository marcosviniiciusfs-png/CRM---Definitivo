import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContactGroup {
  id: string;
  subject: string;
  size: number;
  pictureUrl: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  // Preview da ultima msg (para a lista, estilo WhatsApp Web).
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageDirection: "ENTRADA" | "SAIDA" | null;
  lastMessageSender: string | null;
}

interface UseContactGroupsParams {
  instanceName: string | null | undefined;
  // Quando informado, filtra grupos onde esse contato participa.
  // Quando ausente/null, retorna TODOS os grupos do canal.
  phoneNumber?: string | null | undefined;
}

interface UseContactGroupsResult {
  groups: ContactGroup[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Busca os grupos do WhatsApp em que o contato (phoneNumber) participa
 * para uma instancia (canal) especifica. Vai pela edge function
 * `get-contact-groups` para que a Evolution API key NUNCA chegue ao frontend.
 *
 * Cache de 5 min — grupos do WhatsApp nao mudam com frequencia, evita
 * rate-limit na Evolution API.
 */
export function useContactGroups({
  instanceName,
  phoneNumber,
}: UseContactGroupsParams): UseContactGroupsResult {
  const enabled = !!instanceName;

  const query = useQuery({
    queryKey: ["contact-groups", instanceName, phoneNumber ?? "_all_"],
    queryFn: async (): Promise<ContactGroup[]> => {
      if (!instanceName) return [];
      const body: { instance_name: string; phone_number?: string } = { instance_name: instanceName };
      if (phoneNumber) body.phone_number = phoneNumber;
      const { data, error } = await supabase.functions.invoke("get-contact-groups", { body });
      if (error) throw new Error(error.message || "Falha ao buscar grupos");
      if (!data?.success) throw new Error(data?.error || "Resposta inesperada da edge function");
      return (data.groups || []) as ContactGroup[];
    },
    enabled,
    // Reduzido de 5min para 30s: agora o endpoint embute lastMessageAt/preview,
    // que precisam refletir conversas em andamento. Refetch automatico a cada 20s
    // mantem a lista parecida com o que o WhatsApp Web mostra.
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 20 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    groups: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: (query.error as Error) ?? null,
    refetch: () => { void query.refetch(); },
  };
}
