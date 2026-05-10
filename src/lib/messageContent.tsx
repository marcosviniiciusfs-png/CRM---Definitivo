import { ReactNode } from "react";

/**
 * Regex para detectar URLs em texto. Aceita:
 *  - http(s)://...
 *  - www.... (assumimos http://)
 * Termina em espaco, fim de linha, ou pontuacao final (que voltamos para fora
 * do match para evitar incluir "." final de frase no link).
 */
const URL_REGEX = /(\b(?:https?:\/\/|www\.)[^\s<>"]+)/gi;
// @<digitos> com 8+ digitos (numero de telefone). Permite hifens/espacos opcionais
// que algumas pessoas digitam, mas o match captura so os digitos da menção.
const MENTION_REGEX = /@(\d{8,})/g;

/**
 * Normaliza URL: se vier "www.x.com", prefixa "https://"
 */
function normalizeUrl(raw: string): string {
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}

/**
 * Limpa pontuacao no final do URL (ponto, virgula, parenteses) que provavelmente
 * pertence a frase, nao ao link.
 */
function trimTrailingPunctuation(url: string): { clean: string; trailing: string } {
  const m = url.match(/^(.*?)([.,;!?\)\]\}]+)$/);
  if (m && m[1].length >= 4) {
    return { clean: m[1], trailing: m[2] };
  }
  return { clean: url, trailing: "" };
}

/**
 * Procura nome amigavel de uma menção dentro de um mapa de JID -> nome.
 * Se nao houver, retorna o numero formatado.
 */
function resolveMentionLabel(digits: string, jidNameMap?: Map<string, string>): string {
  if (jidNameMap) {
    const jid = `${digits}@s.whatsapp.net`;
    const name = jidNameMap.get(jid);
    if (name) return name;
  }
  return digits;
}

export interface ParseOptions {
  /** Mapa JID -> nome amigavel para resolver mencoes em nomes. */
  mentionNameByJid?: Map<string, string>;
  /** JIDs explicitamente mencionados (do payload do WhatsApp). Quando informado,
   *  apenas @<digitos> que tem JID correspondente sao destacados como menção. */
  mentionedJids?: string[] | null;
  /** Classes para os tokens (override via Tailwind). */
  classes?: {
    link?: string;
    mention?: string;
  };
}

/**
 * Parseia texto de mensagem em ReactNodes seguros, transformando:
 *  - URLs (http/https/www) em <a> clicavel (target="_blank", rel noopener)
 *  - @<digitos> em <span> destacado (menção)
 *
 * Sem dangerouslySetInnerHTML — todos os tokens passam por React, imune a XSS.
 *
 * Comportamento da menção:
 *  - Se `mentionedJids` for informado, so destaca @<digitos> cujo JID
 *    correspondente esta nessa lista. Outros @<num> ficam como texto normal.
 *  - Se `mentionedJids` for null/undefined, destaca qualquer @<digitos>.
 */
export function parseMessageContent(
  text: string,
  opts: ParseOptions = {}
): ReactNode[] {
  if (!text) return [];

  const { mentionNameByJid, mentionedJids, classes } = opts;
  const linkClass = classes?.link ?? "underline underline-offset-2 hover:opacity-80 break-words";
  const mentionClass = classes?.mention ?? "font-semibold underline-offset-2 hover:underline";

  const allowedDigits = mentionedJids
    ? new Set(mentionedJids
        .map((j) => (typeof j === "string" ? j.split("@")[0] : ""))
        .filter(Boolean))
    : null;

  // Estrategia: primeiro substituir URLs, depois mencoes — em ordem do indice
  // para nao sobrepor matches.
  type Token = { type: "text" | "link" | "mention"; raw: string; meta?: any };

  // 1) Coletar matches em (start, end) — URLs E mencoes simultaneamente.
  type Match = { start: number; end: number; kind: "link" | "mention"; raw: string; meta?: any };
  const matches: Match[] = [];

  // URLs
  for (const m of text.matchAll(URL_REGEX)) {
    if (m.index === undefined) continue;
    const raw = m[0];
    const { clean, trailing } = trimTrailingPunctuation(raw);
    matches.push({
      start: m.index,
      end: m.index + clean.length,
      kind: "link",
      raw: clean,
    });
    // Trailing punctuation fica como texto normal — adicionamos como faixa "vazia" e o trecho seguinte pega.
    void trailing;
  }

  // Mencoes
  for (const m of text.matchAll(MENTION_REGEX)) {
    if (m.index === undefined) continue;
    const digits = m[1];
    if (allowedDigits && !allowedDigits.has(digits)) continue;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      kind: "mention",
      raw: m[0],
      meta: { digits },
    });
  }

  // Resolver sobreposicoes (preferindo a primeira a comecar; em empate, mais longa).
  matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const final: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start < cursor) continue;
    final.push(m);
    cursor = m.end;
  }

  if (final.length === 0) {
    return [text];
  }

  const tokens: Token[] = [];
  let pos = 0;
  for (const m of final) {
    if (m.start > pos) {
      tokens.push({ type: "text", raw: text.slice(pos, m.start) });
    }
    tokens.push({ type: m.kind, raw: m.raw, meta: m.meta });
    pos = m.end;
  }
  if (pos < text.length) {
    tokens.push({ type: "text", raw: text.slice(pos) });
  }

  return tokens.map((t, idx) => {
    if (t.type === "link") {
      const href = normalizeUrl(t.raw);
      return (
        <a
          key={idx}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
          onClick={(e) => e.stopPropagation()}
        >
          {t.raw}
        </a>
      );
    }
    if (t.type === "mention") {
      const digits: string = t.meta?.digits || "";
      const label = resolveMentionLabel(digits, mentionNameByJid);
      return (
        <span key={idx} className={mentionClass} title={`@${digits}`}>
          @{label}
        </span>
      );
    }
    return <span key={idx}>{t.raw}</span>;
  });
}

/**
 * Detecta @<digitos> dentro de um texto digitado pelo usuário e devolve a
 * lista de JIDs correspondentes (formato Evolution: "5511...@s.whatsapp.net").
 * Usado pelo input de envio para passar o campo `mentions` ao backend.
 */
export function extractMentionsFromInput(text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_REGEX)) {
    const digits = m[1];
    if (digits && digits.length >= 8) {
      out.add(`${digits}@s.whatsapp.net`);
    }
  }
  return Array.from(out);
}
