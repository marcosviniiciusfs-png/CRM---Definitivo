import React from 'react';
import { useChatMessageNotification, ChatMessageNotif } from '@/contexts/ChatMessageNotificationContext';

function getInitials(name: string): string {
    return name
        .split(' ')
        .slice(0, 2)
        .map(w => w[0] || '')
        .join('')
        .toUpperCase();
}

function MessageCard({ notif, onClose }: { notif: ChatMessageNotif; onClose: () => void }) {
    return (
        <div style={{ position: 'relative', width: 280 }}>
            <style>{`
        @keyframes msgBorderSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes msgCardEntry {
            0%   { opacity: 0;  transform: translateX(120%); }
            65%  { opacity: 1;  transform: translateX(-6px); }
            100% { opacity: 1;  transform: translateX(0); }
        }
        .msg-notif-close {
          all: unset; cursor: pointer;
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3); font-size: 11px;
          transition: background 0.2s, color 0.2s;
        }
        .msg-notif-close:hover {
          background: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.7);
        }
      `}</style>

            {/* Spinning gradient border */}
            <div style={{
                position: 'absolute', inset: -2, borderRadius: 10,
                overflow: 'hidden', zIndex: 0,
            }}>
                <div style={{
                    position: 'absolute', inset: '-100%',
                    background: 'conic-gradient(from 0deg, transparent 0deg, #128C7E 60deg, #25D366 120deg, #60d890 160deg, transparent 200deg, transparent 360deg)',
                    animation: 'msgBorderSpin 2.4s linear infinite',
                    transformOrigin: 'center',
                }} />
            </div>

            {/* Card body */}
            <div style={{
                position: 'relative', zIndex: 1, borderRadius: 8,
                background: '#0f0f11', padding: '12px 14px 14px',
                animation: 'msgCardEntry 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
                fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {/* Avatar */}
                        <div style={{
                            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                            overflow: 'hidden', border: '2px solid rgba(37,211,102,0.3)',
                            background: 'linear-gradient(135deg, #0d2e1a, #0a2318)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            {notif.avatar_url ? (
                                <img
                                    src={notif.avatar_url}
                                    alt={notif.lead_name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                />
                            ) : (
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#25D366' }}>
                                    {getInitials(notif.lead_name)}
                                </span>
                            )}
                        </div>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#25D366', marginBottom: 2 }}>
                                Nova Mensagem
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#f2f2f2', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                                {notif.lead_name}
                            </div>
                        </div>
                    </div>
                    <button className="msg-notif-close" onClick={onClose}>✕</button>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }} />

                {/* Message preview */}
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 7,
                    padding: '7px 9px', borderRadius: 6,
                    background: 'rgba(37,211,102,0.05)',
                    border: '1px solid rgba(37,211,102,0.12)',
                }}>
                    {/* WhatsApp icon */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366" style={{ flexShrink: 0, marginTop: 2 }}>
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                    </svg>
                    <span style={{
                        fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5,
                        overflow: 'hidden', display: '-webkit-box' as any,
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                    }}>
                        {notif.message_preview || '…'}
                    </span>
                </div>
            </div>
        </div>
    );
}

export function ChatMessageNotificationDisplay() {
    const { notifications, dismiss } = useChatMessageNotification();

    if (notifications.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', top: 20, right: 20,
            display: 'flex', flexDirection: 'column', gap: 12,
            zIndex: 99998, pointerEvents: 'none',
        }}>
            {notifications.map(n => (
                <div key={n.id} style={{ pointerEvents: 'all' }}>
                    <MessageCard notif={n} onClose={() => dismiss(n.id)} />
                </div>
            ))}
        </div>
    );
}
