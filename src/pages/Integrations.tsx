import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganizationReady } from "@/hooks/useOrganizationReady";
import { LoadingAnimation } from "@/components/LoadingAnimation";
import { FacebookLeadsConnection } from "@/components/FacebookLeadsConnection";
import WhatsAppConnection from "@/components/WhatsAppConnection";
import { WebhookIntegrationsTab } from "@/components/WebhookIntegrationsTab";
import { IntegratedLogsViewer } from "@/components/IntegratedLogsViewer";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/* ── Design tokens ── */
const BG   = "linear-gradient(135deg,#921009 0%,#c0392b 50%,#e97555 100%)";
const GLOW = "rgba(192,57,43,0.35)";
const R    = "5px";

/* ── Coming-soon integration definitions ── */
const COMING_SOON = [
  {
    id: "gcal", name: "Google Calendar", cat: "Produtividade",
    desc: "Agende reuniões e sincronize eventos com seu calendário automaticamente.",
    color: "#4285F4", bg: "rgba(66,133,244,.06)", br: "rgba(66,133,244,.16)",
    ic: (
      <svg viewBox="0 0 32 32" width="22" height="22">
        <rect width="32" height="32" rx="2" fill="#4285F4"/>
        <rect x="4" y="8" width="24" height="20" rx="1" fill="white"/>
        <rect x="4" y="8" width="24" height="7" fill="#4285F4"/>
        <rect x="9" y="4" width="3" height="7" rx="1" fill="white"/>
        <rect x="20" y="4" width="3" height="7" rx="1" fill="white"/>
        <text x="16" y="24" textAnchor="middle" fill="#4285F4" fontSize="9" fontWeight="bold">CAL</text>
      </svg>
    ),
  },
  {
    id: "meta", name: "Meta Conversions", cat: "Anúncios",
    desc: "Envie eventos de conversão para o Meta Ads e otimize suas campanhas.",
    color: "#0081FB", bg: "rgba(0,129,251,.06)", br: "rgba(0,129,251,.16)",
    ic: (
      <svg viewBox="0 0 24 24" fill="#0081FB" width="22" height="22">
        <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 2.93 1.22 1.586 0 2.687-.7 3.637-2.36a9.558 9.558 0 0 0 1.07-4.124c0-2.91-.964-5.387-2.715-7.072C21.27 5.638 19.927 5 18.552 5c-2.3 0-3.615 1.145-4.735 3.498L12.58 11.3l-.347-.575c-1.342-2.21-2.587-3.496-4.267-3.496z"/>
      </svg>
    ),
  },
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

/* ── Small connection card for "coming soon" integrations ── */
function ComingSoonCard({ g }: { g: typeof COMING_SOON[number] }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 190,
        borderRadius: R,
        border: `1px solid ${hov ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.06)"}`,
        background: hov ? "rgba(255,255,255,.03)" : "rgba(255,255,255,.015)",
        transition: "all .2s",
        display: "flex",
        flexDirection: "column",
        padding: "16px 16px 14px",
        opacity: 0.55,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: R, flexShrink: 0,
            background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)",
            display: "flex", alignItems: "center", justifyContent: "center",
            filter: "grayscale(.5) opacity(.5)",
          }}>
            {g.ic}
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#3A3A4A", lineHeight: 1.2, marginBottom: 4 }}>{g.name}</div>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
              background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", color: "#2A2A3A",
            }}>{g.cat}</span>
          </div>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "#2A2A3A", lineHeight: 1.6, flex: 1,
        overflow: "hidden", display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{g.desc}</p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div style={{
          fontSize: 11.5, color: "#1E1E28", fontWeight: 500,
          background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)",
          borderRadius: R, padding: "6px 13px",
        }}>🔒 Em breve</div>
      </div>
    </div>
  );
}

