import { NextResponse } from "next/server";
import { AUTH_GATE_COOKIE } from "@/lib/auth/auth-gate";
import { clearHubCookieOptions } from "@/lib/auth/cookies";
import { MEDIA_ACCESS_COOKIE } from "@/lib/auth/media-access";

/** Clears hub demo / media cookies. Client should also call supabase.auth.signOut(). */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  const clear = clearHubCookieOptions();
  res.cookies.set(MEDIA_ACCESS_COOKIE, "", clear);
  res.cookies.set(AUTH_GATE_COOKIE, "", clear);
  res.cookies.set("mh_staff_demo", "", clear);
  return res;
}
