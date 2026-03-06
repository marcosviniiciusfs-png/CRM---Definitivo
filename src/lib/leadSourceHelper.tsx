import React from "react";

// ─── Brand SVG Icons ────────────────────────────────────────────────────────

const FacebookIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
);

const WhatsAppIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
);

const GoogleIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const TikTokIcon = ({ className }: { className?: string }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.27 6.27 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.17 8.17 0 004.79 1.54V6.78a4.85 4.85 0 01-1.02-.09z" />
    </svg>
);

// ─── Type & helper ────────────────────────────────────────────────────────────

export type SourceInfo = {
    label: string;
    icon: "facebook" | "whatsapp" | "google" | "tiktok" | "user" | null;
    color: string; // text color class
    bg: string;    // bg color class for avatar ring
};

export function getSourceInfo(source: string | null | undefined, nomeUsuario: string): SourceInfo {
    switch (source) {
        case "Facebook Leads":
            return { label: "Facebook Leads", icon: "facebook", color: "text-blue-600", bg: "bg-blue-600/10" };
        case "WhatsApp":
            return { label: "WhatsApp", icon: "whatsapp", color: "text-green-500", bg: "bg-green-500/10" };
        case "Google ADS":
            return { label: "Google ADS", icon: "google", color: "text-foreground", bg: "bg-muted" };
        case "TikTok":
            return { label: "TikTok", icon: "tiktok", color: "text-foreground", bg: "bg-muted" };
        case "Outro":
            return { label: "Outro", icon: null, color: "text-muted-foreground", bg: "bg-muted" };
        default:
            // 'Cadastro Manual', null, undefined → mostrar nome do usuário
            return { label: nomeUsuario || "Usuário", icon: "user", color: "text-foreground", bg: "bg-primary/10" };
    }
}

// ─── Render component ─────────────────────────────────────────────────────────

interface CadastradoPorProps {
    source: string | null | undefined;
    nomeUsuario: string;
}

export const CadastradoPorBadge: React.FC<CadastradoPorProps> = ({ source, nomeUsuario }) => {
    const info = getSourceInfo(source, nomeUsuario);

    const renderIcon = () => {
        switch (info.icon) {
            case "facebook":
                return <FacebookIcon className={`h-3 w-3.5 ${info.color}`} />;
            case "whatsapp":
                return <WhatsAppIcon className={`h-3 w-3.5 ${info.color}`} />;
            case "google":
                return <GoogleIcon className="h-3.5 w-3.5" />;
            case "tiktok":
                return <TikTokIcon className={`h-3 w-3.5 ${info.color}`} />;
            case "user":
                return (
                    <span className={`text-xs font-bold text-primary`}>
                        {info.label.substring(0, 1).toUpperCase()}
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex items-center gap-2">
            {info.icon !== null && (
                <div className={`h-5 w-5 rounded-full ${info.bg} flex items-center justify-center flex-shrink-0`}>
                    {renderIcon()}
                </div>
            )}
            <span className={`font-medium ${info.color}`}>{info.label}</span>
        </div>
    );
};
