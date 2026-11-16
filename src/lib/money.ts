const brlNoCents = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const compactNumber = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "R$ 8.900": valor sem centavos, como no funil (DESIGN.md). */
export function formatBRL(value: number | null | undefined): string {
  return brlNoCents.format(Number(value) || 0).replace(/\s/g, " "); // Intl usa espaço não separável depois de "R$"
}

/** "R$ 412 mil" / "R$ 1,2 mi": para resumos de cabeçalho. */
export function formatBRLCompact(value: number | null | undefined): string {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${compactNumber.format(n / 1_000_000)} mi`;
  if (Math.abs(n) >= 10_000) return `R$ ${Math.round(n / 1_000)} mil`;
  return formatBRL(n);
}

/** "há 12 min", "há 3 h", "há 2 d" ou "14/11" para datas antigas. */
export function formatRelativeShort(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "";
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(time).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
