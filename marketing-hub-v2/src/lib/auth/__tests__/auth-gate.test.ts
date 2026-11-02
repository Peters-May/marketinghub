import { describe, expect, it } from "vitest";
import {
  AUTH_GATE_FRESH_MS,
  AUTH_GATE_GRACE_MS,
  authGateFreshness,
  issueAuthGateToken,
  readAuthGateToken,
  type AuthGate,
} from "@/lib/auth/auth-gate";
import { isTransientAuthError } from "@/lib/auth/auth-fetch";

const SECRET = "test-gate-secret";
const NOW = Date.now();

const gate: AuthGate = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "seo",
  email: "seo@petersandmay.com",
  fullName: "SEO Person",
  issuedAt: NOW,
};

describe("auth gate", () => {
  it("round-trips a signed token", async () => {
    const token = await issueAuthGateToken(gate, SECRET);
    await expect(readAuthGateToken(token, SECRET)).resolves.toEqual(gate);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await issueAuthGateToken(gate, SECRET);
    await expect(readAuthGateToken(token, "other-secret")).resolves.toBeNull();
  });

  it("rejects a tampered role", async () => {
    const token = await issueAuthGateToken(gate, SECRET);
    const [payload, signature] = [token.slice(0, token.lastIndexOf("|")), token.slice(token.lastIndexOf("|") + 1)];
    const parts = payload.split("|");
    parts[1] = encodeURIComponent("admin");
    const tampered = `${parts.join("|")}|${signature}`;
    await expect(readAuthGateToken(tampered, SECRET)).resolves.toBeNull();
  });

  it("treats a recent check as fresh and an older one as grace", () => {
    expect(authGateFreshness(gate, NOW)).toBe("fresh");
    expect(authGateFreshness(gate, NOW + AUTH_GATE_FRESH_MS - 1)).toBe("fresh");
    expect(authGateFreshness(gate, NOW + AUTH_GATE_FRESH_MS)).toBe("grace");
    expect(authGateFreshness(gate, NOW + AUTH_GATE_GRACE_MS - 1)).toBe("grace");
    expect(authGateFreshness(gate, NOW + AUTH_GATE_GRACE_MS)).toBe("expired");
  });

  it("rejects a plain outage flag that was not signed", async () => {
    const { hasAuthOutageMark, issueAuthOutageMark } = await import("@/lib/auth/auth-gate");
    const mark = await issueAuthOutageMark(SECRET);
    await expect(hasAuthOutageMark(mark, SECRET)).resolves.toBe(true);
    await expect(hasAuthOutageMark("1", SECRET)).resolves.toBe(false);
  });

  it("drops a gate that is past the grace window", async () => {
    const token = await issueAuthGateToken(
      { ...gate, issuedAt: NOW - AUTH_GATE_GRACE_MS },
      SECRET
    );
    await expect(readAuthGateToken(token, SECRET)).resolves.toBeNull();
  });
});

describe("transient auth errors", () => {
  it("recognises a hung or unavailable sign-in service", () => {
    expect(isTransientAuthError({ name: "AbortError", message: "This operation was aborted" })).toBe(true);
    expect(isTransientAuthError({ name: "AuthRetryableFetchError", status: 521, message: '{"headers":{}}' })).toBe(true);
    expect(isTransientAuthError({ name: "AuthApiError", status: 401, message: "invalid claim" })).toBe(false);
    expect(isTransientAuthError(null)).toBe(false);
  });
});
