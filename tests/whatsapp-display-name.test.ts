import assert from "node:assert/strict";
import test from "node:test";

import { extractWhatsAppDisplayName } from "../supabase/functions/_shared/whatsapp-display-name.ts";

test("prioriza nome salvo do contato antes do pushName", () => {
  assert.equal(
    extractWhatsAppDisplayName({
      contact: { name: "Maria Cliente" },
      pushName: "maria.123",
      key: { fromMe: false },
    }),
    "Maria Cliente",
  );
});

test("usa pushName como nome de usuario em mensagens recebidas", () => {
  assert.equal(
    extractWhatsAppDisplayName({
      pushName: "Cliente WhatsApp",
      key: { fromMe: false },
    }),
    "Cliente WhatsApp",
  );
});

test("ignora pushName solto em mensagem fromMe para evitar nome do vendedor", () => {
  assert.equal(
    extractWhatsAppDisplayName({
      pushName: "Nome do Vendedor",
      key: { fromMe: true },
    }, { isFromMe: true }),
    null,
  );
});

test("aceita nome salvo em mensagem fromMe quando vem em objeto de contato", () => {
  assert.equal(
    extractWhatsAppDisplayName({
      contact: { displayName: "Lead Salvo" },
      pushName: "Nome do Vendedor",
      key: { fromMe: true },
    }, { isFromMe: true }),
    "Lead Salvo",
  );
});

test("descarta placeholders, telefones e JIDs", () => {
  assert.equal(extractWhatsAppDisplayName({ pushName: "Desconhecido" }), null);
  assert.equal(extractWhatsAppDisplayName({ pushName: "5511999999999" }), null);
  assert.equal(
    extractWhatsAppDisplayName({ pushName: "5511999999999@s.whatsapp.net" }),
    null,
  );
});
