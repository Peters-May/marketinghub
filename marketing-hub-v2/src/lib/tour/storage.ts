/** Persist product-tour completion so it only shows until dismissed. */

import type { UserRole } from "@/lib/types";

export type TourAudience = "admin" | "member" | "seo" | "external";

const PREFIX = "mh_tour_done_v1";

function key(audience: TourAudience, userKey: string) {
  const safe = userKey.trim().toLowerCase() || "anon";
  return `${PREFIX}:${audience}:${safe}`;
}

export function isTourCompleted(audience: TourAudience, userKey: string): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(key(audience, userKey)) === "1";
  } catch {
    return true;
  }
}

export function markTourCompleted(audience: TourAudience, userKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key(audience, userKey), "1");
  } catch {
    // ignore quota / private mode
  }
}

export function clearTourCompleted(audience: TourAudience, userKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key(audience, userKey));
  } catch {
    // ignore
  }
}

export function sessionRoleToTourAudience(
  role: UserRole | undefined
): TourAudience {
  if (role === "admin") return "admin";
  if (role === "media_guest") return "external";
  if (role === "seo") return "seo";
  return "member";
}
