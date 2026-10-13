import type { MediaList } from "@/lib/types";

/** Lists synced from the customer Portal. They are not PR media lists. */
export function isPortalMediaList(list: MediaList): boolean {
  if (list.portal_list_id) return true;
  const source = (list.source || "").toLowerCase();
  return source === "portal" || source.startsWith("portal");
}

/**
 * A list or segment built from Hub contacts, for PR media lists and pitches.
 * Marketing lists and Portal lists are excluded.
 */
export function isContactSegment(list: MediaList): boolean {
  if (isPortalMediaList(list)) return false;
  return list.list_kind === "press" || list.list_kind === "mixed";
}
