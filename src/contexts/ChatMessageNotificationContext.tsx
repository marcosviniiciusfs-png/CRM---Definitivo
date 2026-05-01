import React, {
    createContext, useContext, useEffect, useRef, useState, useCallback
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAssignedChannels } from '@/hooks/useAssignedChannels';

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
    // Atribuicao de canais: owner/admin (hasFullAccess=true) recebe todas as
    // notificacoes; member recebe apenas dos canais aos quais foi atribuido,
    // ou de leads sem canal (nao-WhatsApp).
    const { assignedChannelIds, hasFullAccess } = useAssignedChannels();
    const assignedChannelIdsRef = useRef<Set<string> | null>(assignedChannelIds);
    const hasFullAccessRef = useRef<boolean>(hasFullAccess);
    useEffect(() => { assignedChannelIdsRef.current = assignedChannelIds; }, [assignedChannelIds]);
    useEffect(() => { hasFullAccessRef.current = hasFullAccess; }, [hasFullAccess]);
    const [notifications, setNotifications] = useState<ChatMessageNotif[]>([]);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUnlockedRef = useRef<boolean>(false);
    const seenIds = useRef<Set<string>>(new Set());
    const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    // Cache: lead_id -> { name, avatar_url } to avoid repeated DB calls
    const leadCacheRef = useRef<Map<string, { name: string; avatar_url?: string | null }>>(new Map());
    // Last seen message timestamp for polling fallback
    const lastSeenTsRef = useRef<string | null>(null);
    const orgRef = useRef<string | null>(null);

    const dismiss = useCallback((id: string) => {
        clearTimeout(timers.current[id]);
        delete timers.current[id];
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Garante que o elemento Audio existe (criado uma unica vez).
    const ensureAudio = useCallback(() => {
        if (!audioRef.current) {
            audioRef.current = new Audio('/notification.mp3');
            audioRef.current.volume = 0.5;
            audioRef.current.preload = 'auto';
        }
        return audioRef.current;
    }, []);

    // Destrava o audio na primeira interacao do usuario para evitar que browsers
    // bloqueiem o primeiro .play() (autoplay policy).
    useEffect(() => {
        const unlock = () => {
            if (audioUnlockedRef.current) return;
            const audio = ensureAudio();
            const originalVolume = audio.volume;
            audio.volume = 0;
            audio.play().then(() => {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = originalVolume;
                audioUnlockedRef.current = true;
            }).catch(() => {});
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [ensureAudio]);

    const addNotification = useCallback((notif: ChatMessageNotif) => {
        if (seenIds.current.has(notif.id)) return;
        seenIds.current.add(notif.id);

        const audio = ensureAudio();
        audio.currentTime = 0;
        audio.play().catch((err) => console.warn('🔇 chat notif audio.play() rejeitado:', err));

        setNotifications(prev => [...prev, notif]);

        timers.current[notif.id] = setTimeout(() => {
            dismiss(notif.id);
        }, 7000);
    }, [dismiss, ensureAudio]);

    // Resolve lead info (cache + DB fallback). Centralizado para reuso entre
    // o handler do Realtime e o polling.
    // Aplica tambem o filtro de atribuicao: members so veem leads cujo canal
    // esta na lista de atribuicoes (ou que nao tem canal nenhum).
    const resolveLeadInfo = useCallback(async (leadId: string, currentOrgId: string) => {
        let info = leadCacheRef.current.get(leadId);
        let leadInstanceId: string | null | undefined;

        if (info) {
            leadInstanceId = (info as any).whatsapp_instance_id;
        } else {
            const { data: lead } = await supabase
                .from('leads')
                .select('id, nome_lead, avatar_url, organization_id, whatsapp_instance_id')
                .eq('id', leadId)
                .maybeSingle();
            if (!lead) return null;
            if ((lead as any).organization_id !== currentOrgId) return null;
            leadInstanceId = (lead as any).whatsapp_instance_id;
            info = {
                name: (lead as any).nome_lead || 'Lead sem nome',
                avatar_url: (lead as any).avatar_url ?? null,
            };
            // Guardamos whatsapp_instance_id no cache pra evitar refetch.
            (info as any).whatsapp_instance_id = leadInstanceId ?? null;
            leadCacheRef.current.set(leadId, info);
        }

        // Filtro de atribuicao: aplica APOS resolver o lead (cache funciona
        // mesmo quando atribuicoes mudam — proxima check usa Set atualizado).
        if (!hasFullAccessRef.current) {
            // Lead sem canal sempre visivel para members tambem.
            if (leadInstanceId) {
                const ids = assignedChannelIdsRef.current;
                if (!ids || !ids.has(leadInstanceId)) {
                    return null;
                }
            }
        }
        return info;
    }, []);

    useEffect(() => {
        if (!user || !organizationId) return;
        orgRef.current = organizationId;

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

                    const leadInfo = await resolveLeadInfo(msg.id_lead, organizationId);
                    if (!leadInfo) return;

                    addNotification({
                        id: msg.id,
                        lead_id: msg.id_lead,
                        lead_name: leadInfo.name,
                        avatar_url: leadInfo.avatar_url,
                        message_preview: getMessagePreview(msg),
                        media_type: msg.media_type ?? null,
                    });

                    if (msg.data_hora) lastSeenTsRef.current = msg.data_hora;
                }
            )
            .subscribe();

        // Polling fallback: o Realtime tem se mostrado nao-confiavel neste
        // ambiente (RLS + JWT, throttle de WS em background). A cada 5s
        // buscamos mensagens ENTRADA da org com data_hora > ultima vista
        // e disparamos notificacao para as novas. Deduplicacao por seenIds
        // evita disparar duas vezes quando Realtime e polling pegam o mesmo
        // INSERT.
        const pollMessages = async () => {
            if (!orgRef.current) return;
            try {
                let q = supabase
                    .from('mensagens_chat')
                    .select('id, id_lead, corpo_mensagem, media_type, direcao, data_hora, leads!inner(organization_id)')
                    .eq('direcao', 'ENTRADA')
                    .eq('leads.organization_id', orgRef.current)
                    .order('data_hora', { ascending: true })
                    .limit(20);
                if (lastSeenTsRef.current) {
                    q = q.gt('data_hora', lastSeenTsRef.current);
                } else {
                    // No primeiro tick, so olhar o ultimo minuto pra evitar
                    // disparar notificacao para historico antigo.
                    const since = new Date(Date.now() - 60 * 1000).toISOString();
                    q = q.gt('data_hora', since);
                }
                const { data, error } = await q;
                if (error || !data) return;
                for (const msg of data as any[]) {
                    if (!msg?.id || seenIds.current.has(msg.id)) continue;
                    const leadInfo = await resolveLeadInfo(msg.id_lead, orgRef.current);
                    if (!leadInfo) continue;
                    addNotification({
                        id: msg.id,
                        lead_id: msg.id_lead,
                        lead_name: leadInfo.name,
                        avatar_url: leadInfo.avatar_url,
                        message_preview: getMessagePreview(msg),
                        media_type: msg.media_type ?? null,
                    });
                    if (msg.data_hora && (!lastSeenTsRef.current || msg.data_hora > lastSeenTsRef.current)) {
                        lastSeenTsRef.current = msg.data_hora;
                    }
                }
            } catch {
                // silencioso — proxima iteracao tenta de novo
            }
        };

        // Inicializa lastSeenTs com NOW para nao disparar notificacoes
        // de historico ao montar o provider.
        if (!lastSeenTsRef.current) {
            lastSeenTsRef.current = new Date().toISOString();
        }
        const pollInterval = setInterval(pollMessages, 5000);

        return () => {
            supabase.removeChannel(channel);
            clearInterval(pollInterval);
        };
    }, [user, organizationId, addNotification, resolveLeadInfo]);

    return (
        <ChatMessageNotificationContext.Provider value={{ notifications, dismiss }}>
            {children}
        </ChatMessageNotificationContext.Provider>
    );
}
