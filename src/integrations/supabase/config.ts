export type SupabaseFrontendConfig = Readonly<{
  url: string;
  publishableKey: string;
}>;

const requireNonEmptyString = (
  value: unknown,
  variableName: string,
): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Configuração obrigatória ausente: ${variableName}.`);
  }

  return value.trim();
};

export const validateSupabaseFrontendConfig = (
  rawUrl: unknown,
  rawPublishableKey: unknown,
): SupabaseFrontendConfig => {
  const url = requireNonEmptyString(rawUrl, "VITE_SUPABASE_URL");
  const publishableKey = requireNonEmptyString(
    rawPublishableKey,
    "VITE_SUPABASE_PUBLISHABLE_KEY",
  );

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(
      "Configuração inválida: VITE_SUPABASE_URL deve ser uma URL HTTPS válida.",
    );
  }

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname.length === 0) {
    throw new Error(
      "Configuração inválida: VITE_SUPABASE_URL deve ser uma URL HTTPS válida.",
    );
  }

  return { url, publishableKey };
};
