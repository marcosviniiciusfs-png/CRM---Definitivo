import React from 'react';
import { useLeadNotification, LeadNotif } from '@/contexts/LeadNotificationContext';

const SOURCES: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    facebook: {
        label: 'Facebook',
        color: '#1877F2',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
        ),
    },
    whatsapp: {
        label: 'WhatsApp',
        color: '#25D366',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
        ),
    },
    webhook: {
        label: 'Webhook',
        color: '#e97555',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#e97555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 16.98h-5.99c-1.1 0-1.95.68-2.23 1.61L8 22" />
                <path d="m15 11-3.5 6H6.5" />
                <path d="M9 11.5A4.5 4.5 0 1 1 18 11.5" />
                <circle cx="9" cy="7" r="4" />
            </svg>
        ),
    },
    manual: {
        label: 'Manual',
        color: '#aaaaaa',
        icon: (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                stroke="#aaaaaa" strokeWidth="2.2" strokeLinecap="round"
                strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
        ),
    },
};

function getSource(raw: string) {
    const key = raw.toLowerCase();
    return SOURCES[key] || SOURCES['webhook'];
}

function LeadCard({ notif, onClose }: { notif: LeadNotif; onClose: () => void }) {
    const src = getSource(notif.source);

    return (
        <div style={{ position: 'relative', width: 264 }}>
            <style>{`
        @keyframes leadBorderSpin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes leadCardEntry {
            0%   { opacity: 0; transform: translateX(100%); }
            60%  { opacity: 1; transform: translateX(-4px); }
            100% { opacity: 1; transform: translateX(0); }
        }
        .lead-notif-close {
          all: unset; cursor: pointer;
          width: 22px; height: 22px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.3); font-size: 11px;
          transition: background 0.2s, color 0.2s;
        }
        .lead-notif-close:hover {
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
                    background: 'conic-gradient(from 0deg, transparent 0deg, #921009 60deg, #e97555 120deg, #ff9966 160deg, transparent 200deg, transparent 360deg)',
                    animation: 'leadBorderSpin 2.4s linear infinite',
                    transformOrigin: 'center',
                }} />
            </div>

            {/* Card body */}
            <div style={{
                position: 'relative', zIndex: 1, borderRadius: 8,
                background: '#0f0f11', padding: '12px 14px 14px',
                animation: 'leadCardEntry 0.45s cubic-bezier(0.22,1,0.36,1) forwards',
                fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif",
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                            width: 30, height: 30, borderRadius: 7,
                            background: 'linear-gradient(135deg, #1a0a0a, #2a0e0e)',
                            border: '1px solid rgba(146,16,9,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e97555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <line x1="19" y1="8" x2="19" y2="14" />
                                <line x1="22" y1="11" x2="16" y2="11" />
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e97555', marginBottom: 2 }}>
                                Novo Lead
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: '#f2f2f2', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
                                {notif.nome_lead}
                            </div>
                        </div>
                    </div>
                    <button className="lead-notif-close" onClick={onClose}>✕</button>
                </div>

                <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }} />

                {/* Funil */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>
                        {notif.funnelName}
                    </span>
                </div>

                {/* Source + tag */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px 4px 7px', borderRadius: 6,
                        background: `${src.color}15`,
                        border: `1px solid ${src.color}30`,
                    }}>
                        {src.icon}
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: src.color }}>{src.label}</span>
                    </div>

                    {notif.tag && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                        }}>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>#</span>
                            <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)' }}>{notif.tag}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function LeadNotificationDisplay() {
    const { notifications, dismiss } = useLeadNotification();

    if (notifications.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', top: 20, right: 20,
            display: 'flex', flexDirection: 'column', gap: 12,
            zIndex: 99999, pointerEvents: 'none',
        }}>
            {notifications.map(n => (
                <div key={n.id} style={{ pointerEvents: 'all' }}>
                    <LeadCard notif={n} onClose={() => dismiss(n.id)} />
                </div>
            ))}
        </div>
    );
}
