type CandidateValue = string | number | null | undefined;

const UNKNOWN_NAMES = new Set([
  "unknown",
  "desconhecido",
  "sem nome",
  "lead sem nome",
  "null",
  "undefined",
]);

function cleanDisplayName(value: CandidateValue): string | null {
  if (value === null || value === undefined) return null;

  const name = String(value).replace(/\s+/g, " ").trim();
  if (!name) return null;

  const normalized = name.toLowerCase();
  if (UNKNOWN_NAMES.has(normalized)) return null;
  if (normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@c.us")) {
    return null;
  }
  if (normalized.endsWith("@lid") || normalized.endsWith("@g.us")) return null;

  const digitsOnly = name.replace(/\D/g, "");
  const hasLetters = /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(name);
  if (!hasLetters && digitsOnly.length >= 8) return null;

  return name.slice(0, 200);
}

function firstClean(candidates: CandidateValue[]): string | null {
  for (const candidate of candidates) {
    const clean = cleanDisplayName(candidate);
    if (clean) return clean;
  }

  return null;
}

export function extractWhatsAppDisplayName(
  data: any,
  options: { isFromMe?: boolean } = {},
): string | null {
  const contact = data?.contact || data?.Contact || data?.contactInfo || {};
  const firstContact = Array.isArray(data?.contacts) ? data.contacts[0] : {};
  const sender = data?.sender || data?.participant || {};
  const chat = data?.chat || data?.conversation || {};

  const savedContactName = firstClean([
    contact.name,
    contact.displayName,
    contact.shortName,
    contact.pushName,
    contact.pushname,
    contact.notifyName,
    contact.verifiedName,
    contact.verifiedBizName,
    firstContact?.name,
    firstContact?.displayName,
    firstContact?.shortName,
    firstContact?.pushName,
    firstContact?.notifyName,
    chat?.name,
    chat?.displayName,
  ]);

  if (savedContactName) return savedContactName;

  if (options.isFromMe) {
    return null;
  }

  return firstClean([
    data?.pushName,
    data?.pushname,
    data?.push_name,
    data?.profileName,
    data?.notifyName,
    data?.verifiedName,
    data?.verifiedBizName,
    data?.contactName,
    data?.senderName,
    data?.username,
    data?.userName,
    data?.displayName,
    data?.name,
    sender?.pushName,
    sender?.pushname,
    sender?.name,
    sender?.displayName,
    sender?.notifyName,
  ]);
}
