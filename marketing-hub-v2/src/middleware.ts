import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  allowDemoAuth,
  hasSupabaseConfig,
  productionAuthMisconfigured,
} from "@/lib/auth/config";
import {
  fetchWithAuthTimeout,
  getAuthUser,
  isTransientAuthError,
} from "@/lib/auth/auth-fetch";
import {
  AUTH_GATE_COOKIE,
  AUTH_GATE_GRACE_MS,
  AUTH_GATE_HEADER,
  authGateFreshness,
  authGateSecret,
  issueAuthGateToken,
  issueAuthOutageMark,
  readAuthGateToken,
  type AuthGate,
} from "@/lib/auth/auth-gate";
import { hubCookieOptions, clearHubCookieOptions } from "@/lib/auth/cookies";
import {
  hubRoleFromAuthMetadata,
  isSeoAllowedAppPath,
} from "@/lib/auth/roles";

function authUnavailableResponse() {
  const html = `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Marketing Hub is temporarily unavailable</title>
</head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#E3E6E9;color:#0B2545;font-family:Arial,sans-serif">
  <main style="max-width:28rem;padding:2rem">
    <h1 style="font-size:1.5rem;line-height:1.3;margin:0 0 0.75rem">Sign-in check is taking too long</h1>
    <p style="line-height:1.5;margin:0 0 1rem">The hub could not confirm your session because the sign-in service did not respond. Refresh this page in a moment.</p>
    <p style="margin:0"><a href="" style="color:#007DC5">Try again</a></p>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "30",
      "cache-control": "no-store",
    },
  });
}

function describeAuthError(error: unknown) {
  if (!error || typeof error !== "object") return String(error);
  const failure = error as { name?: string; status?: number; message?: string };
  return [failure.name, failure.status, failure.message].filter((part) => part != null).join(" ");
}

function continueRequest(
  request: NextRequest,
  source: NextResponse,
  gateToken: string | null,
  outageMark: string | null = null
) {
  const headers = new Headers(request.headers);
  if (gateToken) headers.set(AUTH_GATE_HEADER, gateToken);
  else headers.delete(AUTH_GATE_HEADER);
  if (outageMark) headers.set("x-mh-auth-outage", outageMark);
  else headers.delete("x-mh-auth-outage");
  const response = NextResponse.next({ request: { headers } });
  source.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  if (gateToken) {
    response.cookies.set(
      AUTH_GATE_COOKIE,
      gateToken,
      hubCookieOptions(Math.ceil(AUTH_GATE_GRACE_MS / 1000))
    );
  }
  return response;
}

function redirectWithCookies(url: URL, source: NextResponse, clearGate = false) {
  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => {
    response.cookies.set(cookie);
  });
  if (clearGate) {
    response.cookies.set(AUTH_GATE_COOKIE, "", clearHubCookieOptions());
  }
  return response;
}

function roleResponse(
  request: NextRequest,
  source: NextResponse,
  role: string,
  gateToken: string | null,
  outageMark: string | null = null
) {
  if (role === "seo" && !isSeoAllowedAppPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/enquiries";
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    const continued = continueRequest(request, source, gateToken, outageMark);
    continued.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }
  return continueRequest(request, source, gateToken, outageMark);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAppRoute = pathname.startsWith("/app");
  if (!isAppRoute) {
    return NextResponse.next();
  }

  if (productionAuthMisconfigured()) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "auth_misconfigured");
    return NextResponse.redirect(url);
  }

  // Demo mode only outside production.
  if (allowDemoAuth()) {
    const response = NextResponse.next();
    const opts = hubCookieOptions();
    response.cookies.set("mh_staff_demo", "1", opts);
    response.cookies.set("mh_media_access", "1", opts);
    return response;
  }

  if (!hasSupabaseConfig()) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "supabase_not_configured");
    return NextResponse.redirect(url);
  }

  const secret = authGateSecret();
  const gate = secret
    ? await readAuthGateToken(request.cookies.get(AUTH_GATE_COOKIE)?.value, secret)
    : null;

  if (gate && authGateFreshness(gate) === "fresh") {
    return roleResponse(request, NextResponse.next({ request }), gate.role, null);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
      global: {
        fetch: fetchWithAuthTimeout,
      },
    }
  );

  try {
    const result = await getAuthUser(() => supabase.auth.getUser());
    if (isTransientAuthError(result.error)) {
      console.error("[middleware] auth check unavailable", describeAuthError(result.error));
      if (gate && secret) {
        return roleResponse(
          request,
          response,
          gate.role,
          null,
          await issueAuthOutageMark(secret)
        );
      }
      return authUnavailableResponse();
    }
    const user = result.data.user;
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return redirectWithCookies(url, response, true);
    }

    const nextGate: AuthGate = {
      userId: user.id,
      role: hubRoleFromAuthMetadata(user),
      email: user.email ?? "",
      fullName:
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "Staff",
      issuedAt: Date.now(),
    };
    const gateToken = secret ? await issueAuthGateToken(nextGate, secret) : null;
    return roleResponse(request, response, nextGate.role, gateToken);
  } catch (error) {
    console.error("[middleware] auth check failed", describeAuthError(error));
    if (gate && secret) {
      return roleResponse(
        request,
        response,
        gate.role,
        null,
        await issueAuthOutageMark(secret)
      );
    }
    return authUnavailableResponse();
  }
}

export const config = {
  matcher: ["/app/:path*"],
};
