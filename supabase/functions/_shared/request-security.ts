export class RequestValidationError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const MAX_RATE_BUCKETS = 2048;

export async function readJsonObject(
  req: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new RequestValidationError(
      415,
      "Content-Type deve ser application/json",
    );
  }

  const declaredLength = Number(req.headers.get("content-length") || "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestValidationError(413, "Payload excede o limite permitido");
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new RequestValidationError(413, "Payload excede o limite permitido");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RequestValidationError(400, "JSON inválido");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestValidationError(400, "Payload deve ser um objeto JSON");
  }
  assertObjectComplexity(parsed, 0);
  return parsed as Record<string, unknown>;
}

export async function readOptionalJsonObject(
  req: Request,
  maxBytes = 16 * 1024,
): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType && !contentType.startsWith("application/json")) {
    throw new RequestValidationError(
      415,
      "Content-Type deve ser application/json",
    );
  }

  const raw = await req.text();
  if (!raw.trim()) return {};
  if (new TextEncoder().encode(raw).length > maxBytes) {
    throw new RequestValidationError(413, "Payload excede o limite permitido");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RequestValidationError(400, "JSON inválido");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestValidationError(400, "Payload deve ser um objeto JSON");
  }
  assertObjectComplexity(parsed, 0);
  return parsed as Record<string, unknown>;
}

export function requestValidationResponse(
  error: unknown,
  headers: Record<string, string>,
): Response | null {
  if (!(error instanceof RequestValidationError)) return null;
  return new Response(
    JSON.stringify({ success: false, error: error.message }),
    {
      status: error.status,
      headers: { ...headers, "Content-Type": "application/json" },
    },
  );
}

export function rejectRateLimited(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
  headers: Record<string, string>,
): Response | null {
  const now = Date.now();
  const key = `${scope}:${clientAddress(req)}`;
  const bucket = rateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    pruneRateBuckets(now);
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count <= limit) return null;

  return new Response(
    JSON.stringify({
      success: false,
      error: "Muitas tentativas. Aguarde e tente novamente.",
    }),
    {
      status: 429,
      headers: {
        ...headers,
        "Content-Type": "application/json",
        "Retry-After": String(
          Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        ),
      },
    },
  );
}

export function rejectDisallowedOrigin(
  req: Request,
  headers: Record<string, string>,
  envName = "PUBLIC_FORM_ALLOWED_ORIGINS",
): Response | null {
  const configured = Deno.env.get(envName)?.trim() ?? "";
  if (!configured) {
    return new Response(
      JSON.stringify({ success: false, error: "Endpoint não configurado" }),
      {
        status: 503,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }

  const allowedOrigins = new Set(
    configured
      .split(",")
      .map((value) => normalizeOrigin(value))
      .filter((value): value is string => Boolean(value)),
  );
  const origin = normalizeOrigin(req.headers.get("origin") ?? "");
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(
      JSON.stringify({ success: false, error: "Origem não autorizada" }),
      {
        status: 403,
        headers: { ...headers, "Content-Type": "application/json" },
      },
    );
  }
  return null;
}

export function requireSecretHeader(
  req: Request,
  envName: string,
  headerName: string,
): void {
  const expected = Deno.env.get(envName)?.trim() ?? "";
  const supplied = req.headers.get(headerName)?.trim() ?? "";
  if (!expected) {
    throw new RequestValidationError(503, "Endpoint não configurado");
  }
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    throw new RequestValidationError(401, "Não autorizado");
  }
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const localHttp = url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function clientAddress(req: Request): string {
  const value = req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "unknown";
  return value.trim().slice(0, 80);
}

function assertObjectComplexity(value: unknown, depth: number): void {
  if (depth > 8) {
    throw new RequestValidationError(400, "Payload muito complexo");
  }
  if (!value || typeof value !== "object") return;

  const entries = Array.isArray(value) ? value : Object.values(value);
  if (entries.length > 256) {
    throw new RequestValidationError(400, "Payload muito complexo");
  }
  for (const child of entries) assertObjectComplexity(child, depth + 1);
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function pruneRateBuckets(now: number): void {
  if (rateBuckets.size < MAX_RATE_BUCKETS) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now || rateBuckets.size >= MAX_RATE_BUCKETS) {
      rateBuckets.delete(key);
    }
    if (rateBuckets.size < MAX_RATE_BUCKETS) break;
  }
}
