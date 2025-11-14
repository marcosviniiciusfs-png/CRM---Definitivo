import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

interface WhatsAppInstance {
  id: string;
  instance_name: string;
  status: string;
  phone_number: string | null;
  qr_code: any;
  connected_at: string | null;
  created_at: string;
}

interface WhatsAppContextType {
  instances: WhatsAppInstance[];
  loading: boolean;
  isConnected: boolean;
  refreshInstances: () => Promise<void>;
  checkAndUpdateStatus: () => Promise<void>;
}

const WhatsAppContext = createContext<WhatsAppContextType | undefined>(undefined);

export function WhatsAppProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);

  // Carregar instâncias do banco de dados
  const loadInstances = useCallback(async () => {
    if (!user) {
      setInstances([]);
      setIsConnected(false);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const instancesList = data || [];
      setInstances(instancesList);
      
      // Verificar se há alguma instância conectada
      const hasConnected = instancesList.some(
        (inst) => inst.status === 'CONNECTED' || inst.status === 'OPEN'
      );
      setIsConnected(hasConnected);

      console.log('📦 Instâncias carregadas do banco:', instancesList.length, '| Conectadas:', hasConnected);
    } catch (error) {
      console.error('Erro ao carregar instâncias:', error);
      setInstances([]);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Verificar e atualizar status com a Evolution API
  const checkAndUpdateStatus = useCallback(async () => {
    if (!user || instances.length === 0) return;

    console.log('🔍 Verificando status com Evolution API...');

    try {
      const statusChecks = instances.map(async (instance) => {
        try {
          const { data, error } = await supabase.functions.invoke('check-whatsapp-status', {
            body: { instance_name: instance.instance_name },
          });

          if (error) {
            console.warn(`⚠️ Erro ao verificar ${instance.instance_name}:`, error);
            return null;
          }

          console.log(`✅ Status de ${instance.instance_name}:`, data?.status);
          return data;
        } catch (err) {
          console.error(`❌ Erro ao verificar ${instance.instance_name}:`, err);
          return null;
        }
      });

      await Promise.all(statusChecks);
      
      // Recarregar instâncias após verificação
      await loadInstances();
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  }, [user, instances, loadInstances]);

  // Refresh forçado das instâncias
  const refreshInstances = useCallback(async () => {
    setLoading(true);
    await loadInstances();
  }, [loadInstances]);

  // Carregar instâncias na montagem e quando o user mudar
  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  // Verificar status após carregar instâncias
  useEffect(() => {
    if (!loading && instances.length > 0) {
      // Verificar status com a Evolution API após 1 segundo
      const timer = setTimeout(() => {
        checkAndUpdateStatus();
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [loading, instances.length]);

  // Configurar realtime para atualizar quando houver mudanças
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('whatsapp_instances_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('🔔 Mudança detectada nas instâncias:', payload);
          loadInstances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadInstances]);

  return (
    <WhatsAppContext.Provider
      value={{
        instances,
        loading,
        isConnected,
        refreshInstances,
        checkAndUpdateStatus,
      }}
    >
      {children}
    </WhatsAppContext.Provider>
  );
}

export function useWhatsApp() {
  const context = useContext(WhatsAppContext);
  if (context === undefined) {
    throw new Error("useWhatsApp must be used within a WhatsAppProvider");
  }
  return context;
}
