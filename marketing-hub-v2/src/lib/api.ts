import { NextResponse } from "next/server";
import { canAccessEnquiries, isStaffSession } from "@/lib/auth/roles";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(message = "Forbidden") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireStaff(): Promise<
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: unauthorized() };
  }
  // External / media_guest and SEO cannot call general staff APIs.
  if (!isStaffSession(user.role)) {
    return { user: null, error: forbidden() };
  }
  return { user, error: null };
}

/** Admin, Member, or SEO — Enquiries list/update only. */
export async function requireEnquiriesAccess(): Promise<
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: unauthorized() };
  }
  if (!canAccessEnquiries(user.role)) {
    return { user: null, error: forbidden() };
  }
  return { user, error: null };
}

/** Anyone allowed inside /app (staff or SEO), e.g. My details. */
export async function requireAppUser(): Promise<
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return { user: null, error: unauthorized() };
  }
  if (user.role === "media_guest") {
    return { user: null, error: forbidden() };
  }
  return { user, error: null };
}

export async function requireAdmin(): Promise<
  | { user: SessionUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getSessionUser();
  if (!user) {
    return {
      user: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (user.role !== "admin") {
    return {
      user: null,
      error: NextResponse.json({ error: "Admin required" }, { status: 403 }),
    };
  }
  return { user, error: null };
}

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  return NextResponse.json({ error: message, ...extra }, { status });
}
