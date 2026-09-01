import { validateSupabaseFrontendConfig } from "../src/integrations/supabase/config.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrowsWithoutValue(
  action: () => unknown,
  rejectedValue: string,
  expectedVariableName: string,
) {
  try {
    action();
    throw new Error("a validação deveria falhar");
  } catch (error) {
    assert(error instanceof Error, "a falha deveria ser um Error");
    assert(
      error.message.includes(expectedVariableName),
      "a falha deve identificar somente a variável",
    );
    assert(
      !error.message.includes(rejectedValue),
      "a falha não deve expor o valor rejeitado",
    );
  }
}

Deno.test("aceita configuração HTTPS e remove espaços externos", () => {
  const config = validateSupabaseFrontendConfig(
    "  https://crm-api.example.invalid  ",
    "  public-test-key  ",
  );

  assert(
    config.url === "https://crm-api.example.invalid",
    "URL normalizada incorretamente",
  );
  assert(
    config.publishableKey === "public-test-key",
    "chave normalizada incorretamente",
  );
});

Deno.test("rejeita URL ausente, inválida ou sem HTTPS sem expor o valor", () => {
  assertThrowsWithoutValue(
    () => validateSupabaseFrontendConfig("", "public-test-key"),
    "public-test-key",
    "VITE_SUPABASE_URL",
  );
  assertThrowsWithoutValue(
    () =>
      validateSupabaseFrontendConfig(
        "not-a-url-sensitive-value",
        "public-test-key",
      ),
    "not-a-url-sensitive-value",
    "VITE_SUPABASE_URL",
  );
  assertThrowsWithoutValue(
    () =>
      validateSupabaseFrontendConfig(
        "http://crm-api.example.invalid/private-path",
        "public-test-key",
      ),
    "http://crm-api.example.invalid/private-path",
    "VITE_SUPABASE_URL",
  );
});

Deno.test("rejeita chave publicável ausente", () => {
  assertThrowsWithoutValue(
    () =>
      validateSupabaseFrontendConfig("https://crm-api.example.invalid", "   "),
    "https://crm-api.example.invalid",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );
});
