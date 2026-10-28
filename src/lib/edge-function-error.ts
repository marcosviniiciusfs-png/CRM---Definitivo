/** Extract the server error hidden by functions.invoke's generic HTTP error. */
export async function getEdgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === "object" && "context" in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === "object") {
        for (const key of ["error", "message"] as const) {
          if (key in body) {
            const message = (body as Record<string, unknown>)[key];
            if (typeof message === "string" && message.trim()) return message;
          }
        }
      }
    } catch {
      // Gateways may return an empty or non-JSON response.
    }
    return `${fallback} (HTTP ${error.context.status})`;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
