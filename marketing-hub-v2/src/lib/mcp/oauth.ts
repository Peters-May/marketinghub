import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

/** 24h access tokens — fewer ChatGPT reconnect races than 1h expiry. */
const ACCESS_TOKEN_TTL_SEC = 60 * 60 * 24;
/** Sliding refresh window. */
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 90;
const AUTH_CODE_TTL_SEC = 10 * 60;

type TokenPayload = {
  type: "access" | "code" | "refresh";
  clientId: string;
  scope: string;
  exp: number;
  redirectUri?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Buffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function signingSecret(): string | null {
  return getMcpOAuthClientSecret() ?? getMcpApiKey();
}

function signPayload(payload: TokenPayload): string {
  const secret = signingSecret();
  if (!secret) throw new Error("MCP OAuth is not configured");

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  return `${header}.${body}.${base64UrlEncode(signature)}`;
}

export function verifySignedToken(token: string): TokenPayload | null {
  const secret = signingSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const expected = createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest();
  let actual: Buffer;
  try {
    actual = base64UrlDecode(signature);
  } catch {
    return null;
  }
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      base64UrlDecode(body).toString("utf8")
    ) as TokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function secretsMatch(provided: string, expected: string): boolean {
  try {
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Primary MCP key (ChatGPT OAuth client secret default). */
export function getMcpApiKey(): string | null {
  const key = process.env.HUB_MCP_API_KEY?.trim();
  return key || null;
}

/** All static Bearer / x-hub-mcp-key values accepted for tool calls. */
export function getMcpApiKeys(): string[] {
  const keys = new Set<string>();
  const primary = getMcpApiKey();
  if (primary) keys.add(primary);
  const grok = process.env.HUB_MCP_GROK_API_KEY?.trim();
  if (grok) keys.add(grok);
  const extra = process.env.HUB_MCP_API_KEYS?.trim();
  if (extra) {
    for (const part of extra.split(",")) {
      const k = part.trim();
      if (k) keys.add(k);
    }
  }
  return [...keys];
}

export function getMcpOAuthClientId(): string {
  return (
    process.env.HUB_MCP_OAUTH_CLIENT_ID?.trim() || "marketing-hub-chatgpt"
  );
}

export function getMcpOAuthClientSecret(): string | null {
  const secret = process.env.HUB_MCP_OAUTH_CLIENT_SECRET?.trim();
  if (secret) return secret;
  return getMcpApiKey();
}

export function isMcpConfigured(): boolean {
  return Boolean(signingSecret());
}

export function getMcpPublicOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;

  if (request) {
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
    if (forwardedHost) {
      return `${forwardedProto}://${forwardedHost.split(",")[0].trim()}`;
    }
    return new URL(request.url).origin;
  }

  return "http://localhost:3001";
}

export function getMcpOAuthIssuer(request?: Request): string {
  return `${getMcpPublicOrigin(request)}/api/mcp/oauth`;
}

export function getMcpResourceUrl(
  request?: Request,
  resourcePath = "/api/mcp"
): string {
  const path = resourcePath.startsWith("/") ? resourcePath : `/${resourcePath}`;
  return `${getMcpPublicOrigin(request)}${path.replace(/\/$/, "")}`;
}

export function verifyMcpClient(
  clientId: string,
  clientSecret?: string | null
): boolean {
  if (!isMcpConfigured()) return false;
  if (!secretsMatch(clientId, getMcpOAuthClientId())) return false;
  // PKCE public clients may omit secret on authorize; token exchange should send it.
  if (clientSecret == null || clientSecret === "") return true;
  const expected = getMcpOAuthClientSecret();
  return Boolean(expected && secretsMatch(clientSecret, expected));
}

function issueRefreshToken(clientId: string, scope: string) {
  const exp = Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SEC;
  return signPayload({
    type: "refresh",
    clientId,
    scope,
    exp,
  });
}

export function issueAccessToken(clientId: string, scope = "mcp:tools") {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SEC;
  const token = signPayload({
    type: "access",
    clientId,
    scope,
    exp,
  });
  return {
    access_token: token,
    // Lowercase matches Cloudflare MCP reference; some clients are picky.
    token_type: "bearer" as const,
    expires_in: ACCESS_TOKEN_TTL_SEC,
    scope,
    refresh_token: issueRefreshToken(clientId, scope),
  };
}

export function createAuthorizationCode(input: {
  clientId: string;
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}) {
  const exp = Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SEC;
  return signPayload({
    type: "code",
    clientId: input.clientId,
    scope: "mcp:tools",
    exp,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
  });
}

function pkceS256(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

export function exchangeAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret?: string | null;
  redirectUri: string;
  codeVerifier?: string | null;
}) {
  if (!verifyMcpClient(input.clientId, input.clientSecret)) {
    return { error: "invalid_client" as const };
  }

  const payload = verifySignedToken(input.code);
  if (!payload || payload.type !== "code") {
    return { error: "invalid_grant" as const };
  }
  if (payload.clientId !== input.clientId) {
    return { error: "invalid_grant" as const };
  }
  if (payload.redirectUri !== input.redirectUri) {
    return { error: "invalid_grant" as const };
  }

  if (payload.codeChallenge) {
    const method = payload.codeChallengeMethod ?? "S256";
    if (!input.codeVerifier) return { error: "invalid_grant" as const };
    const challenge =
      method === "plain" ? input.codeVerifier : pkceS256(input.codeVerifier);
    if (challenge !== payload.codeChallenge) {
      return { error: "invalid_grant" as const };
    }
  }

  return { token: issueAccessToken(input.clientId, payload.scope) };
}

export function exchangeRefreshToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string | null;
}) {
  if (!verifyMcpClient(input.clientId, input.clientSecret)) {
    return { error: "invalid_client" as const };
  }

  const payload = verifySignedToken(input.refreshToken);
  if (!payload || payload.type !== "refresh") {
    return { error: "invalid_grant" as const };
  }
  if (payload.clientId !== input.clientId) {
    return { error: "invalid_grant" as const };
  }

  // Issue a fresh access + refresh pair (sliding window). Old refresh stays
  // valid until its own expiry so concurrent retries don't strand the client.
  return { token: issueAccessToken(input.clientId, payload.scope) };
}

