import type { MediaList } from "@/lib/types";

/** List row for the audience editor. Membership ids stay on the server. */
export type AudienceListOption = {
  id: string;
  name: string;
  list_kind: string;
  contact_count: number;
};

export function toAudienceListOption(
  list: Pick<MediaList, "id" | "name" | "contact_ids" | "list_kind">
): AudienceListOption {
  return {
    id: list.id,
    name: list.name,
    list_kind: list.list_kind,
    contact_count: list.contact_ids?.length ?? 0,
  };
}

/** Press, mixed, and marketing lists. Press lists are for pitches. */
export function isMarketingList(list: Pick<MediaList, "list_kind">) {
  return (
    list.list_kind === "press" ||
    list.list_kind === "marketing" ||
    list.list_kind === "mixed"
  );
}
