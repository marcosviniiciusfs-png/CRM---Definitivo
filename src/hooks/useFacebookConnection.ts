import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

interface UseFacebookConnectionReturn {
  isConnected: boolean;
  activeIntegration: any;
  needsReconnect: boolean;
  checkingTokens: boolean;
  checkConnection: () => Promise<any>;
  handleDisconnect: () => Promise<void>;
}

export const useFacebookConnection = (
  organizationId?: string
): UseFacebookConnectionReturn => {
  const [isConnected, setIsConnected] = useState(false);
  const [activeIntegration, setActiveIntegration] = useState<any>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [checkingTokens, setCheckingTokens] = useState(false);

  const checkConnection = useCallback(async () => {
    try {
      setCheckingTokens(true);

      if (!organizationId) return null;

      // Usar a RPC get_facebook_integrations_masked que:
      // 1. Ja computa needs_reconnect server-side (acessa token table com service_role)
      // 2. Filtra pela org do usuario autenticado (RLS segura)
      // 3. Evita leitura direta de facebook_integration_tokens (pode ter RLS restrita)
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_facebook_integrations_masked');

      if (rpcError) {
        logger.warn('[FB-CONN] RPC get_facebook_integrations_masked falhou, tentando query direta:', rpcError.message);
        // Fallback: query direta na tabela principal (sem verificacao de token)
        const { data: directData } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (directData?.page_id) {
          setIsConnected(true);
          setActiveIntegration(directData);
          // Sem acesso ao campo needs_reconnect, assumir que token esta OK
          setNeedsReconnect(false);
          return directData;
        }
        return null;
      }

      // Filtrar pela org correta na resposta da RPC
      const integrationRow = (rpcData || []).find(
        (r: any) => r.organization_id === organizationId
      ) || rpcData?.[0];

      if (integrationRow?.page_id) {
        setIsConnected(true);
        // Buscar detalhes completos (a RPC retorna campos mascarados)
        const { data: fullData } = await supabase
          .from('facebook_integrations')
          .select('*')
          .eq('organization_id', organizationId)
          .maybeSingle();

        const intData = fullData || integrationRow;
        setActiveIntegration(intData);
        // needs_reconnect vem do servidor - fonte mais confiavel
        setNeedsReconnect(!!integrationRow.needs_reconnect);
        return intData;
      } else if (integrationRow) {
        setIsConnected(false);
        setActiveIntegration(integrationRow);
        return integrationRow;
      }

      return null;
    } catch (error) {
      logger.error('Error in checkConnection:', error);
      return null;
    } finally {
      setCheckingTokens(false);
    }
  }, [organizationId]);

  const handleDisconnect = useCallback(async () => {
    if (!activeIntegration) return;

    try {
      const { error } = await supabase
        .from('facebook_integrations')
        .delete()
        .eq('id', activeIntegration.id);

      if (error) throw error;

      setIsConnected(false);
      setActiveIntegration(null);
      setNeedsReconnect(false);
      toast.success('Facebook desconectado com sucesso');
    } catch (error) {
      logger.error('Error disconnecting Facebook:', error);
      toast.error('Erro ao desconectar Facebook');
    }
  }, [activeIntegration]);

  return {
    isConnected,
    activeIntegration,
    needsReconnect,
    checkingTokens,
    checkConnection,
    handleDisconnect,
  };
};
