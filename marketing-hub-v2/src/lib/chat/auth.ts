import { timingSafeEqual } from "crypto";

function secretsMatch(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Public site key for the WordPress plugin (env CHAT_SITE_KEY). */
export function requireChatSiteKey(request: Request): boolean {
  const expected = process.env.CHAT_SITE_KEY?.trim();
  if (!expected) return false;

  const header =
    request.headers.get("x-chat-site-key")?.trim() ??
    request.headers.get("X-Chat-Site-Key")?.trim() ??
    "";
  if (header && secretsMatch(header, expected)) return true;

  const auth = request.headers.get("authorization")?.trim() ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token && secretsMatch(token, expected)) return true;
  }

  // Do not accept ?key= — it leaks into logs, proxies, and Referer headers.

  return false;
}

const CHAT_CORS_DEFAULTS = [
  "https://www.petersandmay.com",
  "https://petersandmay.com",
  "https://stg-petersmay-staging.kinsta.cloud",
  "http://localhost",
  "http://127.0.0.1",
];

export function chatCorsOrigins(): string[] {
  const raw = process.env.CHAT_CORS_ORIGINS?.trim();
  const fromEnv = raw
    ? raw
        .split(",")
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean)
    : [];
  // Always include staging + production defaults so env typos do not block the widget.
  return Array.from(new Set([...CHAT_CORS_DEFAULTS, ...fromEnv]));
}

export function isChatCorsOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const normalized = origin.replace(/\/$/, "");
  const allowed = chatCorsOrigins();
  if (allowed.includes(normalized)) return true;
  // Allow any localhost port in development
  try {
    const u = new URL(normalized);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function applyChatCors(request: Request, response: Response): Response {
  const origin = request.headers.get("origin");
  if (origin && isChatCorsOrigin(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Chat-Site-Key, Authorization"
    );
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, OPTIONS"
    );
  }
  return response;
}

export function chatCorsPreflight(request: Request): Response {
  const res = new Response(null, { status: 204 });
  return applyChatCors(request, res);
}
