import type { Contact, ContentItem } from "@/lib/types";
import { plainTextFromHtml } from "@/lib/plain-text";
import { isPressContact } from "@/lib/pr/pitch-eml";

/** Media desk address, matching MEDIA_DESK_HTML in the brand factsheet. */
export const MEDIA_DESK_EMAIL = "marketing@petersandmay.com";

export const BRAND_GUIDELINES_PDF = "/brand-guidelines-2026.pdf";

export const NEWSROOM_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";

/** Categories that say nothing useful as a public topic. */
const HIDDEN_TOPICS = new Set(["general", "press release", "news", "marketing"]);

export function releaseDateIso(item: ContentItem): string {
  return (item.due_date || item.updated_at || "").slice(0, 10);
}

/** "3 Nov 2026" for lists and sidebars. */
export function shortReleaseDate(iso: string | null | undefined): string {
  const day = (iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

/** Public topics for a release: its tags, then its category if meaningful. */
export function releaseTopics(item: ContentItem): string[] {
  const tags = item.pr_document?.tags ?? [];
  const topics = [...tags];
  const category = item.category?.trim();
  if (category && !HIDDEN_TOPICS.has(category.toLowerCase())) {
    topics.push(category);
  }
  const seen = new Set<string>();
  return topics
    .map((t) => t.trim())
    .filter((t) => {
      const key = t.toLowerCase();
      if (!t || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function topicSlug(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Topics across all releases, most used first. */
export function topicIndex(items: ContentItem[]): { topic: string; slug: string; count: number }[] {
  const counts = new Map<string, { topic: string; count: number }>();
  for (const item of items) {
    for (const topic of releaseTopics(item)) {
      const slug = topicSlug(topic);
      const entry = counts.get(slug);
      if (entry) entry.count += 1;
      else counts.set(slug, { topic, count: 1 });
    }
  }
  return [...counts.entries()]
    .map(([slug, v]) => ({ slug, ...v }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export function releaseSummary(item: ContentItem, max = 200): string {
  const text = plainTextFromHtml(item.caption || "").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 120 ? lastSpace : max).trimEnd()}…`;
}

/** Preferred order on the public press contacts list (by email). */
const SPOKESPERSON_ORDER = [
  "simon@petersandmay.com",
  "craig@petersandmay.com",
  "richard@petersandmay.com",
  "peverley@petersandmay.com",
  "robert@petersandmay.com",
  "marketing@petersandmay.com",
];

export function newsroomSpokespeople(contacts: Contact[]): Contact[] {
  const rank = new Map(
    SPOKESPERSON_ORDER.map((email, index) => [email, index])
  );
  return contacts
    .filter((c) => c.is_spokesperson && !isPressContact(c))
    .filter((c) => c.email || c.phone)
    .sort((a, b) => {
      const aRank = rank.get(a.email.trim().toLowerCase()) ?? 100;
      const bRank = rank.get(b.email.trim().toLowerCase()) ?? 100;
      if (aRank !== bRank) return aRank - bRank;
      return a.name.localeCompare(b.name);
    });
}

export function releaseUrl(id: string): string {
  return `${NEWSROOM_SITE_URL}/newsroom/${id}`;
}