/* ── WhatsApp summary card ── */
function WhatsAppCard({ onManage }: { onManage: () => void }) {
  const [hov, setHov] = useState(false);
  const [instanceCount, setInstanceCount] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Query whatsapp_instances without org filter (component already filters)
    supabase.from("whatsapp_instances").select("status").then(({ data }) => {
      if (data) {
        setInstanceCount(data.length);
        setConnectedCount(data.filter((i: any) => i.status === "open" || i.status === "connected").length);
      }
      setLoading(false);
    });
  }, []);

  const isConnected = connectedCount > 0;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 190,
        borderRadius: R,
        border: `1px solid ${isConnected ? "rgba(37,211,102,.22)" : hov ? "rgba(37,211,102,.15)" : "rgba(255,255,255,.07)"}`,
        background: isConnected ? "rgba(37,211,102,.06)" : hov ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)",
        boxShadow: isConnected ? "0 4px 24px rgba(37,211,102,.08)" : hov ? "0 6px 24px rgba(0,0,0,.3)" : "none",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all .2s",
        display: "flex", flexDirection: "column",
        padding: "16px 16px 14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: R, flexShrink: 0,
            background: "rgba(37,211,102,.08)", border: "1px solid rgba(37,211,102,.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {WHATSAPP_IC}
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E8E8F0", lineHeight: 1.2, marginBottom: 4 }}>WhatsApp</div>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
              background: "rgba(37,211,102,.1)", border: "1px solid rgba(37,211,102,.2)", color: "#25D366",
            }}>Mensagens</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isConnected ? "#2ECC71" : "#222230",
            boxShadow: isConnected ? "0 0 6px rgba(46,204,113,.5)" : "none",
          }}/>
          <span style={{ fontSize: 11, fontWeight: 500, color: isConnected ? "#2ECC71" : "#2A2A3A" }}>
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "#606070", lineHeight: 1.6, flex: 1 }}>Verificando conexão...</p>
      ) : isConnected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{
            padding: "8px 10px", borderRadius: R,
            background: "rgba(37,211,102,.06)", border: "1px solid rgba(37,211,102,.15)",
            fontSize: 12, color: "#88DDAA",
          }}>
            {connectedCount} instância{connectedCount !== 1 ? "s" : ""} conectada{connectedCount !== 1 ? "s" : ""}
            {instanceCount > connectedCount && <span style={{ color: "#555566", marginLeft: 6 }}>({instanceCount - connectedCount} desconectada{instanceCount - connectedCount !== 1 ? "s" : ""})</span>}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onManage}
              style={{
                border: "1px solid rgba(37,211,102,.3)", borderRadius: R, fontFamily: "inherit",
                fontSize: 12, fontWeight: 600, padding: "6px 14px", cursor: "pointer",
                background: "rgba(37,211,102,.1)", color: "#2ECC71", transition: "all .18s",
              }}
            >Gerenciar</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12.5, color: "#606070", lineHeight: 1.6 }}>
            Receba e envie mensagens diretamente para seus leads com número Business.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onManage}
              style={{
                border: "none", borderRadius: R, fontFamily: "inherit",
                fontSize: 12, fontWeight: 700, padding: "7px 15px", cursor: "pointer",
                color: "white", background: "linear-gradient(135deg,#128C7E,#25D366)",
                boxShadow: "0 3px 12px rgba(37,211,102,.3)", transition: "all .18s",
              }}
            >Conectar WhatsApp</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Facebook summary card ── */
