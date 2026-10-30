/**
 * Public petersandmay.com pages copied into the chat knowledge base.
 * Sailing schedules stay on the live allowlist fetch — they change too often
 * for a monthly copy.
 */

import { htmlToPlainText } from "@/lib/chat/site-pages";

export const SITE_KB_PREFIX = "kb_site_";
export const SITE_ORIGIN = "https://www.petersandmay.com";
export const SITEMAP_INDEX_URL = `${SITE_ORIGIN}/sitemap_index.xml`;

/** Stored page text. Live sailing excerpts use a higher cap. */
export const SITE_KB_MAX_CHARS = 6_000;
export const SITE_KB_MIN_CHARS = 80;

const CONTENT_SITEMAPS = [
  "page-sitemap",
  "post-sitemap",
  "about-us-sitemap",
  "case-study-sitemap",
  "faq-sitemap",
  "guide-sitemap",
  "office-sitemap",
  "associations-sitemap",
  "our-services-sitemap",
  "arrival-location-sitemap",
  "location-sitemap",
  "featured-sitemap",
  "port-sitemap",
  "routeregion-sitemap",
  "sector-sitemap",
  "team-sitemap",
  "vessel-sitemap",
];

const EXCLUDED_PATH =
  /\/(?:feed|wp-json|wp-admin|wp-content)(?:\/|$)|cookie-declaration|arc-login|successfully-sent|personalised-quotation|\/sailings(?:\/|$)|elementor/i;

export function isContentSitemap(url: string): boolean {
  const name = url.split("?")[0]?.split("/").pop()?.toLowerCase() ?? "";
  return CONTENT_SITEMAPS.some((prefix) => name.startsWith(prefix));
}

export function canonicalSiteUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const host = u.hostname.toLowerCase();
    if (host !== "www.petersandmay.com" && host !== "petersandmay.com") {
      return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    let path = u.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    if (EXCLUDED_PATH.test(`${path}/`)) return null;
    if (/\.(pdf|jpe?g|png|gif|webp|zip|xml|mp4)$/i.test(path)) return null;
    const suffix = path === "/" ? "/" : `${path}/`;
    return `${SITE_ORIGIN}${suffix}`;
  } catch {
    return null;
  }
}

/** Stable id for a canonical page URL. 64-bit FNV, no Node crypto. */
export function siteDocumentId(canonicalUrl: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonicalUrl.length; i++) {
    const c = canonicalUrl.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x01000193);
  }
  const hex =
    (h1 >>> 0).toString(16).padStart(8, "0") +
    (h2 >>> 0).toString(16).padStart(8, "0");
  return `${SITE_KB_PREFIX}${hex}`;
}

export function parseSitemapLocs(xml: string): string[] {
  const head = xml.slice(0, 800);
  if (/<html[\s>]/i.test(head)) return [];
  if (!/<loc>/i.test(xml)) return [];
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    m[1].replace(/&amp;/g, "&")
  );
}

export function isSitemapIndex(xml: string): boolean {
  return /<sitemapindex[\s>]/i.test(xml.slice(0, 1500));
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function pageTitleFromHtml(html: string, url: string): string {
  const raw = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = decodeBasicEntities(raw.replace(/<[^>]+>/g, " "));
  const cleaned = text
    .replace(/\s*[|\-–—]\s*Peters\s*(?:&|and)\s*May\b.*$/i, "")
    .trim();
  if (cleaned.length >= 2) return cleaned.slice(0, 180);
  try {
    const slug =
      new URL(url).pathname.split("/").filter(Boolean).pop() || "Home";
    return slug.replace(/-/g, " ").slice(0, 180);
  } catch {
    return "Website page";
  }
}

export function pageBodyFromHtml(html: string): string {
  return htmlToPlainText(html, SITE_KB_MAX_CHARS);
}

const QUERY_STOP = new Set([
  "the",
  "and",
  "for",
  "you",
  "your",
  "with",
  "from",
  "that",
  "this",
  "have",
  "are",
  "was",
  "what",
  "when",
  "where",
  "who",
  "how",
  "can",
  "our",
  "not",
  "but",
  "about",
  "please",
  "would",
  "could",
  "there",
  "their",
  "them",
  "they",
  "any",
  "into",
  "over",
  "just",
  "need",
  "want",
  "like",
  "does",
  "did",
  "has",
  "been",
  "will",
]);

/** Words safe to send to a PostgREST ilike filter. */
export function knowledgeQueryWords(query: string): string[] {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !QUERY_STOP.has(w));
  return [...new Set(words)].slice(0, 8);
}
