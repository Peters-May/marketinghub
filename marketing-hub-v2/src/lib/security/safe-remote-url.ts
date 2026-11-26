import { isProductionRuntime } from "@/lib/auth/config";
import { lookup } from "dns/promises";
import { isIP } from "net";

/** Hosts that media download may proxy (plus MEDIA_DOWNLOAD_ALLOWED_HOSTS). */
const DEFAULT_ALLOWED_HOST_SUFFIXES = [
  "supabase.co",
  "google.com",
  "googleusercontent.com",
  "googleapis.com",
  "gstatic.com",
];

function configuredAllowedHosts(): string[] {
  const fromEnv = (process.env.MEDIA_DOWNLOAD_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const supabaseHost = (() => {
    try {
      const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
      return raw ? new URL(raw).hostname.toLowerCase() : "";
    } catch {
      return "";
    }
  })();
  return [...fromEnv, ...(supabaseHost ? [supabaseHost] : [])];
}

function hostAllowed(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host.endsWith(".local")) return false;

  const exactOrSuffix = configuredAllowedHosts();
  for (const allowed of exactOrSuffix) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  for (const suffix of DEFAULT_ALLOWED_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return false;
}

function ipv4Private(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

/** True when the address must not be fetched from the download proxy. */
export function isBlockedIpLiteral(host: string): boolean {
  const version = isIP(host);
  if (version === 4) {
    return ipv4Private(host.split(".").map((p) => Number(p)));
  }
  if (version === 6) {
    const normalized = host.toLowerCase();
    // Mapped IPv4 (::ffff:a.b.c.d) — check the embedded v4 address.
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice("::ffff:".length);
      if (isIP(mapped) === 4) return isBlockedIpLiteral(mapped);
      return true;
    }
    if (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    ) {
      return true;
    }
    return false;
  }
  return false;
}

/**
 * Allowlist + private-IP checks for media download proxy.
 * Rejects non-http(s), blocked literals, and hosts outside the allowlist.
 */
export function isAllowedRemoteUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    // Production: HTTPS only (Drive / Supabase are https).
    if (isProductionRuntime() && parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    if (isBlockedIpLiteral(host)) return false;
    if (!hostAllowed(host)) return false;
    return true;
  } catch {
    return false;
  }
}

/** Resolve hostname and reject private / link-local answers (DNS rebinding). */
export async function assertResolvesToPublicIp(hostname: string): Promise<boolean> {
  if (isBlockedIpLiteral(hostname)) return false;
  if (isIP(hostname)) return !isBlockedIpLiteral(hostname);
  try {
    const results = await lookup(hostname, { all: true, verbatim: true });
    if (!results.length) return false;
    return results.every((r) => !isBlockedIpLiteral(r.address));
  } catch {
    return false;
  }
}
