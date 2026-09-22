import type { HubAccessRole, UserRole } from "@/lib/types";

export const HUB_ACCESS_ROLES: HubAccessRole[] = [
  "admin",
  "member",
  "seo",
  "external",
];

export const HUB_ACCESS_ROLE_ORDER: Record<HubAccessRole, number> = {
  admin: 0,
  member: 1,
  seo: 2,
  external: 3,
};

export function normalizeHubAccessRole(value: unknown): HubAccessRole {
  const role = String(value ?? "").toLowerCase();
  return HUB_ACCESS_ROLES.includes(role as HubAccessRole)
    ? (role as HubAccessRole)
    : "member";
}

export function hubRoleToSessionRole(role: HubAccessRole): UserRole {
  if (role === "admin") return "admin";
  if (role === "external") return "media_guest";
  if (role === "seo") return "seo";
  return "staff";
}

export function isStaffSession(role: UserRole | undefined) {
  return role === "admin" || role === "staff";
}

export function canAccessEnquiries(role: UserRole | undefined) {
  return role === "admin" || role === "staff" || role === "seo";
}

/** Routes an SEO user may open inside /app. */
export function isSeoAllowedAppPath(pathname: string) {
  return (
    pathname === "/app/enquiries" ||
    pathname.startsWith("/app/enquiries/") ||
    pathname === "/app/me" ||
    pathname.startsWith("/app/me/")
  );
}

export function hubRoleFromAuthMetadata(user: {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const app = user.app_metadata?.role;
  const meta = user.user_metadata?.role;
  return String(app || meta || "").toLowerCase();
}
