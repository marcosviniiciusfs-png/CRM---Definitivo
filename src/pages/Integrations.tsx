import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { useOrganization } from "@/contexts/OrganizationContext";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { WebhookIntegrationsTab } from "@/components/WebhookIntegrationsTab";
import { IntegratedLogsViewer } from "@/components/IntegratedLogsViewer";
import { MetaPixelConnection } from "@/components/MetaPixelConnection";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { GoogleCalendarModal } from "@/components/GoogleCalendarModal";

/* ── Design tokens ── */
const BG   = "linear-gradient(135deg,#921009 0%,#c0392b 50%,#e97555 100%)";
const GLOW = "rgba(192,57,43,0.35)";

/* ── Coming-soon integration definitions ── */
const COMING_SOON = [
  // Google Calendar foi promovido para card funcional — removido do coming soon
  // Meta Conversions foi promovido para card funcional — removido do coming soon
  {
    id: "gmail", name: "Gmail", cat: "Email",
    desc: "Envie e-mails com templates personalizados diretamente do CRM.",
    color: "#EA4335", bg: "rgba(234,67,53,.05)", br: "rgba(234,67,53,.13)",
    ic: (
      <svg viewBox="0 0 24 24" fill="#EA4335" width="22" height="22">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/>
      </svg>
    ),
  },
  {
    id: "slack", name: "Slack", cat: "Comunicação",
    desc: "Notificações em tempo real de novos leads no seu workspace.",
    color: "#E01E5A", bg: "rgba(224,30,90,.05)", br: "rgba(224,30,90,.15)",
    ic: (
      <svg viewBox="0 0 24 24" fill="#E01E5A" width="22" height="22">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z"/>
      </svg>
    ),
  },
  {
    id: "mpago", name: "Mercado Pago", cat: "Pagamentos",
    desc: "Processe pagamentos e acompanhe transações dos clientes no CRM.",
    color: "#009EE3", bg: "rgba(0,158,227,.06)", br: "rgba(0,158,227,.16)",
    ic: (
      <svg viewBox="0 0 24 24" fill="#009EE3" width="22" height="22">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 6.628 5.374 12 12 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12zm1.09 7.635l-3.272 3.273-1.09-1.09-1.546 1.545 2.636 2.637 4.817-4.818-1.545-1.547z"/>
      </svg>
    ),
  },
  {
    id: "notion", name: "Notion", cat: "Produtividade",
    desc: "Sincronize contatos e crie documentações automáticas no Notion.",
    color: "#AAA", bg: "rgba(255,255,255,.03)", br: "rgba(255,255,255,.1)",
    ic: (
      <svg viewBox="0 0 24 24" fill="#AAA" width="22" height="22">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933z"/>
      </svg>
    ),
  },
];

const WHATSAPP_IC = (
  <svg viewBox="0 0 24 24" fill="#25D366" width="22" height="22">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
  </svg>
);

const FACEBOOK_IC = (
  <svg viewBox="0 0 24 24" fill="#1877F2" width="22" height="22">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
);

const GCAL_IC = (
  <svg viewBox="0 0 32 32" width="22" height="22">
    <rect width="32" height="32" rx="2" fill="#4285F4"/>
    <rect x="4" y="8" width="24" height="20" rx="1" fill="white"/>
    <rect x="4" y="8" width="24" height="7" fill="#4285F4"/>
    <rect x="9" y="4" width="3" height="7" rx="1" fill="white"/>
    <rect x="20" y="4" width="3" height="7" rx="1" fill="white"/>
    <text x="16" y="24" textAnchor="middle" fill="#4285F4" fontSize="9" fontWeight="bold">CAL</text>
  </svg>
);

