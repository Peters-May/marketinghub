import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import {
  allowDemoAuth,
  hasSupabaseConfig,
  productionAuthMisconfigured,
} from "@/lib/auth/config";
import { hubCookieOptions } from "@/lib/auth/cookies";
import {
  hubRoleFromAuthMetadata,
  isSeoAllowedAppPath,
} from "@/lib/auth/roles";

/** Stay well under Vercel's 25s middleware limit when Supabase stalls. */
const AUTH_CHECK_TIMEOUT_MS = 8_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_CHECK_TIMEOUT_MS);
  const upstream = init?.signal;
  if (upstream?.aborted) controller.abort();
  else upstream?.addEventListener("abort", () => controller.abort(), { once: true });
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}

function isTransientAuthError(error: { name?: string; status?: number; message?: string } | null) {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError" || error.name === "AbortError") return true;
  if (typeof error.status === "number" && (error.status === 0 || error.status >= 500)) return true;
  return /timeout|aborted|fetch failed|network/i.test(error.message ?? "");
}

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
        fetch: fetchWithTimeout,
      },
    }
  );

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  try {
    const result = await supabase.auth.getUser();
    if (isTransientAuthError(result.error)) {
      console.error("[middleware] auth check unavailable", result.error?.message);
      return authUnavailableResponse();
    }
    user = result.data.user;
  } catch (error) {
    console.error("[middleware] auth check failed", error);
    return authUnavailableResponse();
  }

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hubRoleFromAuthMetadata(user) === "seo" && !isSeoAllowedAppPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/enquiries";
    url.search = "";
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value);
    });
    return redirectResponse;
  }

  return response;
}

export const config = {
  matcher: ["/app/:path*"],
};
