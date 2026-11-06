/**
 * HTTP plumbing for the SAVO AI function.
 *
 * There are no cookies and no credentials in URLs: the only credential this
 * function accepts is the caller's Supabase access token in the Authorization
 * header, which it verifies against the auth server. That is why a wildcard
 * CORS origin is acceptable here — a hostile page cannot make the browser
 * attach a token it does not already have.
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json; charset=utf-8" },
  });
}

export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_configured"
  | "rate_limited"
  | "provider_auth"
  | "provider_model"
  | "provider_unavailable"
  | "timeout"
  | "internal";

export function fail(code: ErrorCode, message: string, status = 400): Response {
  return json({ error: { code, message } }, status);
}

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Reads a JSON body with a hard size ceiling, so a huge payload is refused early. */
export async function readJson(req: Request, maxBytes = 32_000): Promise<unknown> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) {
    throw new HttpError("bad_request", "Request body is too large.", 413);
  }
  const text = await req.text();
  if (text.length > maxBytes) {
    throw new HttpError("bad_request", "Request body is too large.", 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("bad_request", "Request body must be JSON.", 400);
  }
}

export class HttpError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) return fail(error.code, error.message, error.status);
  console.error("[savo-ai] unhandled", error instanceof Error ? error.message : String(error));
  return fail("internal", "SAVO AI hit an unexpected error. Try again.", 500);
}
