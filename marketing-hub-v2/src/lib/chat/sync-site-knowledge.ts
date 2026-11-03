import { createServiceClient } from "@/lib/supabase/admin";
import {
  SITEMAP_INDEX_URL,
  SITE_KB_MIN_CHARS,
  SITE_KB_PREFIX,
  canonicalSiteUrl,
  isContentSitemap,
  isSitemapIndex,
  pageBodyFromHtml,
  pageTitleFromHtml,
  parseSitemapLocs,
  siteDocumentId,
} from "@/lib/chat/site-knowledge";
import { contentHash } from "@/lib/knowledge/chunk";

const FETCH_HEADERS = {
  Accept: "text/html,application/xml,text/xml",
  "User-Agent":
    "PetersMay-MarketingHub-Chat/1.0 (+https://marketing.petersandmay.com)",
};

const MAX_PAGES = 600;
const PAGE_TIMEOUT_MS = 12_000;

export type SiteKnowledgeSyncResult = {
  discovered: number;
  updated: number;
  skipped: number;
  unchanged: number;
  failed: number;
  deactivated: number;
  error?: string;
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      cache: "no-store",
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn("[chat-site-kb]", url, err);
    return null;
  }
}

export async function discoverSitePageUrls(): Promise<string[]> {
  const indexXml = await fetchText(SITEMAP_INDEX_URL);
  if (!indexXml) return [];
  const locs = parseSitemapLocs(indexXml);
  const sitemapUrls = isSitemapIndex(indexXml)
    ? locs.filter(isContentSitemap)
    : [];
  const pageLocs = isSitemapIndex(indexXml) ? [] : locs;

  const childXml = await Promise.all(sitemapUrls.map((url) => fetchText(url)));
  for (const xml of childXml) {
    if (!xml || isSitemapIndex(xml)) continue;
    pageLocs.push(...parseSitemapLocs(xml));
  }

  const urls = new Set<string>();
  for (const loc of pageLocs) {
    const canonical = canonicalSiteUrl(loc);
    if (canonical) urls.add(canonical);
  }
  return [...urls].sort((a, b) => a.length - b.length).slice(0, MAX_PAGES);
}

async function existingInactiveIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("chat_kb_documents")
    .select("id,active")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Set(
    (data ?? [])
      .filter((row) => row.active === false)
      .map((row) => String(row.id))
  );
}

export async function syncSitePageBatch(
  urls: string[]
): Promise<
  Pick<SiteKnowledgeSyncResult, "updated" | "skipped" | "unchanged" | "failed">
> {
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  let unchanged = 0;
  let failed = 0;

  const fetched = await Promise.all(
    urls.map(async (url) => {
      const html = await fetchText(url);
      return { url, html };
    })
  );

  const ids = fetched.map(({ url }) => siteDocumentId(url));
  const existingHashes = new Map<string, string>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("chat_kb_documents")
      .select("id,content_hash")
      .in("id", ids);
    for (const row of data ?? []) {
      existingHashes.set(String(row.id), String(row.content_hash ?? ""));
    }
  }

  const rows: Array<Record<string, unknown>> = [];
  const thinIds: string[] = [];

  for (const { url, html } of fetched) {
    if (!html || !/<html[\s>]/i.test(html.slice(0, 2000))) {
      failed += 1;
      continue;
    }
    const body = pageBodyFromHtml(html);
    const id = siteDocumentId(url);
    if (body.length < SITE_KB_MIN_CHARS) {
      skipped += 1;
      thinIds.push(id);
      continue;
    }
    const hash = contentHash(body);
    if (existingHashes.get(id) === hash) {
      unchanged += 1;
      continue;
    }
    rows.push({
      id,
      title: pageTitleFromHtml(html, url),
      source_url: url,
      body,
      content_hash: hash,
      active: true,
      sort_order: 500,
      updated_at: now,
    });
  }

  if (thinIds.length > 0) {
    const { error } = await supabase
      .from("chat_kb_documents")
      .update({ active: false, updated_at: now })
      .in("id", thinIds)
      .like("id", `${SITE_KB_PREFIX}%`);
    if (error) throw new Error(error.message);
  }

  if (rows.length > 0) {
    const inactive = await existingInactiveIds(rows.map((r) => String(r.id)));
    for (const row of rows) {
      if (inactive.has(String(row.id))) row.active = false;
    }
    const { error } = await supabase
      .from("chat_kb_documents")
      .upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
    updated = rows.length;
  }

  return { updated, skipped, unchanged, failed };
}

/**
 * Refuse mass-deactivation when sitemap discovery looks incomplete.
 * Empty or tiny discovery sets previously wiped the whole site KB.
 */
export const SITE_KB_DEACTIVATE_MIN_DISCOVERED = 40;
/** Skip deactivation if more than this fraction of active pages would go inactive. */
export const SITE_KB_DEACTIVATE_MAX_FRACTION = 0.35;

export function shouldSkipSiteKbDeactivation(input: {
  discoveredCount: number;
  activeCount: number;
  staleCount: number;
}): { skip: true; reason: string } | { skip: false } {
  if (input.discoveredCount <= 0) {
    return { skip: true, reason: "no urls discovered" };
  }
  if (input.discoveredCount < SITE_KB_DEACTIVATE_MIN_DISCOVERED) {
    return {
      skip: true,
      reason: `only ${input.discoveredCount} urls discovered (need ${SITE_KB_DEACTIVATE_MIN_DISCOVERED})`,
    };
  }
  if (input.activeCount > 0) {
    const fraction = input.staleCount / input.activeCount;
    if (fraction > SITE_KB_DEACTIVATE_MAX_FRACTION) {
      return {
        skip: true,
        reason: `would deactivate ${input.staleCount}/${input.activeCount} active pages`,
      };
    }
  }
  return { skip: false };
}

export async function deactivateMissingSitePages(
  liveUrls: string[]
): Promise<number> {
  const supabase = createServiceClient();
  const keep = new Set(liveUrls);
  const { data, error } = await supabase
    .from("chat_kb_documents")
    .select("id,source_url")
    .like("id", `${SITE_KB_PREFIX}%`)
    .eq("active", true)
    .limit(2000);
  if (error) throw new Error(error.message);
  const active = data ?? [];
  const stale = active
    .filter((row) => !keep.has(String(row.source_url ?? "")))
    .map((row) => String(row.id));
  if (stale.length === 0) return 0;

  const guard = shouldSkipSiteKbDeactivation({
    discoveredCount: liveUrls.length,
    activeCount: active.length,
    staleCount: stale.length,
  });
  if (guard.skip) {
    console.warn(
      "[chat-site-kb] skipping mass deactivate:",
      guard.reason
    );
    return 0;
  }

  const { error: updateError } = await supabase
    .from("chat_kb_documents")
    .update({ active: false, updated_at: new Date().toISOString() })
    .in("id", stale);
  if (updateError) throw new Error(updateError.message);
  return stale.length;
}