/* ── Small connection card for "coming soon" integrations ── */
function ComingSoonCard({ g }: { g: typeof COMING_SOON[number] }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`min-h-[190px] rounded-[5px] border flex flex-col p-4 pb-3.5 opacity-55 transition-all ${
        hov ? "border-border bg-accent/50" : "border-border/60 bg-card"
      }`}
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-[5px] flex-shrink-0 bg-muted border border-border flex items-center justify-center grayscale-[.5] opacity-50">
            {g.ic}
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-card-foreground leading-tight mb-1">{g.name}</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-muted border border-border text-muted-foreground">{g.cat}</span>
          </div>
        </div>
      </div>
      <p className="text-[12.5px] text-muted-foreground leading-relaxed flex-1 line-clamp-2">{g.desc}</p>
      <div className="flex justify-end">
        <div className="text-[11.5px] font-medium bg-muted border border-border rounded-[5px] px-3 py-1.5 text-muted-foreground">🔒 Em breve</div>
      </div>
    </div>
  );
}

/* ── WhatsApp summary card — recebe dados já carregados pelo pai ── */
function WhatsAppCard({
  onManage,
  instanceCount,
  connectedCount,
  loading,
  canManage,
  funnelName,
}: {
  onManage: () => void;
  instanceCount: number;
  connectedCount: number;
  loading: boolean;
  canManage: boolean;
  funnelName?: string | null;
}) {
  const [hov, setHov] = useState(false);
  const isConnected = connectedCount > 0;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`min-h-[190px] rounded-[5px] border flex flex-col p-4 pb-3.5 transition-all ${
        isConnected
          ? "border-[#25D366]/22 bg-[#25D366]/6 shadow-[0_4px_24px_rgba(37,211,102,.08)]"
          : hov
            ? "border-border bg-accent/50 shadow-md"
            : "border-border bg-card"
      } ${hov ? "-translate-y-0.5" : ""}`}
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-[5px] flex-shrink-0 bg-[#25D366]/8 border border-[#25D366]/22 flex items-center justify-center">
            {WHATSAPP_IC}
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-card-foreground leading-tight mb-1">WhatsApp</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366]">Mensagens</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-[7px] h-[7px] rounded-full ${isConnected ? "bg-success shadow-[0_0_6px_rgba(46,204,113,.5)]" : "bg-muted-foreground/30"}`}/>
          <span className={`text-[11px] font-medium ${isConnected ? "text-success" : "text-muted-foreground"}`}>
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-[12.5px] text-muted-foreground leading-relaxed flex-1">Verificando conexão...</p>
      ) : isConnected ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="py-[5px] px-2.5 rounded-[5px] bg-muted/50 border border-border flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="#25D366" width="11" height="11">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
              </svg>
              <span className="text-[10.5px] text-muted-foreground flex-shrink-0">Instâncias:</span>
              <span className="text-[11px] font-semibold text-[#25D366]">
                {connectedCount} conectada{connectedCount !== 1 ? "s" : ""}
                {instanceCount > connectedCount && <span className="text-muted-foreground ml-1">({instanceCount - connectedCount} off)</span>}
              </span>
            </div>
            {funnelName && (
              <div className="py-[5px] px-2.5 rounded-[5px] bg-muted/50 border border-border flex items-center gap-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="#25D366" width="11" height="11" strokeWidth="2" strokeLinecap="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
                </svg>
                <span className="text-[10.5px] text-muted-foreground flex-shrink-0">Funil:</span>
                <span className="text-[11px] font-semibold text-[#25D366] overflow-hidden text-ellipsis whitespace-nowrap">
                  {funnelName}
                </span>
              </div>
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="border border-[#25D366]/30 rounded-[5px] text-[12px] font-semibold px-3.5 py-1.5 bg-[#25D366]/10 text-[#25D366] transition-all hover:bg-[#25D366]/20 disabled:opacity-45 disabled:cursor-not-allowed"
            >Gerenciar</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Receba e envie mensagens diretamente para seus leads com número Business.
          </p>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="rounded-[5px] text-[12px] font-bold px-[15px] py-[7px] text-white bg-gradient-to-br from-[#128C7E] to-[#25D366] shadow-[0_3px_12px_rgba(37,211,102,.3)] transition-all hover:shadow-lg disabled:opacity-45 disabled:cursor-not-allowed"
            >Conectar WhatsApp</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Facebook summary card — recebe dados já carregados pelo pai ── */
function FacebookCard({
  onManage,
  integration,
  configuredForms,
  loading,
  canManage,
}: {
  onManage: () => void;
  integration: any | null;
  configuredForms: number;
  loading: boolean;
  canManage: boolean;
}) {
  const [hov, setHov] = useState(false);
  const isConnected = !!integration?.page_id;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`min-h-[190px] rounded-[5px] border flex flex-col p-4 pb-3.5 transition-all ${
        isConnected
          ? "border-[#1877F2]/25 bg-[#1877F2]/6 shadow-[0_4px_24px_rgba(24,119,242,.1)]"
          : hov
            ? "border-border bg-accent/50 shadow-md"
            : "border-border bg-card"
      } ${hov ? "-translate-y-0.5" : ""}`}
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-[5px] flex-shrink-0 bg-[#1877F2]/8 border border-[#1877F2]/22 flex items-center justify-center">
            {FACEBOOK_IC}
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-card-foreground leading-tight mb-1">Facebook Leads</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#1877F2]/10 border border-[#1877F2]/22 text-[#1877F2]">Anúncios</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-[7px] h-[7px] rounded-full ${isConnected ? "bg-success shadow-[0_0_6px_rgba(46,204,113,.5)]" : "bg-muted-foreground/30"}`}/>
          <span className={`text-[11px] font-medium ${isConnected ? "text-success" : "text-muted-foreground"}`}>
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-[12.5px] text-muted-foreground flex-1">Verificando conexão...</p>
      ) : isConnected ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="flex flex-col gap-1.5">
            <div className="py-[5px] px-2.5 rounded-[5px] bg-muted/50 border border-border flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="#1877F2" width="11" height="11">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              <span className="text-[10.5px] text-muted-foreground flex-shrink-0">Página:</span>
              <span className="text-[11px] font-semibold text-[#1877F2] overflow-hidden text-ellipsis whitespace-nowrap">
                {integration?.page_name || "Página conectada"}
              </span>
            </div>
            <div className={`py-[5px] px-2.5 rounded-[5px] border flex items-center gap-2 ${configuredForms > 0 ? "bg-success/5 border-success/20" : "bg-muted/50 border-border"}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke={configuredForms > 0 ? "hsl(var(--success))" : "hsl(var(--muted-foreground))"}
                width="11" height="11" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="8" y1="8" x2="16" y2="8"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="8" y1="16" x2="13" y2="16"/>
              </svg>
              <span className="text-[10.5px] text-muted-foreground flex-shrink-0">Ativos no CRM:</span>
              <span className={`text-[11px] font-semibold ${configuredForms > 0 ? "text-success" : "text-muted-foreground"}`}>
                {configuredForms > 0
                  ? `${configuredForms} formulário${configuredForms !== 1 ? "s" : ""}`
                  : "Nenhum ativo"}
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="border border-[#1877F2]/30 rounded-[5px] text-[12px] font-semibold px-3.5 py-1.5 bg-[#1877F2]/10 text-[#1877F2] transition-all hover:bg-[#1877F2]/20 disabled:opacity-45 disabled:cursor-not-allowed"
            >Gerenciar Formulários</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Importe leads automaticamente das campanhas de anúncios do Facebook Ads.
          </p>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="rounded-[5px] text-[12px] font-bold px-[15px] py-[7px] text-white bg-gradient-to-br from-[#1877F2] to-[#1565C0] shadow-[0_3px_12px_rgba(24,119,242,.35)] transition-all hover:shadow-lg disabled:opacity-45 disabled:cursor-not-allowed"
            >Conectar ao Facebook</button>
          </div>
        </div>
      )}
    </div>
  );
}

const META_PIXEL_IC = (
  <svg viewBox="0 0 24 24" fill="#0082FB" width="22" height="22">
    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.016 8.009c-.36-.027-.72.027-1.053.162-.62.243-1.134.72-1.512 1.296-.351.54-.567 1.188-.675 1.863-.189 1.188-.027 2.43.486 3.483.243.513.567.972.972 1.323.162.135.351.27.54.351.378.162.81.189 1.188.054.27-.108.513-.297.675-.54.162-.243.27-.54.324-.837.135-.756.054-1.539-.243-2.241-.189-.432-.459-.837-.783-1.161l-.216-.189c.054-.27.108-.54.135-.81.054-.378.054-.783 0-1.161-.054-.459-.162-.918-.378-1.323.162-.027.324-.027.486-.054.756-.081 1.539.054 2.241.351.783.324 1.458.837 1.971 1.512.513.675.837 1.485.972 2.322.27 1.755-.27 3.564-1.458 4.887-1.188 1.323-2.862 2.079-4.617 2.133-1.728.054-3.456-.594-4.725-1.782-1.269-1.188-2.025-2.835-2.133-4.563-.108-1.728.432-3.456 1.512-4.779.216-.27.459-.513.729-.729C8.99 8.55 10.394 8.01 11.826 8.01c.378 0 .783.027 1.161.081-.243.378-.432.81-.54 1.269-.108.486-.135.972-.108 1.458-.189-.108-.378-.216-.594-.297-.432-.162-.918-.189-1.377-.081-.486.108-.945.378-1.296.756-.351.378-.594.864-.702 1.377-.243 1.107.054 2.268.756 3.132.324.405.729.756 1.188.999.459.243.972.378 1.485.378.486 0 .972-.108 1.404-.324.405-.216.756-.54 1.026-.918.27-.378.459-.81.54-1.269.189-.918.054-1.89-.378-2.727-.216-.405-.513-.783-.864-1.08.108-.351.243-.675.432-.972.216-.351.486-.675.81-.918.135.243.243.513.324.783.108.405.135.837.108 1.269z"/>
  </svg>
);

/* ── Meta Conversions API card ── */
function MetaConversionsCard({
  isActive,
  loading,
  onManage,
  canManage,
}: {
  isActive: boolean;
  loading: boolean;
  onManage: () => void;
  canManage: boolean;
}) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`min-h-[190px] rounded-[5px] border flex flex-col p-4 pb-3.5 transition-all ${
        isActive
          ? "border-[#0082FB]/25 bg-[#0082FB]/6 shadow-[0_4px_24px_rgba(0,130,251,.1)]"
          : hov
            ? "border-border bg-accent/50 shadow-md"
            : "border-border bg-card"
      } ${hov ? "-translate-y-0.5" : ""}`}
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-[5px] flex-shrink-0 bg-[#0082FB]/8 border border-[#0082FB]/22 flex items-center justify-center">
            {META_PIXEL_IC}
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-card-foreground leading-tight mb-1">Meta Conversions</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#0082FB]/10 border border-[#0082FB]/22 text-[#0082FB]">Pixel</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-[7px] h-[7px] rounded-full ${isActive ? "bg-success shadow-[0_0_6px_rgba(46,204,113,.5)]" : "bg-muted-foreground/30"}`}/>
          <span className={`text-[11px] font-medium ${isActive ? "text-success" : "text-muted-foreground"}`}>
            {isActive ? "Ativo" : "Inativo"}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-[12.5px] text-muted-foreground flex-1">Verificando configuração...</p>
      ) : isActive ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="py-2 px-2.5 rounded-[5px] bg-muted/50 border border-border text-[12px] text-[#0082FB]">
            Pixel configurado e rastreando conversões
          </div>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="border border-[#0082FB]/30 rounded-[5px] text-[12px] font-semibold px-3.5 py-1.5 bg-[#0082FB]/10 text-[#0082FB] transition-all hover:bg-[#0082FB]/20 disabled:opacity-45 disabled:cursor-not-allowed"
            >Gerenciar Pixel</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Envie eventos de conversão ao Meta e otimize suas campanhas de anúncios.
          </p>
          <div className="flex justify-end">
            <button
              onClick={canManage ? onManage : undefined}
              disabled={!canManage}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="rounded-[5px] text-[12px] font-bold px-[15px] py-[7px] text-white bg-gradient-to-br from-[#0082FB] to-[#0050A0] shadow-[0_3px_12px_rgba(0,130,251,.35)] transition-all hover:shadow-lg disabled:opacity-45 disabled:cursor-not-allowed"
            >Configurar Pixel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Google Calendar summary card ── */
