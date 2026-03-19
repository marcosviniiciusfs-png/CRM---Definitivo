import React, {
    createContext, useContext, useEffect, useRef, useState, useCallback
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

export interface ChatMessageNotif {
    id: string;
    lead_id: string;
    lead_name: string;
    avatar_url?: string | null;
    message_preview: string;
    media_type?: string | null;
}

interface ChatMessageNotificationContextType {
    notifications: ChatMessageNotif[];
    dismiss: (id: string) => void;
}

const ChatMessageNotificationContext = createContext<ChatMessageNotificationContextType>({
    notifications: [],
    dismiss: () => {},
});

export function useChatMessageNotification() {
    return useContext(ChatMessageNotificationContext);
}

function getMessagePreview(msg: any): string {
    if (msg.media_type === 'audio') return '🎵 Áudio';
    if (msg.media_type === 'image') return '📷 Imagem';
    if (msg.media_type === 'video') return '🎥 Vídeo';
    if (msg.media_type === 'document') return '📎 Documento';
    const text = (msg.corpo_mensagem || '').trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
}

export function ChatMessageNotificationProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const { organizationId } = useOrganization();
    const [notifications, setNotifications] = useState<ChatMessageNotif[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const seenIds = useRef<Set<string>>(new Set());
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    // Cache: lead_id -> { name, avatar_url } to avoid repeated DB calls
    const leadCacheRef = useRef<Map<string, { name: string; avatar_url?: string | null }>>(new Map());

    const dismiss = useCallback((id: string) => {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const addNotification = useCallback((notif: ChatMessageNotif) => {
        if (seenIds.current.has(notif.id)) return;
        seenIds.current.add(notif.id);

        if (!audioRef.current) {
            audioRef.current = new Audio('/notification.mp3');
            audioRef.current.volume = 0.5;
        }
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});

        setNotifications(prev => [...prev, notif]);

        timers.current[notif.id] = setTimeout(() => {
            dismiss(notif.id);
        }, 7000);
    }, [dismiss]);

    useEffect(() => {
        if (!user || !organizationId) return;

        const channelName = `global-msg-notif-${organizationId}-${Date.now()}`;

        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'mensagens_chat' },
                async (payload) => {
                    const msg = payload.new as any;
                    if (!msg?.id || msg.direcao !== 'ENTRADA') return;
                    if (seenIds.current.has(msg.id)) return;

                    // Fetch lead info (from cache or DB)
                    let leadInfo = leadCacheRef.current.get(msg.id_lead);
                    if (!leadInfo) {
                        const { data: lead } = await supabase
                            .from('leads')
                            .select('id, nome_lead, avatar_url, organization_id')
                            .eq('id', msg.id_lead)
                            .maybeSingle();

                        if (!lead) return;
                        // Verify lead belongs to current organization
                        if ((lead as any).organization_id !== organizationId) return;

                        leadInfo = {
                            name: (lead as any).nome_lead || 'Lead sem nome',
                            avatar_url: (lead as any).avatar_url ?? null,
                        };
                        leadCacheRef.current.set(msg.id_lead, leadInfo);
                    }

                    addNotification({
                        id: msg.id,
                        lead_id: msg.id_lead,
                        lead_name: leadInfo.name,
                        avatar_url: leadInfo.avatar_url,
                        message_preview: getMessagePreview(msg),
                        media_type: msg.media_type ?? null,
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, organizationId, addNotification]);

    return (
        <ChatMessageNotificationContext.Provider value={{ notifications, dismiss }}>
            {children}
        </ChatMessageNotificationContext.Provider>
    );
}
