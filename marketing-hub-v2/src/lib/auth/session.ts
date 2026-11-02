import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  fetchWithAuthTimeout,
  getAuthUser,
  isTransientAuthError,
} from "@/lib/auth/auth-fetch";
import {
  AUTH_GATE_COOKIE,
  AUTH_GATE_HEADER,
  authGateFreshness,
  authGateSecret,
  hasAuthOutageMark,
  readAuthGateToken,
  type AuthGate,
} from "@/lib/auth/auth-gate";
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

async function readVerifiedGate(
  request?: NextRequest
): Promise<{ gate: AuthGate | null; outage: boolean }> {
  const headerStore = request ? request.headers : await headers();
  const secret = authGateSecret();
  const outage = secret
    ? await hasAuthOutageMark(headerStore.get("x-mh-auth-outage"), secret)
    : false;
  if (!secret) return { gate: null, outage };
  const token = request
    ? headerStore.get(AUTH_GATE_HEADER) ?? request.cookies.get(AUTH_GATE_COOKIE)?.value
    : headerStore.get(AUTH_GATE_HEADER) ?? (await cookies()).get(AUTH_GATE_COOKIE)?.value;
  return { gate: await readAuthGateToken(token, secret), outage };
}

function sessionFromGate(gate: AuthGate): SessionUser {
  return {
    id: gate.userId,
    email: gate.email,
    full_name: gate.fullName || gate.email || "Staff",
    role: "media_guest",
  };
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

  const { gate, outage } = await readVerifiedGate(request);
  if (gate && (authGateFreshness(gate) === "fresh" || outage)) {
    return withProfileRole(sessionFromGate(gate));
  }

  try {
    const result = await loadAuthenticatedUser(request);
    if (isTransientAuthError(result.error)) {
      console.error("[auth] sign-in check unavailable");
      if (gate) return withProfileRole(sessionFromGate(gate));
      return null;
    }
    const user = result.data.user;
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
  } catch (error) {
    if (isTransientAuthError(error) && gate) {
      console.error("[auth] sign-in check failed");
      return withProfileRole(sessionFromGate(gate));
    }
    throw error;
  }
}

async function loadAuthenticatedUser(request?: NextRequest) {
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
        global: {
          fetch: fetchWithAuthTimeout,
        },
      }
    );
    const result = await getAuthUser(() => supabase.auth.getUser());
    void response;
    return result;
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient({ fetch: fetchWithAuthTimeout });
  return getAuthUser(() => supabase.auth.getUser());
}
