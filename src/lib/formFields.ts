// Rótulos e valores de formulários (Meta Ads, webhooks) legíveis para pessoas.

const ACRONYMS: Record<string, string> = { ddd: "DDD", cpf: "CPF", cnpj: "CNPJ", cep: "CEP", id: "ID", uf: "UF", fgts: "FGTS" };

const FIELD_NAMES: Record<string, string> = {
  full_name: "Nome completo",
  first_name: "Nome",
  last_name: "Sobrenome",
  email: "E-mail",
  phone_number: "Telefone",
  phone: "Telefone",
  whatsapp_number: "WhatsApp",
  city: "Cidade",
  state: "Estado",
  zip_code: "CEP",
  date_of_birth: "Data de nascimento",
  company_name: "Empresa",
  job_title: "Cargo",
  duvida_cliente: "Dúvida do cliente",
};

/** "whatsapp_com_ddd" -> "WhatsApp com DDD"; "Full Name" -> "Nome completo". */
export function humanizeFieldName(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (FIELD_NAMES[key]) return FIELD_NAMES[key];
  const words = key.split("_").filter(Boolean).map((word) => ACRONYMS[word] ?? (word === "whatsapp" ? "WhatsApp" : word));
  if (words.length === 0) return raw;
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "de_8_a_15_mil" -> "De 8 a 15 mil"; "sim" -> "Sim"; números, e-mails e telefones ficam como estão. */
export function humanizeFieldValue(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (/@/.test(value) || /^\+?[\d\s().-]+$/.test(value) || /^https?:\/\//i.test(value)) return value;
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/i.test(value) || /^[a-zà-ú]+$/i.test(value)) {
    const text = value.replace(/_/g, " ");
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return value;
}
