/** Shared clean-up for hub store + Supabase import. */

import { normalizeRichTextStorage } from "@/lib/sanitize";
import {
  isCanvaUrl,
  isPreviewableImageUrl,
  isVideoUrl,
  resolvePreviewPlatforms,
} from "@/lib/social/platforms";

const PLATFORM_HINTS: { re: RegExp; channel: string }[] = [
  { re: /\binstagram\b|\big\b|#instagram|\breel\b/i, channel: "Instagram" },
  { re: /\bfacebook\b|\bfb\b|#facebook/i, channel: "Facebook" },
  { re: /\blinkedin\b|\bli\b|#linkedin/i, channel: "LinkedIn" },
  { re: /\btiktok\b|#tiktok/i, channel: "TikTok" },
  { re: /\byoutube\b|\byt\b|#youtube/i, channel: "YouTube" },
  { re: /\bnewsletter\b/i, channel: "Newsletter" },
  { re: /\bpress\b|\bpr\b|\brelease\b/i, channel: "PR" },
  {
    re: /(?<![a-z])x(?![a-z])|\btwitter\b|\btweet\b|#twitter/i,
    channel: "X",
  },
];

const GENERIC_SOCIAL = /^(social(\s*post|\s*media)?|social_post|post)$/i;

export function stripHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Pull a usable URL from JSON attachment blobs or plain strings. */
export function extractAssetUrl(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("{")) {
    try {
      const parsed = JSON.parse(s) as { url?: string };
      if (parsed?.url && typeof parsed.url === "string") return parsed.url;
    } catch {
      // ignore
    }
  }
  return s.length < 500 ? s : "";
}

/** Parse one or more asset URLs (newline-separated, JSON array, or single). */
export function parseAssetUrls(raw: string | string[] | null | undefined): string[] {
  if (Array.isArray(raw)) {
    return dedupeAssetUrls(
      raw.map((u) => extractAssetUrl(String(u ?? ""))).filter(Boolean)
    );
  }
  const s = (raw ?? "").trim();
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        return dedupeAssetUrls(
          parsed
            .map((u) => extractAssetUrl(String(u ?? "")))
            .filter(Boolean)
        );
      }
    } catch {
      // fall through
    }
  }
  return dedupeAssetUrls(
    s
      .split(/\n+/)
      .map((line) => extractAssetUrl(line))
      .filter(Boolean)
  );
}

function assetUrlBasename(url: string): string {
  try {
    const path = new URL(url).pathname;
    const base = decodeURIComponent(path.split("/").pop() || "");
    return base.toLowerCase();
  } catch {
    const cleaned = url.split(/[?#]/)[0] || url;
    const base = cleaned.split("/").pop() || cleaned;
    return base.toLowerCase();
  }
}

/**
 * Collapse exact + Planable CDN near-duplicates (thumb vs full path, same basename).
 * Prefers the longer URL when one filename is a suffix of another.
 */
export function dedupeAssetUrls(urls: string[]): string[] {
  const exact: string[] = [];
  for (const raw of urls) {
    const u = (raw ?? "").trim();
    if (u && !exact.includes(u)) exact.push(u);
  }
  if (exact.length <= 1) return exact;

  const byBase = new Map<string, string>();
  const order: string[] = [];
  for (const u of exact) {
    const base = assetUrlBasename(u);
    if (!base) {
      order.push(u);
      continue;
    }
    const existing = byBase.get(base);
    if (!existing) {
      byBase.set(base, u);
      order.push(u);
      continue;
    }
    if (u.length > existing.length) {
      byBase.set(base, u);
      const idx = order.indexOf(existing);
      if (idx >= 0) order[idx] = u;
    }
  }

  const result: string[] = [];
  for (const u of order) {
    const base = assetUrlBasename(u);
    let replaced = false;
    for (let i = 0; i < result.length; i += 1) {
      const other = result[i];
      const otherBase = assetUrlBasename(other);
      // Require a meaningful stem so short names like "1.png" do not swallow others.
      if (!base || !otherBase || base === otherBase) continue;
      if (base.length < 10 && otherBase.length < 10) continue;
      if (otherBase.endsWith(base) && base.length >= 10) {
        // `u` is a shorter thumb/path variant of `other` — drop it.
        replaced = true;
        break;
      }
      if (base.endsWith(otherBase) && otherBase.length >= 10) {
        // `u` is the fuller variant — replace the shorter one.
        result[i] = u;
        replaced = true;
        break;
      }
    }
    if (!replaced) result.push(u);
  }
  return result;
}

export function joinAssetUrls(urls: string[]): string {
  return parseAssetUrls(urls).join("\n");
}

export function primaryAssetUrl(
  raw: string | string[] | null | undefined
): string {
  return parseAssetUrls(raw)[0] ?? "";
}

/** Image URLs among assets (skips Canva / PDF / other links). */
export function imageAssetUrls(
  raw: string | string[] | null | undefined
): string[] {
  return parseAssetUrls(raw).filter((u) => isPreviewableImageUrl(u));
}

/** Video file URLs among assets. */
export function videoAssetUrls(
  raw: string | string[] | null | undefined
): string[] {
  return parseAssetUrls(raw).filter((u) => isVideoUrl(u));
}

/** Images first, then videos — for calendar / preview thumbs. */
export function previewAssetUrls(
  raw: string | string[] | null | undefined
): string[] {
  const urls = parseAssetUrls(raw);
  const images = urls.filter((u) => isPreviewableImageUrl(u));
  const videos = urls.filter((u) => isVideoUrl(u));
  return [...images, ...videos.filter((u) => !images.includes(u))];
}

/** First image URL among assets (skips Canva / PDF / other links). */
export function primaryImageUrl(
  raw: string | string[] | null | undefined
): string {
  return imageAssetUrls(raw)[0] ?? "";
}

/** First Canva design URL among assets. */
export function primaryCanvaUrl(
  raw: string | string[] | null | undefined
): string {
  return parseAssetUrls(raw).find((u) => isCanvaUrl(u)) ?? "";
}

function detectPlatform(...parts: string[]): string | null {
  const hay = parts.filter(Boolean).join(" ");
  for (const hint of PLATFORM_HINTS) {
    if (hint.re.test(hay)) return hint.channel;
  }
  return null;
}

/**
 * Map messy Supabase post_type values into hub channels for Content & Social.
 */
export function normalizeContentType(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "Social";
  if (GENERIC_SOCIAL.test(s) || /^social/i.test(s)) return "Social";
  const lower = s.toLowerCase();
  if (lower === "editorial" || lower === "content" || lower === "article") {
    return "Editorial";
  }
  if (lower === "newsletter") return "Newsletter";
  if (lower === "sponsorship" || lower === "sponsorship content") {
    return "Sponsorship";
  }
  if (lower === "pr" || lower === "press") return "PR";
  if (lower === "thought leadership" || lower === "thought_leadership") {
    return "Thought Leadership";
  }
  if (s.includes("_")) {
    return s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SOCIAL_CHANNELS = new Set([
  "linkedin",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "twitter",
  "social",
]);

const NON_SOCIAL_TYPES = new Set([
  "editorial",
  "newsletter",
  "sponsorship",
  "pr",
  "press",
  "article",
  "thought leadership",
  "content",
]);

const NON_SOCIAL_CHANNELS = new Set([
  "editorial",
  "newsletter",
  "sponsorship",
  "pr",
  "press",
  "article",
]);

/** Split channel values from arrays, comma/semicolon lists, or a single string. */
export function parseChannels(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) {
    return raw
      .flatMap((v) => parseChannels(v))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return [];
    if (/[,;|]/.test(s)) {
      return s
        .split(/[,;|]/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
    return [s];
  }
  return [String(raw)].filter(Boolean);
}

export function formatChannels(channels: string[] | string | null | undefined): string {
  return parseChannels(channels).join(", ");
}

/** Social calendar items (LinkedIn / IG / etc.) vs editorial pipeline pieces. */
export function isSocialContentItem(item: {
  content_type?: string | null;
  channel?: string | string[] | null;
}): boolean {
  const type = (item.content_type || "").trim().toLowerCase();
  const channels = parseChannels(item.channel).map((c) => c.toLowerCase());
  if (NON_SOCIAL_TYPES.has(type)) return false;
  if (
    channels.length > 0 &&
    channels.every((c) => NON_SOCIAL_CHANNELS.has(c))
  ) {
    return false;
  }
  if (type === "social" || type.includes("social")) return true;
  if (
    channels.some((c) => SOCIAL_CHANNELS.has(c) || c.includes("social"))
  ) {
    return true;
  }
  // Unknown type on a social platform channel
  if (!type && channels.some((c) => SOCIAL_CHANNELS.has(c))) return true;
  return false;
}

export function normalizeChannel(
  raw: string,
  title = "",
  notes = ""
): string {
  const s = (raw ?? "").trim();
  if (!s || GENERIC_SOCIAL.test(s)) {
    return detectPlatform(title, notes, s) || "LinkedIn";
  }
  const lower = s.toLowerCase();
  if (lower === "editorial") return "Editorial";
  if (lower === "newsletter") return "Newsletter";
  if (lower === "sponsorship") return "Sponsorship";
  if (lower === "content") return "Article";
  if (lower === "pr" || lower === "press") return "PR";

  const fromRaw = detectPlatform(s);
  if (fromRaw) return fromRaw;

  // Title-case single tokens; leave multi-word as-is if already readable
  if (/^[a-z0-9_]+$/i.test(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return s;
}

/** Normalize one or more channels; falls back to title/notes detection. */
export function normalizeChannels(
  raw: unknown,
  title = "",
  notes = ""
): string[] {
  const parts = parseChannels(raw);
  const normalized = parts.flatMap((part) => {
    const named = resolvePreviewPlatforms([part]).filter(
      (item) => item.key !== "social"
    );
    if (named.length) return named.map((item) => item.label);
    return [normalizeChannel(part, title, notes)];
  });
  const unique: string[] = [];
  for (const ch of normalized) {
    if (!unique.some((u) => u.toLowerCase() === ch.toLowerCase())) {
      unique.push(ch);
    }
  }
  if (unique.length) return unique;
  return [normalizeChannel("", title, notes)];
}

const EVENT_TYPE_MAP: Record<string, string> = {
  event: "Trade show",
  events: "Trade show",
  boat_show: "Boat show",
  boatshow: "Boat show",
  race: "Race",
  racing: "Race",
  commercial_event: "Commercial",
  commercial: "Commercial",
  awards: "Awards",
  award: "Awards",
  sponsorship_event: "Sponsorship",
  sponsorship: "Sponsorship",
  conference: "Conference",
  meeting: "Meeting",
  internal: "Internal",
};

export function normalizeEventType(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "Event";
  const key = s.toLowerCase().replace(/\s+/g, "_");
  if (EVENT_TYPE_MAP[key]) return EVENT_TYPE_MAP[key];
  if (EVENT_TYPE_MAP[s.toLowerCase()]) return EVENT_TYPE_MAP[s.toLowerCase()];
  // humanise snake_case
  if (s.includes("_")) {
    return s
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function cleanContentFields(item: {
  title: string;
  channel: string | string[];
  content_type?: string;
  owner: string;
  notes: string;
  asset_url: string;
  planable_url: string;
  category?: string;
  priority?: string;
  website?: string;
  caption?: string;
}) {
  const notes = normalizeRichTextStorage(item.notes);
  const caption = normalizeRichTextStorage(item.caption ?? "");
  const title = stripHtml(item.title) || "Untitled post";
  const channel = normalizeChannels(
    item.channel,
    title,
    stripHtml(notes) || stripHtml(caption)
  );
  const content_type = normalizeContentType(
    item.content_type || channel[0] || "Social"
  );
  return {
    title,
    channel,
    content_type,
    owner: (item.owner ?? "").trim(),
    notes,
    caption,
    category: (item.category ?? "").trim(),
    priority: normalizeContentPriority(item.priority ?? ""),
    website: (item.website ?? "").trim(),
    asset_url: joinAssetUrls(parseAssetUrls(item.asset_url)),
    planable_url: (item.planable_url ?? "").trim(),
  };
}

export function normalizeContentPriority(raw: string): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (lower.includes("high") || lower.includes("important")) return "High";
  if (lower.includes("medium")) return "Medium";
  if (lower.includes("low")) return "Low";
  return s;
}

/** Social Posts rows that are really calendar events (belong in Events, not content). */
export function isEventPlaceholderContent(
  item: {
    title: string;
    channel?: string | string[];
    category?: string;
    due_date?: string | null;
  },
  eventTitles?: Set<string>
): boolean {
  const title = (item.title ?? "").trim().toLowerCase();
  if (!title) return false;
  if (eventTitles?.has(title)) return true;

  const category = (item.category ?? "").trim().toLowerCase();
  const undated = !item.due_date;
  if (
    undated &&
    (category === "event" ||
      category === "boat show" ||
      category === "event/material")
  ) {
    return true;
  }

  if (
    undated &&
    /\b(boat show|yacht show|boatbuilders|marina rendezvous|race week|regatta|trade show|symposium|conference|seawork|boot dusseldorf|ibex|hiswa|grand pavois|charter yacht show)\b/i.test(
      title
    )
  ) {
    return true;
  }

  return false;
}

export function cleanEventFields(item: {
  title: string;
  event_type: string;
  notes: string;
  location: string;
  link_url: string;
}) {
  return {
    title: stripHtml(item.title) || "Untitled event",
    event_type: normalizeEventType(item.event_type),
    notes: normalizeRichTextStorage(item.notes),
    location: stripHtml(item.location),
    link_url: (item.link_url ?? "").trim(),
  };
}

function normKeyPart(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const STATUS_RANK: Record<string, number> = {
  published: 5,
  scheduled: 4,
  review: 3,
  draft: 2,
  idea: 1,
  cancelled: 0,
};

function contentScore(item: {
  status: string;
  notes: string;
  asset_url: string;
  planable_url: string;
  updated_at: string;
  owner: string;
}): number {
  const status = STATUS_RANK[item.status] ?? 0;
  const richness =
    (item.notes ? 2 : 0) +
    (item.asset_url ? 1 : 0) +
    (item.planable_url ? 1 : 0) +
    (item.owner ? 1 : 0);
  const updated = Date.parse(item.updated_at) || 0;
  return status * 1_000_000 + richness * 10_000 + updated / 1_000_000;
}

/**
 * Drop duplicate social/content rows (same title + due date + channel).
 * Keeps the richest / furthest-along copy.
 */
export function dedupeContentItems<
  T extends {
    id: string;
    title: string;
    channel: string | string[];
    due_date: string | null;
    status: string;
    notes: string;
    asset_url: string;
    planable_url: string;
    owner: string;
    updated_at: string;
  },
>(items: T[]): { items: T[]; removed: number } {
  // Pass 1: title + due + channel
  const byDetail = new Map<string, T>();
  for (const item of items) {
    const key = [
      normKeyPart(item.title),
      item.due_date ?? "",
      normKeyPart(formatChannels(item.channel)),
    ].join("|");
    const prev = byDetail.get(key);
    if (!prev || contentScore(item) > contentScore(prev)) {
      byDetail.set(key, item);
    }
  }
  // Pass 2: same title (common Supabase duplicates with drifted dates)
  const byTitle = new Map<string, T>();
  for (const item of Array.from(byDetail.values())) {
    const key = normKeyPart(item.title) || item.id;
    const prev = byTitle.get(key);
    if (!prev || contentScore(item) > contentScore(prev)) {
      byTitle.set(key, item);
    }
  }
  const next = Array.from(byTitle.values());
  return { items: next, removed: items.length - next.length };
}

/**
 * Drop duplicate events (same title + start day).
 */
export function dedupeEventItems<
  T extends {
    id: string;
    title: string;
    starts_at: string | null;
    notes: string;
    location: string;
    updated_at: string;
  },
>(items: T[]): { items: T[]; removed: number } {
  const best = new Map<string, T>();
  for (const item of items) {
    const key = [
      normKeyPart(item.title),
      String(item.starts_at ?? "").slice(0, 10),
    ].join("|");
    const prev = best.get(key);
    if (!prev) {
      best.set(key, item);
      continue;
    }
    const score = (x: T) =>
      (x.notes ? 2 : 0) +
      (x.location ? 1 : 0) +
      (Date.parse(x.updated_at) || 0) / 1_000_000;
    if (score(item) > score(prev)) best.set(key, item);
  }
  const next = Array.from(best.values());
  return { items: next, removed: items.length - next.length };
}
