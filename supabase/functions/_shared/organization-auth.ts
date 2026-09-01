export class RequestAuthorizationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RequestAuthorizationError";
    this.status = status;
  }
}

function getBearerToken(req: Request): string {
  const header = req.headers.get("authorization")?.trim() ?? "";
  const [scheme, token, extra] = header.split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) {
    throw new RequestAuthorizationError(401, "Não autorizado");
  }
  return token;
}

export async function requireOrganizationMember(
  req: Request,
  adminClient: any,
  organizationId: string,
  allowedRoles?: readonly string[],
) {
  if (!organizationId) {
    throw new RequestAuthorizationError(400, "Organização não informada");
  }

  const token = getBearerToken(req);
  const { data: authData, error: authError } = await adminClient.auth.getUser(
    token,
  );
  const user = authData?.user;
  if (authError || !user) {
    throw new RequestAuthorizationError(401, "Token inválido ou expirado");
  }

  const { data: membership, error: membershipError } = await adminClient
    .from("organization_members")
    .select("organization_id, role, is_active")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new RequestAuthorizationError(403, "Acesso negado à organização");
  }
  if (allowedRoles && !allowedRoles.includes(membership.role)) {
    throw new RequestAuthorizationError(403, "Permissão insuficiente");
  }

  return { user, membership, token };
}

export async function requireSuperAdmin(req: Request, adminClient: any) {
  const token = getBearerToken(req);
  const { data: authData, error: authError } = await adminClient.auth.getUser(
    token,
  );
  const user = authData?.user;
  if (authError || !user) {
    throw new RequestAuthorizationError(401, "Token invalido ou expirado");
  }

  const { data: role, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "super_admin")
    .maybeSingle();

  if (roleError || !role) {
    throw new RequestAuthorizationError(
      403,
      "Acesso restrito a super administradores",
    );
  }

  return { user, token };
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

export function requireInternalServiceRole(req: Request): void {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!expected) {
    throw new RequestAuthorizationError(
      500,
      "Autenticação interna não configurada",
    );
  }

  const supplied = getBearerToken(req);
  if (!timingSafeEqual(supplied, expected)) {
    throw new RequestAuthorizationError(401, "Não autorizado");
  }
}

export function isInternalServiceRoleRequest(req: Request): boolean {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!expected) return false;

  try {
    return timingSafeEqual(getBearerToken(req), expected);
  } catch {
    return false;
  }
}

export function authorizationErrorResponse(
  error: unknown,
  corsHeaders: Record<string, string>,
): Response | null {
  if (!(error instanceof RequestAuthorizationError)) return null;
  return new Response(JSON.stringify({ error: error.message }), {
    status: error.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
