/** Platform badge colours / initials for social calendar cards. */

export type PlatformKey =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "x"
  | "tiktok"
  | "youtube"
  | "social";

export function platformKey(raw: string): PlatformKey {
  const s = raw.toLowerCase().trim();
  if (!s) return "social";

  // Exact short codes first
  if (s === "li") return "linkedin";
  if (s === "ig") return "instagram";
  if (s === "fb") return "facebook";
  if (s === "yt") return "youtube";
  if (s === "x" || s === "twitter") return "x";

  // Word-boundary matches — Instagram/Facebook before LinkedIn so a combined
  // label like "Instagram, Facebook, LinkedIn" does not collapse to LinkedIn.
  if (/\binstagram\b|\breels?\b/.test(s)) return "instagram";
  if (/\bfacebook\b/.test(s)) return "facebook";
  if (/\blinkedin\b/.test(s)) return "linkedin";
  if (/\btiktok\b/.test(s)) return "tiktok";
  if (/\byoutube\b/.test(s)) return "youtube";
  if (/\btwitter\b|\btweet\b/.test(s)) return "x";

  // Planable camelCase / underscored platform enums
  if (s.includes("instagram")) return "instagram";
  if (s.includes("facebook")) return "facebook";
  if (s.includes("linkedin")) return "linkedin";
  if (s.includes("tiktok")) return "tiktok";
  if (s.includes("youtube")) return "youtube";
  if (s.includes("twitter")) return "x";

  return "social";
}

const PLATFORM_SCANS: { key: PlatformKey; re: RegExp }[] = [
  { key: "instagram", re: /\binstagram\b|\breels?\b/i },
  { key: "facebook", re: /\bfacebook\b/i },
  { key: "linkedin", re: /\blinkedin\b/i },
  { key: "tiktok", re: /\btiktok\b/i },
  { key: "youtube", re: /\byoutube\b/i },
  // Standalone X / Twitter only — a bare "x" inside another word must not match.
  { key: "x", re: /(?:^|[^a-z0-9])(?:x|twitter|tweet)(?:[^a-z0-9]|$)/i },
];

export type ResolvedPlatform = { key: PlatformKey; label: string };

/** Every network named in the selection, including several in one label. */
export function resolvePreviewPlatforms(platforms: string[]): ResolvedPlatform[] {
  const resolved: ResolvedPlatform[] = [];
  const seen = new Set<string>();
  const push = (key: PlatformKey, label: string) => {
    const name = label.trim() || PLATFORM_META[key].label;
    const id = key === "social" ? `social:${name.toLowerCase()}` : key;
    if (seen.has(id)) return;
    seen.add(id);
    resolved.push({
      key,
      label: key === "social" ? name : PLATFORM_META[key].label,
    });
  };

  const list = Array.isArray(platforms) ? platforms : [];
  for (const raw of list) {
    const parts = String(raw)
      .split(/[,;|/]|\band\b|\+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts.length ? parts : [String(raw).trim()].filter(Boolean)) {
      const hits = PLATFORM_SCANS.filter(({ re }) => re.test(part)).map(({ key }) => key);
      if (hits.length) {
        hits.forEach((key) => push(key, PLATFORM_META[key].label));
        continue;
      }
      const key = platformKey(part);
      push(key, key === "social" ? part : PLATFORM_META[key].label);
    }
  }
  return resolved.length ? resolved : [{ key: "social", label: "Social" }];
}

export const PLATFORM_META: Record<
  PlatformKey,
  { label: string; bg: string; fg: string; short: string }
> = {
  linkedin: { label: "LinkedIn", bg: "#0A66C2", fg: "#fff", short: "in" },
  instagram: { label: "Instagram", bg: "#E1306C", fg: "#fff", short: "IG" },
  facebook: { label: "Facebook", bg: "#1877F2", fg: "#fff", short: "f" },
  x: { label: "X", bg: "#111111", fg: "#fff", short: "𝕏" },
  tiktok: { label: "TikTok", bg: "#010101", fg: "#fff", short: "♪" },
  youtube: { label: "YouTube", bg: "#FF0000", fg: "#fff", short: "▶" },
  social: { label: "Social", bg: "#64748b", fg: "#fff", short: "S" },
};

export function isImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  if (u.startsWith("data:image")) return true;
  return /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u) || u.includes("image");
}

/** True for common video file URLs. */
export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url.trim());
}

/** Images plus CDN/signed media URLs with no file extension (Planable, Drive). */
export function isPreviewableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (isImageUrl(url)) return true;
  if (isCanvaUrl(url)) return false;
  const u = url.toLowerCase();
  if (/\.(pdf|docx?|xlsx?|pptx?|csv|zip|mp4|mov|webm|m4v)(\?|$)/i.test(u)) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return !/\.[a-z0-9]{2,5}$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/** True for Canva design / share links (not CDN image exports). */
export function isCanvaUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!(host === "canva.com" || host.endsWith(".canva.com"))) return false;
    // Skip media CDN hosts — those are image/file assets, not editor links.
    if (host.includes("media") || host.startsWith("export.")) return false;
    return /\/design\//i.test(parsed.pathname);
  } catch {
    return /canva\.com\/design\//i.test(url);
  }
}

/** Normalize a Canva design link to the /view URL. */
export function toCanvaViewUrl(url: string): string | null {
  if (!isCanvaUrl(url)) return null;
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/\/+$/, "");
    path = path.replace(/\/(edit|view|watch|present)$/i, "");
    u.pathname = `${path}/view`;
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Canva public/share embed URL (shows the actual design when embedding is allowed). */
export function toCanvaEmbedUrl(url: string): string | null {
  const view = toCanvaViewUrl(url);
  if (!view) return null;
  return `${view}?embed`;
}