export function verifyMcpAccessToken(
  bearerToken?: string | null
): { clientId: string; scope: string } | null {
  if (!bearerToken) return null;
  const token = bearerToken.trim();
  if (!token) return null;

  for (const apiKey of getMcpApiKeys()) {
    if (secretsMatch(token, apiKey)) {
      return { clientId: getMcpOAuthClientId(), scope: "mcp:tools" };
    }
  }

  const payload = verifySignedToken(token);
  if (!payload || payload.type !== "access") return null;
  return { clientId: payload.clientId, scope: payload.scope };
}

export function isAllowedRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" && url.hostname !== "localhost") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return (
      host === "chatgpt.com" ||
      host.endsWith(".chatgpt.com") ||
      host === "openai.com" ||
      host.endsWith(".openai.com") ||
      host === "claude.ai" ||
      host.endsWith(".claude.ai") ||
      host === "grok.com" ||
      host.endsWith(".grok.com") ||
      host === "x.ai" ||
      host.endsWith(".x.ai") ||
      host === "localhost"
    );
  } catch {
    return false;
  }
}

export function oauthAuthorizationServerMetadata(request?: Request) {
  const issuer = getMcpOAuthIssuer(request);
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    response_types_supported: ["code"],
    grant_types_supported: [
      "authorization_code",
      "refresh_token",
      "client_credentials",
    ],
    token_endpoint_auth_methods_supported: [
      "client_secret_post",
      "client_secret_basic",
      "none",
    ],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp:tools"],
  };
}

export function randomStateToken(): string {
  return base64UrlEncode(randomBytes(24));
}
