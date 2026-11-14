// Tabela "Leads de anúncio por dia": uma linha por dia (inclusive dias zerados), uma coluna por
// porta de entrada (palavra-chave do WhatsApp ou formulário da Meta), total e agendados de anúncio.
// Testado em tests/ad-entries.test.ts.

export interface AdEntryRow {
  day: string;
  source_key: string;
  source_label: string;
  leads: number;
}

export interface AdEntrySource {
  key: string;
  label: string;
  total: number;
}

export interface AdEntryDayRow {
  day: string;
  bySource: Record<string, number>;
  total: number;
  scheduled: number;
}

export interface AdEntryTable {
  sources: AdEntrySource[];
  days: AdEntryDayRow[];
  totals: { bySource: Record<string, number>; total: number; scheduled: number };
}

const iso = (value: string) => String(value).slice(0, 10);

export function listDays(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end && days.length <= 366) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/**
 * @param rows linhas de panel_ad_entries_daily
 * @param scheduledByDay agendados de anúncio por dia (panel_attendance.scheduled_from_ads)
 * @returns dias do mais recente para o mais antigo; colunas da que mais trouxe para a que menos trouxe
 */
export function buildAdEntryTable(
  rows: AdEntryRow[],
  scheduledByDay: Record<string, number>,
  from: string,
  to: string,
): AdEntryTable {
  const sourceMap = new Map<string, AdEntrySource>();
  const cells = new Map<string, Record<string, number>>();

  for (const row of rows) {
    const day = iso(row.day);
    const source = sourceMap.get(row.source_key) ?? { key: row.source_key, label: row.source_label, total: 0 };
    source.total += row.leads;
    sourceMap.set(row.source_key, source);
    const dayCells = cells.get(day) ?? {};
    dayCells[row.source_key] = (dayCells[row.source_key] ?? 0) + row.leads;
    cells.set(day, dayCells);
  }

  const sources = [...sourceMap.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));

  const days = listDays(from, to).reverse().map((day) => {
    const bySource = cells.get(day) ?? {};
    return {
      day,
      bySource,
      total: Object.values(bySource).reduce((sum, value) => sum + value, 0),
      scheduled: scheduledByDay[day] ?? 0,
    };
  });

  const totalsBySource = Object.fromEntries(sources.map((source) => [source.key, source.total]));
  return {
    sources,
    days,
    totals: {
      bySource: totalsBySource,
      total: sources.reduce((sum, source) => sum + source.total, 0),
      scheduled: days.reduce((sum, day) => sum + day.scheduled, 0),
    },
  };
}
