import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  allowDemoAuth,
  DEMO_STAFF,
  productionAuthMisconfigured,
} from "@/lib/auth/config";
import type { UserRole } from "@/lib/types";
import { hubRoleToSessionRole } from "@/lib/auth/roles";
import { getProfileRoleForUser } from "@/lib/supabase/hub-users";

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
};

async function withProfileRole(base: SessionUser): Promise<SessionUser> {
  const hubRole = await getProfileRoleForUser(base.id);
  if (!hubRole) {
    // Fail closed: authenticated user without a profile cannot access staff APIs.
    console.warn("[auth] No profile for user — defaulting to media_guest", {
      userId: base.id,
      email: base.email,
    });
    return { ...base, role: "media_guest" };
  }
  return { ...base, role: hubRoleToSessionRole(hubRole) };
}

export async function getSessionUser(
  request?: NextRequest
): Promise<SessionUser | null> {
  if (productionAuthMisconfigured()) {
    console.error(
      "[auth] Production misconfigured: AUTH_BYPASS on or Supabase env missing"
    );
    return null;
  }

  // Local / preview demo only — never in production.
  if (allowDemoAuth()) {
    return DEMO_STAFF;
  }

  if (request) {
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
    if (!user) return null;
    return withProfileRole({
      id: user.id,
      email: user.email ?? "",
      full_name:
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "Staff",
      role: "media_guest",
    });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return withProfileRole({
    id: user.id,
    email: user.email ?? "",
    full_name:
      (user.user_metadata?.full_name as string | undefined) ??
      user.email ??
      "Staff",
    role: "media_guest",
  });
}
