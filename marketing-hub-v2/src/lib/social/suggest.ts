import { isSocialContentItem } from "@/lib/data/normalize";
import type { ContentItem } from "@/lib/types";

export const SUGGEST_CHANNELS = ["LinkedIn", "Instagram", "Facebook"] as const;

export type SuggestChannel = (typeof SUGGEST_CHANNELS)[number];

const MAX_TEXT = 8000;
const MAX_ASSET = 20000;

export function suggestText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

/** Only the channels a member can suggest. Unknown values are dropped. */
export function parseSuggestChannels(raw: unknown): SuggestChannel[] {
  const parts = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/[,;\n]/)
      : [];
  const out: SuggestChannel[] = [];
  for (const part of parts) {
    const match = SUGGEST_CHANNELS.find(
      (channel) => channel.toLowerCase() === String(part).trim().toLowerCase()
    );
    if (match && !out.includes(match)) out.push(match);
  }
  return out;
}

/** Keep uploaded image URLs. Drop anything that is not http(s) or a Hub upload path. */
export function safeAssetUrls(raw: unknown): string {
  const lines = suggestText(raw, MAX_ASSET)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines
    .filter(
      (line) => /^https?:\/\//i.test(line) || line.startsWith("/api/uploads/")
    )
    .join("\n");
}

function stripShareToken(item: ContentItem): ContentItem {
  const copy = { ...item };
  delete copy.share_token;
  return copy;
}

/** Scheduled and published social, plus this member's own ideas. */
export function contentVisibleToMember(
  items: ContentItem[],
  userId: string
): ContentItem[] {
  return items
    .filter((item) => {
      if (!isSocialContentItem(item)) return false;
      if (item.status === "scheduled" || item.status === "published") {
        return true;
      }
      return item.status === "idea" && item.owner_user_id === userId;
    })
    .map(stripShareToken);
}

/** A member may change or withdraw a suggestion only while it is still an undated idea they own. */
export function canReviseOwnIdea(item: ContentItem, userId: string): boolean {
  return (
    item.owner_user_id === userId &&
    item.status === "idea" &&
    !item.due_date &&
    isSocialContentItem(item)
  );
}
