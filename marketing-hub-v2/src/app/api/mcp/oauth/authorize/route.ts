import { NextRequest, NextResponse } from "next/server";
import { isStaffSession } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { mcpCorsPreflight } from "@/lib/mcp/cors";
import {
  createAuthorizationCode,
  getMcpOAuthClientId,
  isAllowedRedirectUri,
  isMcpConfigured,
  verifyMcpClient,
} from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

function errorPage(message: string, status = 400) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:system-ui;padding:2rem"><h1>Marketing Hub</h1><p>${message}</p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function OPTIONS(request: NextRequest) {
  return mcpCorsPreflight(request);
}

export async function GET(request: NextRequest) {
  if (!isMcpConfigured()) {
    return errorPage("MCP OAuth is not configured.", 503);
  }

  const params = request.nextUrl.searchParams;
  const responseType = params.get("response_type")?.trim();
  const clientId = params.get("client_id")?.trim() ?? "";
  const redirectUri = params.get("redirect_uri")?.trim() ?? "";
  const state = params.get("state")?.trim() ?? "";
  const codeChallenge = params.get("code_challenge")?.trim() ?? undefined;
  const codeChallengeMethod =
    params.get("code_challenge_method")?.trim() ?? undefined;

  if (responseType !== "code") {
    return errorPage("Unsupported response_type.");
  }
  if (!verifyMcpClient(clientId)) {
    return errorPage("Unknown OAuth client.");
  }
  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return errorPage("Invalid redirect URI.");
  }

  const user = await getSessionUser();
  if (!user || !isStaffSession(user.role)) {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(login, 302);
  }

  const approve = params.get("approve") === "1";
  if (!approve) {
    const next = new URL(request.url);
    next.searchParams.set("approve", "1");
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Connect ChatGPT to Marketing Hub</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 32rem; margin: 3rem auto; padding: 0 1rem; color: #0f172a; }
      h1 { font-size: 1.35rem; }
      p { line-height: 1.5; color: #475569; }
      button { background: #0f4c5c; color: white; border: 0; border-radius: 0.5rem; padding: 0.75rem 1rem; font-size: 1rem; cursor: pointer; }
    </style>
  </head>
  <body>
    <h1>Connect ChatGPT to Marketing Hub</h1>
    <p>Signed in as <strong>${escapeAttr(user.full_name || user.email)}</strong>.</p>
    <p>Allow ChatGPT to use Hub tools: social drafts, themes, events, and the WhatsApp enquiry tracker.</p>
    <form method="get" action="${escapeAttr(next.pathname)}">
      ${Array.from(next.searchParams.entries())
        .map(
          ([key, value]) =>
            `<input type="hidden" name="${escapeAttr(key)}" value="${escapeAttr(value)}" />`
        )
        .join("")}
      <button type="submit">Allow access</button>
    </form>
  </body>
</html>`;
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const code = createAuthorizationCode({
    clientId: clientId || getMcpOAuthClientId(),
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
  });

  // 302 (not 303) — ChatGPT/Claude connectors are picky about consent redirects.
  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  return NextResponse.redirect(target, 302);
}
