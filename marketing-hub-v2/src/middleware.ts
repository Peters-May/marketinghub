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
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

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
