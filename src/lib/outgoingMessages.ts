// Primeira mensagem enviada a cada lead, lida em blocos para não estourar a URL nem o limite de 1000 linhas.

export const ID_CHUNK = 100;
export const PAGE = 1000;

export interface OutgoingMessage {
  id_lead: string;
  data_hora: string;
}

/** Busca uma página de mensagens enviadas dos leads informados, da mais antiga para a mais nova. */
export type FetchOutgoingPage = (leadIds: string[], from: number, to: number) => Promise<OutgoingMessage[]>;

export async function firstOutgoingByLead(leadIds: string[], fetchPage: FetchOutgoingPage): Promise<Map<string, string>> {
  const first = new Map<string, string>();
  for (let start = 0; start < leadIds.length; start += ID_CHUNK) {
    const chunk = leadIds.slice(start, start + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const rows = await fetchPage(chunk, from, from + PAGE - 1);
      for (const row of rows) {
        if (!first.has(row.id_lead)) first.set(row.id_lead, row.data_hora);
      }
      if (rows.length < PAGE) break;
    }
  }
  return first;
}
