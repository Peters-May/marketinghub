/** Client-safe check — do not import session/server modules from this file. */

export function canAccessWebsiteChat(
  user: { role?: string; websiteChat?: boolean } | null | undefined
) {
  if (!user) return false;
  if (user.role === "admin" || user.role === "seo") return true;
  if (user.role === "staff") return user.websiteChat === true;
  return false;
}

/**
 * Member sidebar only. Admins already see Website chat in Admin view,
 * so it stays out of the Member preview.
 */
export function websiteChatInMemberNav(
  user: { role?: string; websiteChat?: boolean } | null | undefined
) {
  if (!user || user.role === "admin") return false;
  return canAccessWebsiteChat(user);
}
