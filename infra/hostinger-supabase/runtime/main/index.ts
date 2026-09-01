import * as jose from "jsr:@panva/jose@6";

declare const EdgeRuntime: {
  userWorkers: {
    create(options: {
      servicePath: string;
      memoryLimitMb: number;
      workerTimeoutMs: number;
      noModuleCache: boolean;
      importMapPath: string | null;
      envVars: string[][];
    }): Promise<{ fetch(request: Request): Promise<Response> }>;
  };
};

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const SUPABASE_JWKS = parseJwks(Deno.env.get("SUPABASE_JWKS"));
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";
const JWT_EXEMPT_FUNCTIONS = new Set(
  (Deno.env.get("EDGE_JWT_EXEMPT_FUNCTIONS") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);
const DISABLED_FUNCTIONS = new Set(
  (Deno.env.get("EDGE_DISABLED_FUNCTIONS") ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

console.log(
  `CRM edge runtime started (verify_jwt=${VERIFY_JWT}, exemptions=${JWT_EXEMPT_FUNCTIONS.size}, disabled=${DISABLED_FUNCTIONS.size})`,
);

export function parseJwks(raw: string | undefined): jose.JSONWebKeySet | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed?.keys && Array.isArray(parsed.keys)
      ? parsed as jose.JSONWebKeySet
      : null;
  } catch {
    return null;
  }
}

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Missing authorization header");

  const [scheme, token, extra] = authHeader.trim().split(/\s+/);
  if (scheme.toLowerCase() !== "bearer" || !token || extra) {
    throw new Error("Authorization header must be Bearer {token}");
  }

  return token;
}

async function verifyLegacyJwt(jwt: string): Promise<jose.JWTPayload | null> {
  if (!JWT_SECRET) {
    console.error("JWT_SECRET is unavailable for HS256 verification");
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(
      jwt,
      new TextEncoder().encode(JWT_SECRET),
      {
        algorithms: ["HS256"],
      },
    );
    return payload;
  } catch (error) {
    console.error("Legacy JWT verification failed", error);
    return null;
  }
}

async function verifyAsymmetricJwt(
  jwt: string,
): Promise<jose.JWTPayload | null> {
  if (!SUPABASE_JWKS) {
    console.error("SUPABASE_JWKS is unavailable for asymmetric verification");
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(
      jwt,
      jose.createLocalJWKSet(SUPABASE_JWKS),
      {
        algorithms: ["ES256", "RS256"],
      },
    );
    return payload;
  } catch (error) {
    console.error("Asymmetric JWT verification failed", error);
    return null;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasAuthorizedRole(payload: jose.JWTPayload | null): boolean {
  if (!payload) return false;
  if (payload.role === "service_role") return true;

  return payload.role === "authenticated" &&
    typeof payload.sub === "string" &&
    UUID_PATTERN.test(payload.sub);
}

async function isValidJwt(jwt: string): Promise<boolean> {
  const { alg } = jose.decodeProtectedHeader(jwt);

  if (alg === "HS256") return hasAuthorizedRole(await verifyLegacyJwt(jwt));
  if (alg === "ES256" || alg === "RS256") {
    return hasAuthorizedRole(await verifyAsymmetricJwt(jwt));
  }

  return false;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ msg: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const serviceName = new URL(req.url).pathname.split("/")[1];
  if (!serviceName) return jsonError(400, "Missing function name in request");
  if (DISABLED_FUNCTIONS.has(serviceName)) {
    return jsonError(404, "Function is disabled");
  }

  const requiresJwt = VERIFY_JWT && !JWT_EXEMPT_FUNCTIONS.has(serviceName);
  if (req.method !== "OPTIONS" && requiresJwt) {
    try {
      if (!await isValidJwt(getAuthToken(req))) {
        return jsonError(401, "Invalid JWT");
      }
    } catch (error) {
      console.error("JWT validation rejected request", error);
      return jsonError(401, "Invalid or missing JWT");
    }
  }

  const servicePath = `/home/deno/functions/${serviceName}`;
  const envObject = Deno.env.toObject();
  const envVars = Object.keys(envObject).map((key) => [key, envObject[key]]);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs: 60_000,
      noModuleCache: false,
      importMapPath: null,
      envVars,
    });
    return await worker.fetch(req);
  } catch (error) {
    console.error(`Function ${serviceName} failed to start or execute`, error);
    return jsonError(500, "Edge function execution failed");
  }
});