function FacebookCard({
  organizationId,
  onManage,
}: {
  organizationId: string;
  onManage: () => void;
}) {
  const [hov, setHov] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [configuredForms, setConfiguredForms] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!organizationId) return;
    (async () => {
      setLoading(true);
      try {
        // Try RPC first
        let intData: any = null;
        const { data: rpcData, error: rpcError } = await supabase.rpc("get_facebook_integrations_masked");
        if (!rpcError && rpcData && rpcData.length > 0) {
          intData = rpcData.find((r: any) => r.organization_id === organizationId) || rpcData[0];
        } else {
          const { data: direct } = await supabase
            .from("facebook_integrations")
            .select("*")
            .eq("organization_id", organizationId)
            .maybeSingle();
          intData = direct;
        }

        if (intData?.page_id) {
          setIntegration(intData);
          // Count configured forms
          const { data: funnels } = await supabase
            .from("sales_funnels")
            .select("id")
            .eq("organization_id", organizationId);
          if (funnels && funnels.length > 0) {
            const { count } = await supabase
              .from("funnel_source_mappings")
              .select("*", { count: "exact", head: true })
              .eq("source_type", "facebook")
              .in("funnel_id", funnels.map((f: any) => f.id));
            setConfiguredForms(count || 0);
          }
        }
      } catch (e) {
        console.error("FacebookCard status check failed:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [organizationId]);

  const isConnected = !!integration?.page_id;

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        height: 190,
        borderRadius: R,
        border: `1px solid ${isConnected ? "rgba(24,119,242,.25)" : hov ? "rgba(24,119,242,.15)" : "rgba(255,255,255,.07)"}`,
        background: isConnected ? "rgba(24,119,242,.06)" : hov ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.02)",
        boxShadow: isConnected ? "0 4px 24px rgba(24,119,242,.1)" : hov ? "0 6px 24px rgba(0,0,0,.3)" : "none",
        transform: hov ? "translateY(-2px)" : "none",
        transition: "all .2s",
        display: "flex", flexDirection: "column",
        padding: "16px 16px 14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
          <div style={{
            width: 40, height: 40, borderRadius: R, flexShrink: 0,
            background: "rgba(24,119,242,.08)", border: "1px solid rgba(24,119,242,.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {FACEBOOK_IC}
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "#E8E8F0", lineHeight: 1.2, marginBottom: 4 }}>Facebook Leads</div>
            <span style={{
              fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 3,
              background: "rgba(24,119,242,.1)", border: "1px solid rgba(24,119,242,.22)", color: "#1877F2",
            }}>Anúncios</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <span style={{
            width: 7, height: 7, borderRadius: "50%",
            background: isConnected ? "#2ECC71" : "#222230",
            boxShadow: isConnected ? "0 0 6px rgba(46,204,113,.5)" : "none",
          }}/>
          <span style={{ fontSize: 11, fontWeight: 500, color: isConnected ? "#2ECC71" : "#2A2A3A" }}>
            {isConnected ? "Online" : "Offline"}
          </span>
        </div>
      </div>

      {loading ? (
        <p style={{ fontSize: 12.5, color: "#606070", flex: 1 }}>Verificando conexão...</p>
      ) : isConnected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {/* Page name */}
            <div style={{
              padding: "5px 9px", borderRadius: R,
              background: "rgba(24,119,242,.07)", border: "1px solid rgba(24,119,242,.2)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              {FACEBOOK_IC && <span style={{ flexShrink: 0, opacity: 0.7 }}>{
                <svg viewBox="0 0 24 24" fill="#1877F2" width="11" height="11">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              }</span>}
              <span style={{ fontSize: 10.5, color: "#607080", flexShrink: 0 }}>Página:</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#99BBDD", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {integration?.page_name || "Página conectada"}
              </span>
            </div>
            {/* Form count */}
            <div style={{
              padding: "5px 9px", borderRadius: R,
              background: configuredForms > 0 ? "rgba(46,204,113,.05)" : "rgba(255,255,255,.03)",
              border: `1px solid ${configuredForms > 0 ? "rgba(46,204,113,.2)" : "rgba(255,255,255,.06)"}`,
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={configuredForms > 0 ? "#2ECC71" : "#444455"}
                width="11" height="11" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="8" y1="8" x2="16" y2="8"/>
                <line x1="8" y1="12" x2="16" y2="12"/>
                <line x1="8" y1="16" x2="13" y2="16"/>
              </svg>
              <span style={{ fontSize: 10.5, color: "#607080", flexShrink: 0 }}>Formulários:</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: configuredForms > 0 ? "#88DDAA" : "#2A2A3A" }}>
                {configuredForms > 0 ? `${configuredForms} configurado${configuredForms !== 1 ? "s" : ""}` : "Nenhum configurado"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onManage}
              style={{
                border: "1px solid rgba(24,119,242,.3)", borderRadius: R, fontFamily: "inherit",
                fontSize: 12, fontWeight: 600, padding: "6px 14px", cursor: "pointer",
                background: "rgba(24,119,242,.1)", color: "#5599DD", transition: "all .18s",
              }}
            >Gerenciar Formulários</button>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <p style={{ fontSize: 12.5, color: "#606070", lineHeight: 1.6 }}>
            Importe leads automaticamente das campanhas de anúncios do Facebook Ads.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={onManage}
              style={{
                border: "none", borderRadius: R, fontFamily: "inherit",
                fontSize: 12, fontWeight: 700, padding: "7px 15px", cursor: "pointer",
                color: "white", background: "linear-gradient(135deg,#1877F2,#1565C0)",
                boxShadow: "0 3px 12px rgba(24,119,242,.35)", transition: "all .18s",
              }}
            >Conectar ao Facebook</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main Integrations Page ── */
const Integrations = () => {
  const { organizationId, isReady } = useOrganizationReady();
  const [tab, setTab] = useState<"connections" | "webhooks" | "logs">("connections");
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [showFacebook, setShowFacebook] = useState(false);
  const [fbKey, setFbKey] = useState(0); // force remount on dialog open

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
      <style>{`
        @keyframes _sp { to { transform: rotate(360deg) } }
        .int-tab-btn {
          background: none; border: none; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 500; padding: 9px 17px; border-radius: 5px;
          display: flex; align-items: center; gap: 7px;
          color: #555566; transition: all .18s; white-space: nowrap;
        }
        .int-tab-btn:hover { color: #C0C0D0; background: rgba(255,255,255,.04); }
        .int-tab-btn.active { color: #F0F0F8; background: rgba(255,255,255,.07); }
        .int-tab-btn.active .int-dot { background: linear-gradient(135deg,#921009,#e97555); }
        .int-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,.1); flex-shrink: 0; transition: all .2s; }
        .int-grid-card-add:hover { border-color: rgba(255,255,255,.13) !important; background: rgba(255,255,255,.02) !important; }
      `}</style>

      <div
        style={{
          minHeight: "100%",
          background: "linear-gradient(180deg, #0A0A0E 0%, #0E0E14 100%)",
          color: "#E8E8F0",
          fontFamily: "'DM Sans',system-ui,sans-serif",
          borderRadius: 8,
          padding: "28px 24px",
        }}
      >
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 7 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "5px", background: BG, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: `0 4px 18px ${GLOW}`,
              }}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <h1 style={{
                fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em",
                background: "linear-gradient(135deg,#F5F0F0 30%,#C09080)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              }}>Integrações</h1>
            </div>
            <p style={{ fontSize: 13, color: "#555566" }}>Conecte serviços externos e automatize seus fluxos de trabalho</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
            <div style={{ padding: "10px 16px", borderRadius: "5px", textAlign: "center", background: "rgba(233,117,85,.07)", border: "1px solid rgba(233,117,85,.2)" }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1, background: BG, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{totalAvailable}</div>
              <div style={{ fontSize: 10.5, color: "#C07060", opacity: .8, marginTop: 2 }}>Disponíveis</div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: "flex", gap: 3, marginBottom: 24,
          background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.07)",
          borderRadius: "5px", padding: 4, width: "fit-content",
        }}>
          {(["connections", "webhooks", "logs"] as const).map(t => (
            <button key={t} className={`int-tab-btn ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              <span className="int-dot"/>
              {t === "connections" ? "Conexões" : t === "webhooks" ? "Webhooks" : "Logs"}
            </button>
          ))}
        </div>

        {/* ── Connections Tab ── */}
        {tab === "connections" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 12,
            }}
          >
            {/* WhatsApp */}
            <WhatsAppCard onManage={() => setShowWhatsApp(true)} />

            {/* Facebook */}
            <FacebookCard
              organizationId={organizationId}
              onManage={() => { setFbKey(k => k + 1); setShowFacebook(true); }}
            />

            {/* Coming soon */}
            {COMING_SOON.map(g => <ComingSoonCard key={g.id} g={g} />)}

            {/* Request integration card */}
            <div
              className="int-grid-card-add"
              style={{
                height: 190, border: "1px dashed rgba(255,255,255,.07)", borderRadius: "5px",
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 10, cursor: "pointer", transition: "all .2s",
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: "5px",
                background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2A2A36" strokeWidth="2.2">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: "#2A2A36" }}>Solicitar integração</div>
                <div style={{ fontSize: 11, color: "#1E1E28", marginTop: 3 }}>Sugira um novo serviço</div>
              </div>
            </div>
          </div>
        )}

        {/* ── Webhooks Tab ── */}
        {tab === "webhooks" && (
          <div style={{
            background: "rgba(255,255,255,.02)", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.06)",
          }}>
            <WebhookIntegrationsTab organizationId={organizationId} />
          </div>
        )}

        {/* ── Logs Tab ── */}
        {tab === "logs" && (
          <div style={{
            background: "rgba(255,255,255,.02)", borderRadius: 8,
            border: "1px solid rgba(255,255,255,.06)",
          }}>
            <IntegratedLogsViewer />
          </div>
        )}
      </div>

      {/* ── WhatsApp Management Dialog ── */}
      <Dialog open={showWhatsApp} onOpenChange={setShowWhatsApp}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <WhatsAppConnection />
        </DialogContent>
      </Dialog>

      {/* ── Facebook Management Dialog ── */}
      <Dialog open={showFacebook} onOpenChange={setShowFacebook}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <FacebookLeadsConnection
            key={fbKey}
            organizationId={organizationId}
          />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Integrations;
