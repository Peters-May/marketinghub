import {
  isSocialContentItem,
  parseChannels,
  previewAssetUrls,
  primaryCanvaUrl,
  stripHtml,
} from "@/lib/data/normalize";
import type { ContentItem, ContentStatus } from "@/lib/types";

/** Fields safe to show on an unlisted staff preview. No notes, owner, or Planable ids. */
export type PublicSocialPreview = {
  title: string;
  platforms: string[];
  caption: string;
  captionHtml: string | null;
  images: string[];
  canvaUrl: string | null;
  dueDate: string | null;
  /** Coarse label for the preview banner. Internal workflow states stay in the Hub. */
  previewStatus: "Draft" | "Scheduled" | "Published" | "Cancelled";
};

export function postSharePath(token: string): string {
  return `/share/post/${encodeURIComponent(token)}`;
}

export function isShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

export function generateShareToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function previewStatusLabel(
  status: ContentStatus
): PublicSocialPreview["previewStatus"] {
  if (status === "published") return "Published";
  if (status === "scheduled") return "Scheduled";
  if (status === "cancelled") return "Cancelled";
  return "Draft";
}

/** Build the public mock from a Hub social item. Returns null when the link is off. */
export function toPublicSocialPreview(
  item: ContentItem
): PublicSocialPreview | null {
  if (!item.share_enabled) return null;
  const token = (item.share_token ?? "").trim();
  if (!isShareToken(token)) return null;
  if (!isSocialContentItem(item)) return null;

  const rawCaption = (item.caption || item.notes || "").trim();
  const looksHtml = /<\/?[a-z][\s\S]*>/i.test(rawCaption);
  const caption = stripHtml(rawCaption);
  const images = previewAssetUrls(item.asset_url);
  const canva = primaryCanvaUrl(item.asset_url);

  return {
    title: (item.title || "Social post").trim() || "Social post",
    platforms: parseChannels(item.channel),
    caption,
    captionHtml: looksHtml ? rawCaption : null,
    images,
    canvaUrl: canva || null,
    dueDate: item.due_date,
    previewStatus: previewStatusLabel(item.status),
  };
}