function GoogleCalendarCard({
  isConnected,
  loading,
  onConnect,
  canManage,
}: {
  isConnected: boolean;
  loading: boolean;
  onConnect: () => void;
  canManage: boolean;
}) {
  const [hov, setHov] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const { toast } = useToast();

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-calendar-oauth-initiate", {
        body: { origin: window.location.origin },
      });
      if (error) {
        let errorMessage = "Não foi possível iniciar a conexão";
        try {
          const errorData = await error.context?.json?.();
          if (errorData?.error) errorMessage = errorData.error;
        } catch {}
        throw new Error(errorMessage);
      }
      if (data?.error) throw new Error(data.error);
      if (data?.authUrl) {
        window.location.href = data.authUrl;
        return;
      }
      throw new Error("URL de autorização não recebida");
    } catch (err: any) {
      console.error("Erro ao iniciar conexão:", err);
      const isSetupError = err.message?.includes("SETUP_REQUIRED");
      toast({
        title: isSetupError ? "Configuração necessária" : "Erro ao conectar",
        description: err.message || "Não foi possível iniciar a conexão com o Google Calendar",
        variant: "destructive",
        duration: isSetupError ? 10000 : 5000,
      });
      setConnecting(false);
    }
  };

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`min-h-[190px] rounded-[5px] border flex flex-col p-4 pb-3.5 transition-all ${
        isConnected
          ? "border-[#4285F4]/25 bg-[#4285F4]/6 shadow-[0_4px_24px_rgba(66,133,244,.1)]"
          : hov
            ? "border-border bg-accent/50 shadow-md"
            : "border-border bg-card"
      } ${hov ? "-translate-y-0.5" : ""}`}
    >
      <div className="flex justify-between items-start mb-2.5">
        <div className="flex gap-2.5 items-center">
          <div className="w-10 h-10 rounded-[5px] flex-shrink-0 bg-[#4285F4]/8 border border-[#4285F4]/22 flex items-center justify-center">
            {GCAL_IC}
          </div>
          <div>
            <div className="text-[13.5px] font-bold text-card-foreground leading-tight mb-1">Google Calendar</div>
            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-[#4285F4]/10 border border-[#4285F4]/22 text-[#4285F4]">Produtividade</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={`w-[7px] h-[7px] rounded-full ${isConnected ? "bg-success shadow-[0_0_6px_rgba(46,204,113,.5)]" : "bg-muted-foreground/30"}`}/>
          <span className={`text-[11px] font-medium ${isConnected ? "text-success" : "text-muted-foreground"}`}>
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-[12.5px] text-muted-foreground flex-1">Verificando conexão...</p>
      ) : isConnected ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="py-2 px-2.5 rounded-[5px] bg-muted/50 border border-border text-[12px] text-[#4285F4]">
            Calendário sincronizado com seu Google Calendar
          </div>
          <div className="flex justify-end">
            <button
              onClick={onConnect}
              className="border border-[#4285F4]/30 rounded-[5px] text-[12px] font-semibold px-3.5 py-1.5 bg-[#4285F4]/10 text-[#4285F4] transition-all hover:bg-[#4285F4]/20"
            >Gerenciar</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <p className="text-[12.5px] text-muted-foreground leading-relaxed">
            Agende reuniões e sincronize eventos com seu calendário automaticamente.
          </p>
          <div className="flex justify-end">
            <button
              onClick={canManage ? handleConnect : undefined}
              disabled={!canManage || connecting}
              title={!canManage ? "Apenas admins podem gerenciar integrações" : undefined}
              className="rounded-[5px] text-[12px] font-bold px-[15px] py-[7px] text-white bg-gradient-to-br from-[#4285F4] to-[#2B63C3] shadow-[0_3px_12px_rgba(66,133,244,.35)] transition-all hover:shadow-lg disabled:opacity-45 disabled:cursor-not-allowed"
            >{connecting ? "Conectando..." : "Conectar Google Calendar"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Integrations Page ── */
const Integrations = () => {
  const { organizationId, isReady } = useOrganizationReady();
  const { permissions } = useOrganization();
  const canManage = permissions.canManageIntegrations;
  const [tab, setTab] = useState<"connections" | "webhooks" | "logs">("connections");
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showFacebook, setShowFacebook] = useState(false);
  const [showMetaPixel, setShowMetaPixel] = useState(false);
  const [fbKey, setFbKey] = useState(0); // force remount on dialog open
  const [metaPixelActive, setMetaPixelActive] = useState(false);
  const [gcalConnected, setGcalConnected] = useState(false);
  const [showGcalModal, setShowGcalModal] = useState(false);

  // ── Dados carregados via React Query com cache (5 min) ──
  const [dataLoading, setDataLoading] = useState(true);
  const [fbIntegration, setFbIntegration] = useState<any>(null);
  const [fbConfiguredForms, setFbConfiguredForms] = useState(0);
  const [waInstanceCount, setWaInstanceCount] = useState(0);
  const [waConnectedCount, setWaConnectedCount] = useState(0);
  const [waFunnelName, setWaFunnelName] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { isLoading: isIntegrationLoading } = useQuery({
    queryKey: ['integrations', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      // Carregar WhatsApp e Facebook em PARALELO (sem waterfall)
      const [waResult, fbResult] = await Promise.all([
        supabase.from("whatsapp_instances").select("status").eq("organization_id", organizationId),
        supabase.from("facebook_integrations").select("id, page_id, page_name, webhook_verified").eq("organization_id", organizationId).maybeSingle(),
      ]);

      let instanceCount = 0, connectedCount = 0;
      if (waResult.data) {
        instanceCount = waResult.data.length;
        connectedCount = waResult.data.filter((i: any) => {
          const s = (i.status || "").toLowerCase();
          return s === "connected" || s === "open";
        }).length;
      }

      const { data: waMappingData } = await supabase
        .from("funnel_source_mappings").select("funnel_id, sales_funnels(name)").eq("source_type", "whatsapp").maybeSingle();

      const fbData = fbResult.data;

      const { data: pixelData } = await supabase
        .from("meta_pixel_integrations").select("id, is_active").eq("organization_id", organizationId).maybeSingle();

      const { data: gcalData } = await supabase
        .from("google_calendar_integrations").select("id, is_active").eq("organization_id", organizationId).eq("is_active", true).maybeSingle();

      let configuredForms = 0;
      if (fbData?.page_id) {
        const { data: funnels } = await supabase.from("sales_funnels").select("id").eq("organization_id", organizationId);
        if (funnels && funnels.length > 0) {
          const funnelIds = funnels.map((f: any) => f.id);
          const { count } = await supabase
            .from("funnel_source_mappings").select("*", { count: "exact", head: true })
            .eq("source_type", "facebook").not("source_identifier", "is", null).in("funnel_id", funnelIds);
          configuredForms = count || 0;
        }
      }

      return {
        waInstanceCount: instanceCount,
        waConnectedCount: connectedCount,
        waFunnelName: waMappingData ? (waMappingData as any)?.sales_funnels?.name || null : null,
        fbIntegration: fbData || null,
        fbConfiguredForms: configuredForms,
        metaPixelActive: !!(pixelData?.is_active),
        gcalConnected: !!gcalData?.is_active,
      };
    },
    enabled: !!organizationId && isReady,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  // Sincronizar cache com estados locais
  useEffect(() => {
    const cached = queryClient.getQueryData<any>(['integrations', organizationId]);
    if (cached) {
      setWaInstanceCount(cached.waInstanceCount);
      setWaConnectedCount(cached.waConnectedCount);
      setWaFunnelName(cached.waFunnelName);
      setFbIntegration(cached.fbIntegration);
      setFbConfiguredForms(cached.fbConfiguredForms);
      setMetaPixelActive(cached.metaPixelActive);
      setGcalConnected(cached.gcalConnected);
    }
    setDataLoading(isIntegrationLoading);
  }, [isIntegrationLoading, organizationId, queryClient]);

  const refreshIntegrations = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['integrations', organizationId] });
  }, [organizationId, queryClient]);

  useEffect(() => {
    if (!isReady || !organizationId) return;

    // Realtime: atualizar card WhatsApp quando status mudar
    const channel = supabase
      .channel(`integrations-wa-${organizationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_instances", filter: `organization_id=eq.${organizationId}` },
        () => { refreshIntegrations(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isReady, organizationId, refreshIntegrations]);

  // Detect OAuth return — invalidate cache and show toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gcalStatus = params.get('integration');
    const gcalSuccess = params.get('success');
    const gcalError = params.get('error');

    if (gcalStatus === 'google_calendar') {
      refreshIntegrations();
      if (gcalSuccess === 'true') {
        toast({ title: "Google Calendar conectado!", description: "Sincronização ativa.", duration: 4000 });
      } else if (gcalError) {
        toast({ title: "Erro ao conectar", description: gcalError === 'access_denied' ? "Você negou o acesso." : "Falha na conexão. Tente novamente.", variant: "destructive", duration: 5000 });
      }
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Popup detection - close OAuth popup immediately without rendering the full page
  if (typeof window !== 'undefined' && window.opener && (
    window.location.search.includes('code=') || window.location.search.includes('facebook=')
  )) {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    const fbStatus = urlParams.get('facebook');
    const hasOAuthParams = !!(code && state);

    const payload = hasOAuthParams
      ? { code, state, redirect_uri: `${window.location.origin}${window.location.pathname}` }
      : { facebook: fbStatus, message: urlParams.get('message') };

    try {
      window.opener.postMessage({
        type: 'FACEBOOK_OAUTH_RESPONSE',
        payload
      }, window.location.origin);
    } catch (e) {
      // Ignore cross-origin errors
    }

    setTimeout(() => window.close(), 300);

    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-background">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mb-4" />
        <h2 className="text-xl font-semibold">Conectando ao Facebook</h2>
        <p className="text-muted-foreground mt-2">Esta janela fechara automaticamente em instantes.</p>
      </div>
    );
  }

  if (!isReady || !organizationId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingAnimation text="Carregando integrações..." />
      </div>
    );
  }

  const totalAvailable = 2 + COMING_SOON.length; // WhatsApp + Facebook + coming soon

  return (
    <>

      <div
        className="bg-muted/60 text-foreground p-4 sm:p-6 md:p-7 rounded-lg overflow-x-hidden min-w-0 min-h-full"
      >
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-start gap-4 mb-4 sm:mb-6 md:mb-7">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-[5px] flex-shrink-0 flex items-center justify-center" style={{ background: BG, boxShadow: `0 4px 18px ${GLOW}` }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <h1 className="text-lg sm:text-xl md:text-[22px] font-bold tracking-tight text-foreground">Integrações</h1>
            </div>
            <p className="hidden sm:block text-[13px] text-muted-foreground">Conecte serviços externos e automatize seus fluxos de trabalho</p>
          </div>
          <div className="flex gap-2.5 flex-shrink-0">
            <div className="px-4 py-2.5 rounded-[5px] text-center bg-primary/7 border border-primary/20">
              <div className="text-[22px] font-bold leading-none text-primary">{totalAvailable}</div>
              <div className="text-[10.5px] text-primary/70 mt-0.5">Disponíveis</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="mb-4 sm:mb-6 overflow-x-auto flex gap-1 bg-muted/50 border border-border rounded-md p-1 w-fit max-w-full">
          {(["connections", "webhooks", "logs"] as const).map(t => (
            <button
              key={t}
              className={`flex items-center gap-1.5 text-xs sm:text-[13px] font-medium px-3 sm:px-4 py-2 rounded-[5px] whitespace-nowrap transition-all ${
                tab === t
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
              onClick={() => setTab(t)}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${tab === t ? "bg-primary" : "bg-muted-foreground/30"}`}/>
              {t === "connections" ? "Conexões" : t === "webhooks" ? "Webhooks" : "Logs"}
            </button>
          ))}
        </div>

        {/* ── Connections Tab ── */}
        {tab === "connections" && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-5"
          >
            {/* WhatsApp — dados já carregados pelo pai */}
            <WhatsAppCard
              onManage={() => setShowWhatsApp(true)}
              instanceCount={waInstanceCount}
              connectedCount={waConnectedCount}
              loading={dataLoading}
              canManage={canManage}
              funnelName={waFunnelName}
            />

            {/* Facebook — dados já carregados pelo pai */}
            <FacebookCard
              integration={fbIntegration}
              configuredForms={fbConfiguredForms}
              loading={dataLoading}
              onManage={() => { setFbKey(k => k + 1); setShowFacebook(true); }}
              canManage={canManage}
            />

            {/* Meta Conversions API — card funcional */}
            <MetaConversionsCard
              isActive={metaPixelActive}
              loading={dataLoading}
              onManage={() => setShowMetaPixel(true)}
              canManage={canManage}
            />

            {/* Google Calendar — card funcional */}
            <GoogleCalendarCard
              isConnected={gcalConnected}
              loading={dataLoading}
              onConnect={() => setShowGcalModal(true)}
              canManage={canManage}
            />

            {/* Coming soon */}
            {COMING_SOON.map(g => <ComingSoonCard key={g.id} g={g} />)}

            {/* Request integration card */}
            <div
              className="int-grid-card-add min-h-[190px] border border-dashed border-border rounded-[5px] flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all hover:border-muted-foreground/30 hover:bg-muted/30"
            >
              <div className="w-9.5 h-9.5 rounded-[5px] bg-muted border border-border flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-muted-foreground">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div className="text-center">
                <div className="text-[12.5px] font-medium text-muted-foreground">Solicitar integração</div>
                <div className="text-[11px] text-muted-foreground/70 mt-0.5">Sugira um novo serviço</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Webhooks Tab ── */}
        {tab === "webhooks" && (
          <div className="bg-card border border-border rounded-lg">
            <WebhookIntegrationsTab organizationId={organizationId} />
          </div>
        )}

        {/* ── Logs Tab ── */}
        {tab === "logs" && (
          <div className="bg-card border border-border rounded-lg">
            <IntegratedLogsViewer />
          </div>
        )}
      </div>

      {/* ── WhatsApp Management Dialog ── */}
      <Dialog open={showWhatsApp} onOpenChange={(open) => {
        setShowWhatsApp(open);
        if (!open) refreshIntegrations();
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <WhatsAppConnection />
        </DialogContent>
      </Dialog>

      {/* ── Facebook Management Dialog ── */}
      <Dialog open={showFacebook} onOpenChange={(open) => {
        setShowFacebook(open);
        if (!open) refreshIntegrations();
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <FacebookLeadsConnection
            key={fbKey}
            organizationId={organizationId}
          />
        </DialogContent>
      </Dialog>

      {/* ── Meta Conversions API Dialog ── */}
      <Dialog open={showMetaPixel} onOpenChange={(open) => {
        setShowMetaPixel(open);
        if (!open) refreshIntegrations();
      }}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <MetaPixelConnection onBack={() => setShowMetaPixel(false)} />
        </DialogContent>
      </Dialog>

      {/* ── Google Calendar Modal ── */}
      <GoogleCalendarModal open={showGcalModal} onOpenChange={setShowGcalModal} />
    </>
  );
};

export default Integrations;
