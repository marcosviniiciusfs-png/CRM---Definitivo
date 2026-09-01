import assert from "node:assert/strict";
import test from "node:test";

import { getLeadDuplicateMetadata } from "../src/lib/leadDuplicate.ts";

test("identifica o novo registro duplicado pelos metadados canônicos", () => {
  assert.deepEqual(
    getLeadDuplicateMetadata({
      is_duplicate: true,
      duplicate_of_lead_id: "lead-original",
      duplicate_match_type: "phone",
    }),
    {
      isDuplicateRecord: true,
      duplicateOfLeadId: "lead-original",
      matchType: "phone",
    },
  );
});

test("não marca o lead original sem metadado explícito", () => {
  assert.equal(getLeadDuplicateMetadata({ is_duplicate: false }).isDuplicateRecord, false);
  assert.equal(getLeadDuplicateMetadata(null).isDuplicateRecord, false);
});

test("aceita metadados serializados e referência legada como fallback", () => {
  assert.equal(
    getLeadDuplicateMetadata(JSON.stringify({ is_duplicate: " true ", duplicate_match_type: "email" }))
      .isDuplicateRecord,
    true,
  );
  assert.equal(
    getLeadDuplicateMetadata({ duplicate_of_lead_id: "lead-recuperado" }).isDuplicateRecord,
    true,
  );
});
