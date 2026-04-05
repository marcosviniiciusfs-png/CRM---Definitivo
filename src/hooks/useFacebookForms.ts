import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

export interface LeadForm {
  id: string;
  name: string;
  status: string;
  leads_count: number;
}

// Type for Facebook integration data
interface FacebookIntegrationData {
  id: string;
  page_id?: string;
  webhook_verified?: boolean;
  [key: string]: unknown;
}

// Type for sales funnel query result
interface SalesFunnelResult {
  id: string;
}

// Type for funnel source mapping result
interface FunnelSourceMappingResult {
  source_identifier: string | null;
}

// Type for RPC member result from get_organization_members_masked
interface RpcMemberResult {
  user_id: string | null;
}

interface UseFacebookFormsReturn {
  leadForms: LeadForm[];
  loadingForms: boolean;
  showFormSelector: boolean;
  configuredFormIds: Set<string>;
  subscribing: boolean;
  fetchLeadForms: (integrationData?: FacebookIntegrationData | null) => Promise<void>;
  handleFormConfigured: (formId: string) => void;
  handleFormRemoved: (formId: string) => void;
  setShowFormSelector: (show: boolean) => void;
  subscribePageWebhook: (integrationData?: FacebookIntegrationData) => Promise<void>;
  resetConfiguredForms: () => void;
}

export const useFacebookForms = (
  organizationId?: string
): UseFacebookFormsReturn => {
  const [leadForms, setLeadForms] = useState<LeadForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);
  const [showFormSelector, setShowFormSelector] = useState(false);
  const [configuredFormIds, setConfiguredFormIds] = useState<Set<string>>(new Set());
  const [subscribing, setSubscribing] = useState(false);

  const fetchLeadForms = useCallback(async (integrationData?: FacebookIntegrationData | null) => {
    let activeIntegration = integrationData;

    if (!activeIntegration || !activeIntegration.page_id) {
      logger.log('[FB-FORMS] Dados incompletos no fetch.');
      return;
    }

    if (!activeIntegration.page_id) {
      toast.error('Pagina nao configurada. Por favor, reconecte ao Facebook.');
      return;
    }

    setLoadingForms(true);
    try {
      if (!organizationId) {
        toast.error('Organizacao nao identificada');
        return;
      }

      logger.log('Fetching forms for integration:', activeIntegration.id, 'page:', activeIntegration.page_id);

      const { data, error } = await supabase.functions.invoke('facebook-list-lead-forms', {
        body: {
          organization_id: organizationId,
          integration_id: activeIntegration.id,
        },
      });

      if (error) throw error;

      if (data.error) {
        throw new Error(data.error);
      }

      const forms: LeadForm[] = data.forms || [];
      setLeadForms(forms);
      setShowFormSelector(true);

      // Garantir que o webhook de pagina esta subscrito (uma vez apenas)
      if (activeIntegration && !activeIntegration.webhook_verified) {
        subscribePageWebhook(activeIntegration);
      }

      // Carregar quais formularios ja tem mapeamento de funil configurado
      if (forms.length > 0 && organizationId) {
        const formIds = forms.map((f: LeadForm) => f.id);
        const { data: orgFunnels } = await supabase
          .from('sales_funnels')
          .select('id')
          .eq('organization_id', organizationId);
        const funnelIds = (orgFunnels || []).map((f: { id: string }) => f.id);
        if (funnelIds.length > 0) {
          const { data: mappings } = await supabase
            .from('funnel_source_mappings')
            .select('source_identifier')
            .eq('source_type', 'facebook')
            .not('source_identifier', 'is', null)
            .in('source_identifier', formIds)
            .in('funnel_id', funnelIds);
          const configured = new Set((mappings || []).map((m: { source_identifier: string | null }) => m.source_identifier as string));
          setConfiguredFormIds(configured);
        }
      }
    } catch (error) {
      logger.error('Error fetching lead forms:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao buscar formularios de lead');
    } finally {
      setLoadingForms(false);
    }
  }, [organizationId]);

  const subscribePageWebhook = useCallback(async (integrationData?: FacebookIntegrationData) => {
    if (!integrationData || !organizationId) {
      logger.warn('[FB-FORMS] subscribePageWebhook: sem integracao disponivel, abortando');
      return;
    }
    setSubscribing(true);
    try {
      logger.log('[FB-FORMS] Ativando webhook da pagina para integracao:', integrationData.id);
      const { data, error } = await supabase.functions.invoke('facebook-subscribe-webhook', {
        body: {
          integration_id: integrationData.id,
          organization_id: organizationId,
        },
      });
      if (error) throw new Error('O servidor demorou a responder. Verifique sua conexao e tente novamente.');
      if (data?.error) throw new Error(data.error);
      logger.log('[FB-FORMS] Webhook da pagina ativado com sucesso');
    } catch (error) {
      logger.error('Error subscribing page webhook:', error);
      toast.error('Erro ao ativar webhook da pagina');
    } finally {
      setSubscribing(false);
    }
  }, [organizationId]);

  const handleFormConfigured = useCallback((formId: string) => {
    setConfiguredFormIds(prev => new Set([...prev, formId]));
  }, []);

  const handleFormRemoved = useCallback((formId: string) => {
    setConfiguredFormIds(prev => {
      const next = new Set(prev);
      next.delete(formId);
      return next;
    });
  }, []);

  const resetConfiguredForms = useCallback(() => {
    setConfiguredFormIds(new Set());
  }, []);

  return {
    leadForms,
    loadingForms,
    showFormSelector,
    configuredFormIds,
    subscribing,
    fetchLeadForms,
    handleFormConfigured,
    handleFormRemoved,
    setShowFormSelector,
    subscribePageWebhook,
    resetConfiguredForms,
  };
};
