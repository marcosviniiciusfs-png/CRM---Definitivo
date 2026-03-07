import React, {
    createContext, useContext, useEffect, useRef, useState, useCallback
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface LeadNotif {
    id: string;
    nome_lead: string;
    source: string;
    funnelName: string;
    tag?: string;
}

interface LeadNotificationContextType {
    notifications: LeadNotif[];
    dismiss: (id: string) => void;
}

const LeadNotificationContext = createContext<LeadNotificationContextType>({
    notifications: [],
    dismiss: () => { },
});

export function useLeadNotification() {
    return useContext(LeadNotificationContext);
}

export function LeadNotificationProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { organizationId } = useOrganization();
    const [notifications, setNotifications] = useState<LeadNotif[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenIds = useRef<Set<string>>(new Set());
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const dismiss = useCallback((id: string) => {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const addNotification = useCallback((notif: LeadNotif) => {
        if (seenIds.current.has(notif.id)) return;
        seenIds.current.add(notif.id);

        // Tocar som
        if (!audioRef.current) {
            audioRef.current = new Audio('/notification.mp3');
            audioRef.current.volume = 0.5;
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => { });

        setNotifications(prev => [...prev, notif]);

        // Auto-dismiss após 7 segundos
        timers.current[notif.id] = setTimeout(() => {
            dismiss(notif.id);
        }, 7000);
    }, [dismiss]);

    useEffect(() => {
        if (!user || !organizationId) return;

        const channelName = `global-lead-notif-${organizationId}-${Date.now()}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'leads' },
                async (payload) => {
                    const lead = payload.new as any;
                    if (!lead?.id) return;

                    // Buscar nome do funil
                    let funnelName = 'Funil Padrão';
                    if (lead.funnel_id) {
                        const { data: funnelData } = await supabase
                            .from('sales_funnels')
                            .select('name')
                            .eq('id', lead.funnel_id)
                            .maybeSingle();
                        if (funnelData?.name) funnelName = funnelData.name;
                    }

                    // Buscar primeira tag do lead (se existir)
                    let tag: string | undefined;
                    if (lead.source === 'Webhook' || lead.source === 'webhook') {
                        const { data: tagData } = await supabase
                            .from('lead_tag_assignments')
                            .select('lead_tags(name)')
                            .eq('lead_id', lead.id)
                            .limit(1)
                            .maybeSingle();
                        const tagName = (tagData as any)?.lead_tags?.name;
                        if (tagName) tag = tagName;
                    }

                    addNotification({
                        id: lead.id,
                        nome_lead: lead.nome_lead || 'Lead sem nome',
                        source: (lead.source || 'webhook').toLowerCase(),
                        funnelName,
                        tag,
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, organizationId, addNotification]);

    return (
        <LeadNotificationContext.Provider value={{ notifications, dismiss }}>
            {children}
        </LeadNotificationContext.Provider>
    );
}
