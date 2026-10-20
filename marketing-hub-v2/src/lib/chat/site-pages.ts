/**
 * Allowlisted public website pages the chat may fetch when a visitor asks
 * about leadership, offices, careers, etc. Not a full-site crawl.
 */

export type SitePageDef = {
  id: string;
  title: string;
  url: string;
  /** Match visitor questions to decide whether to fetch this page. */
  keywords: RegExp;
};

export const ALLOWLISTED_SITE_PAGES: SitePageDef[] = [
  {
    id: "our-group",
    title: "Our Group",
    url: "https://www.petersandmay.com/our-group/",
    keywords:
      /\b(ceo|managing director|md\b|leadership|director|founder|our group|who (is|are)|senior (team|management)|board)\b/i,
  },
  {
    id: "offices",
    title: "Our Global Offices",
    url: "https://www.petersandmay.com/offices/",
    keywords:
      /\b(office|offices|where (are|is) you|location|locations|address|contact (number|phone)|telephone|southampton|genoa|dubai|florida|asia|france|italy)\b/i,
  },
  {
    id: "careers",
    title: "Careers",
    url: "https://www.petersandmay.com/careers/",
    keywords:
      /\b(career|careers|job|jobs|vacanc|work (for|with) (you|peters)|employment|recruit|hiring|skipper|crew)\b/i,
  },
];

type CacheEntry = { text: string; fetchedAt: number; ok: boolean };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CHARS = 12_000;

function stripHtml(html: string): string {
  let t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // Prefer main content if present
  const main =
    t.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    t.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    t;
  return main
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
}

export function selectSitePagesForQuery(query: string): SitePageDef[] {
  return ALLOWLISTED_SITE_PAGES.filter((p) => p.keywords.test(query));
}

export async function fetchAllowlistedPage(
  page: SitePageDef
): Promise<{ title: string; url: string; body: string } | null> {
  const cached = cache.get(page.url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    if (!cached.ok || !cached.text) return null;
    return { title: page.title, url: page.url, body: cached.text };
  }

  try {
    const res = await fetch(page.url, {
      headers: {
        Accept: "text/html",
        "User-Agent":
          "PetersMay-MarketingHub-Chat/1.0 (+https://marketing.petersandmay.com)",
      },
      // Server-side allowlist fetch; in-memory cache handles freshness.
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      cache.set(page.url, { text: "", fetchedAt: Date.now(), ok: false });
      return null;
    }
    const html = await res.text();
    const text = stripHtml(html);
    if (text.length < 80) {
      cache.set(page.url, { text: "", fetchedAt: Date.now(), ok: false });
      return null;
    }
    cache.set(page.url, { text, fetchedAt: Date.now(), ok: true });
    return { title: page.title, url: page.url, body: text };
  } catch (err) {
    console.warn("[chat-site-pages]", page.url, err);
    cache.set(page.url, { text: "", fetchedAt: Date.now(), ok: false });
    return null;
  }
}

/** Fetch any allowlisted pages that match the visitor message. */
export async function fetchRelevantSitePages(
  query: string
): Promise<Array<{ title: string; url: string; body: string }>> {
  const selected = selectSitePagesForQuery(query);
  if (selected.length === 0) return [];
  const results = await Promise.all(selected.map((p) => fetchAllowlistedPage(p)));
  return results.filter((r): r is NonNullable<typeof r> => Boolean(r));
}
