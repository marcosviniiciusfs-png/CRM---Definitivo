// Extração do nome que o próprio lead informa na mensagem ("meu nome é X", "me chamo X").
// Propositalmente restrita: só aceita frases inequívocas de apresentação. Padrões como
// "sou ..." ou "aqui é ..." e "mensagem curta = nome" geravam nomes como
// "cliente de vocês" ou "Tenho interesse", por isso não são suportados.

const NAME_CHARS = "A-Za-zÀ-ÖØ-öø-ÿ";

const EXPLICIT_PATTERNS = [
  new RegExp(`(?:^|[^${NAME_CHARS}])meu nome (?:e|é)\\s*:?\\s+([${NAME_CHARS}][${NAME_CHARS}'.\\- ]{0,79})`, "i"),
  new RegExp(`(?:^|[^${NAME_CHARS}])me chamo\\s+([${NAME_CHARS}][${NAME_CHARS}'.\\- ]{0,79})`, "i"),
];

// Palavras que indicam que a frase continuou depois do nome
// ("meu nome é João e quero saber o preço" -> "João").
const TRAILING_BREAKERS = new Set([
  "e",
  "eu",
  "quero",
  "queria",
  "gostaria",
  "tenho",
  "estou",
  "to",
  "tô",
  "vi",
  "sou",
  "moro",
  "aqui",
  "preciso",
  "pode",
  "podes",
  "por",
  "obrigado",
  "obrigada",
]);

const NON_NAMES = new Set([
  "audio",
  "áudio",
  "nao",
  "não",
  "ok",
  "sim",
]);

export function normalizeNameCandidate(value: string | null | undefined): string | null {
  if (!value) return null;

  const words: string[] = [];
  for (const word of value.replace(/\s+/g, " ").trim().split(" ")) {
    if (!word) continue;
    if (TRAILING_BREAKERS.has(word.toLowerCase())) break;
    words.push(word);
  }

  const cleaned = words.join(" ").replace(/^[\s'.\-]+|[\s'.\-]+$/g, "").trim();
  if (cleaned.length < 2 || cleaned.length > 80) return null;
  if (NON_NAMES.has(cleaned.toLowerCase())) return null;
  if (words.length > 5 || words.some((word) => word.length > 30)) return null;

  return cleaned;
}

export function extractSelfReportedName(message: string | null | undefined): string | null {
  const text = String(message || "")
    .replace(/\s+/g, " ")
    .replace(/^\[[^\]]+\]\s*/, "")
    .trim();

  if (!text || text.length > 300) return null;

  for (const pattern of EXPLICIT_PATTERNS) {
    const candidate = normalizeNameCandidate(text.match(pattern)?.[1]);
    if (candidate) return candidate;
  }

  return null;
}

// true quando o "nome" do lead é na verdade o telefone (lead criado sem nome conhecido).
export function isPhoneLikeName(name: string | null | undefined, phone: string | null | undefined): boolean {
  const raw = String(name || "").trim();
  if (!raw) return true;

  const nameDigits = raw.replace(/\D/g, "");
  const hasLetters = new RegExp(`[${NAME_CHARS}]`).test(raw);
  if (hasLetters || nameDigits.length < 8) return false;

  const phoneDigits = String(phone || "").replace(/\D/g, "");
  if (phoneDigits.length < 8) return true;

  return (
    nameDigits === phoneDigits ||
    phoneDigits.endsWith(nameDigits) ||
    nameDigits.endsWith(phoneDigits)
  );
}
