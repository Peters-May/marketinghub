import { NextResponse } from "next/server";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Best-effort per-instance rate limit for public endpoints (serverless-safe enough for abuse mitigation). */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: true } | { ok: false; response: NextResponse } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      ),
    };
  }

  bucket.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(request: Request): string {
  // WordPress chat proxy forwards the browser IP (spoofable if calling Hub
  // directly; still better than collapsing all visitors on the WP egress IP).
  const fromWp = request.headers.get("x-pm-client-ip")?.trim();
  if (fromWp && /^[\d.:a-fA-F]+$/.test(fromWp)) return fromWp;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function rateLimitPublic(request: Request, route: string, limit = 30) {
  const ip = clientIpFromRequest(request);
  return checkRateLimit(`${route}:${ip}`, limit, 60_000);
}
