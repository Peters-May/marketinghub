/** Request header carrying a gate token issued by middleware in this request. */
export const AUTH_GATE_HEADER = "x-mh-auth-gate";

/** HttpOnly cookie remembering a sign-in check that already succeeded. */
export const AUTH_GATE_COOKIE = "mh_auth_gate";

/** Skip the sign-in service while a recent check is still fresh. */
export const AUTH_GATE_FRESH_MS = 60_000;

/** Keep an already signed-in person in the hub during a short auth outage. */
export const AUTH_GATE_GRACE_MS = 10 * 60_000;

export type AuthGate = {
  userId: string;
  role: string;
  email: string;
  fullName: string;
  issuedAt: number;
};

export type AuthGateFreshness = "fresh" | "grace" | "expired";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authGateSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return secret || null;
}

export function authGateFreshness(gate: AuthGate, now = Date.now()): AuthGateFreshness {
  const age = now - gate.issuedAt;
  if (!Number.isFinite(age) || age < 0) return "expired";
  if (age < AUTH_GATE_FRESH_MS) return "fresh";
  if (age < AUTH_GATE_GRACE_MS) return "grace";
  return "expired";
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return bytesToBase64Url(signature);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

const OUTAGE_PAYLOAD = "auth-outage";

/** Marks this request as already spared a live sign-in check. Not forgeable from the browser. */
export async function issueAuthOutageMark(secret: string) {
  return sign(OUTAGE_PAYLOAD, secret);
}

export async function hasAuthOutageMark(mark: string | null, secret: string) {
  if (!mark) return false;
  return safeEqual(mark, await sign(OUTAGE_PAYLOAD, secret));
}

function clampText(value: string, max: number) {
  return value.replace(/[\r\n]/g, " ").slice(0, max);
}

export async function issueAuthGateToken(gate: AuthGate, secret: string): Promise<string> {
  const payload = [
    gate.userId,
    clampText(gate.role, 32),
    clampText(gate.email, 254),
    clampText(gate.fullName, 120),
    String(gate.issuedAt),
  ]
    .map((part) => encodeURIComponent(part))
    .join("|");
  return `${payload}|${await sign(payload, secret)}`;
}

export async function readAuthGateToken(
  token: string | null | undefined,
  secret: string
): Promise<AuthGate | null> {
  if (!token || !secret) return null;
  const separator = token.lastIndexOf("|");
  if (separator <= 0) return null;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!signature || !safeEqual(signature, await sign(payload, secret))) return null;

  const parts = payload.split("|");
  if (parts.length !== 5) return null;
  let userId = "";
  let role = "";
  let email = "";
  let fullName = "";
  let issuedAt = Number.NaN;
  try {
    userId = decodeURIComponent(parts[0] ?? "");
    role = decodeURIComponent(parts[1] ?? "");
    email = decodeURIComponent(parts[2] ?? "");
    fullName = decodeURIComponent(parts[3] ?? "");
    issuedAt = Number(decodeURIComponent(parts[4] ?? ""));
  } catch {
    return null;
  }
  if (!UUID.test(userId) || !Number.isFinite(issuedAt)) return null;
  const gate = { userId, role, email, fullName, issuedAt };
  if (authGateFreshness(gate) === "expired") return null;
  return gate;
}
