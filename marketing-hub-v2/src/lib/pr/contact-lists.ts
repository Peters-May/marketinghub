import type { MediaList } from "@/lib/types";

/** Lists synced from the customer Portal. PR does not use these. */
export function isPortalMediaList(list: {
  portal_list_id?: string | null;
  source?: string | null;
}): boolean {
  if (list.portal_list_id) return true;
  const source = (list.source || "").toLowerCase();
  return (
    source === "portal" ||
    source.startsWith("portal-") ||
    source.startsWith("portal:")
  );
}

/** Press lists built from Hub contacts. */
export function isHubContactList(list: MediaList): boolean {
  if (isPortalMediaList(list)) return false;
  return list.list_kind === "press" || list.list_kind === "mixed";
}
