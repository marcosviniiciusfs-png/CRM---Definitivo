import assert from "node:assert/strict";
import test from "node:test";

import { followUpTitle, isDoneColumn, pickOpenColumn } from "../src/lib/followUpTask.ts";
import { firstOutgoingByLead, ID_CHUNK, PAGE, type OutgoingMessage } from "../src/lib/outgoingMessages.ts";

test("retorno entra na primeira coluna aberta", () => {
  const columns = [
    { id: "c", title: "Concluído", position: 0 },
    { id: "b", title: "Em Progresso", position: 2 },
    { id: "a", title: "A Fazer", position: 1 },
  ];
  assert.equal(pickOpenColumn(columns)?.id, "a");
  assert.equal(pickOpenColumn([columns[0]]), null);
  assert.ok(isDoneColumn("  concluídas "));
  assert.equal(followUpTitle("  Maria "), "Retorno: Maria");
});

test("primeira resposta lê todos os blocos e todas as páginas", async () => {
  const ids = Array.from({ length: ID_CHUNK + 5 }, (_, i) => `lead-${i}`);
  const messages: OutgoingMessage[] = [
    ...Array.from({ length: PAGE }, (_, i) => ({ id_lead: "lead-0", data_hora: String(i).padStart(6, "0") })),
    { id_lead: "lead-1", data_hora: "009000" },
    { id_lead: `lead-${ID_CHUNK + 4}`, data_hora: "009001" },
  ];
  const calls: number[] = [];
  const first = await firstOutgoingByLead(ids, async (chunk, from, to) => {
    calls.push(chunk.length);
    return messages.filter((m) => chunk.includes(m.id_lead)).slice(from, to + 1);
  });
  assert.equal(first.size, 3);
  assert.equal(first.get("lead-0"), "000000");
  assert.equal(first.get("lead-1"), "009000");
  assert.deepEqual(calls, [ID_CHUNK, ID_CHUNK, 5]);
});
