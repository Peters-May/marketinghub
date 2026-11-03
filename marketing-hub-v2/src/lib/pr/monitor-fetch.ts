import { createHash } from "node:crypto";
import {
  splitKeywordTerms,
  textContainsKeywordPhrase,
} from "@/lib/pr/mention-match";

/**
 * Fetch news mentions for a monitoring query.
 * Uses NewsAPI when NEWS_API_KEY is set; otherwise returns an empty set
 * (staff can still log coverage manually).
 */

export type MonitorFetchResult = {
  title: string;
  url: string;
  outlet: string;
  published_at: string | null;
  snippet: string;
  language: string;
  external_id: string;
};

const PAGE_SIZE = 100;
const MAX_PAGES = 3;

function splitTerms(raw: string): string[] {
  return splitKeywordTerms(raw);
}

/** Quoted phrases for NewsAPI. Ampersands are also searched as "and" and as adjacent words. */
export function newsApiKeywordQuery(keywords: string): string {
  const clauses = splitTerms(keywords).flatMap((phrase) => {
    const clean = phrase.replace(/"/g, "").replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const forms = new Set<string>([
      clean,
      clean.replace(/\s*&\s*/g, " and ").replace(/\s+/g, " ").trim(),
      clean.replace(/\s*&\s*/g, " ").replace(/\s+/g, " ").trim(),
      clean.replace(/\s+and\s+/gi, " & ").replace(/\s+/g, " ").trim(),
    ]);
    return [...forms].filter(Boolean).map((form) => `"${form}"`);
  });
  return [...new Set(clauses)].join(" OR ");
}

/** Full-URL hash so two articles on the same site stay distinct. */
export function newsApiExternalId(link: string): string {
  return `newsapi:${createHash("sha256").update(link).digest("hex")}`;
}

/** First language code from a comma-separated list, or empty for all languages. */
export function newsApiLanguageParam(languages: string): string {
  const first = languages
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .find(Boolean);
  return first && /^[a-z]{2}$/.test(first) ? first : "";
}

/**
 * NewsAPI `from` ISO date. Uses last_run_at when present, otherwise a 7-day
 * lookback so the first run is bounded.
 */
export function newsApiFromDate(
  lastRunAt: string | null | undefined,
  now = new Date()
): string {
  if (lastRunAt) {
    const parsed = new Date(lastRunAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return lookback.toISOString();
}

type NewsApiArticle = {
  title?: string;
  url?: string;
  description?: string;
  content?: string;
  publishedAt?: string;
  source?: { name?: string };
};

async function fetchNewsApiPage(input: {
  apiKey: string;
  q: string;
  language: string;
  from: string;
  page: number;
}): Promise<NewsApiArticle[]> {
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", input.q);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(PAGE_SIZE));
  url.searchParams.set("page", String(input.page));
  url.searchParams.set("from", input.from);
  if (input.language) {
    url.searchParams.set("language", input.language);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-Api-Key": input.apiKey },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[pr/monitor] NewsAPI request failed", error);
    throw new Error("News monitoring is unavailable right now.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[pr/monitor] NewsAPI error", res.status, text.slice(0, 200));
    throw new Error("News monitoring is unavailable right now.");
  }

  const data = (await res.json()) as { articles?: NewsApiArticle[] };
  return data.articles ?? [];
}

export async function fetchMentionsForQuery(input: {
  keywords: string;
  exclusions: string;
  languages?: string;
  last_run_at?: string | null;
}): Promise<MonitorFetchResult[]> {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  const keywords = splitTerms(input.keywords);
  if (!keywords.length) return [];

  const exclusions = splitTerms(input.exclusions).map((e) => e.toLowerCase());

  if (!apiKey) {
    return [];
  }

  const q = newsApiKeywordQuery(input.keywords);
  const language = newsApiLanguageParam(input.languages ?? "");
  const from = newsApiFromDate(input.last_run_at);
  const out: MonitorFetchResult[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const articles = await fetchNewsApiPage({
      apiKey,
      q,
      language,
      from,
      page,
    });
    if (!articles.length) break;

    for (const article of articles) {
      const title = (article.title || "").trim();
      const link = (article.url || "").trim();
      if (!title || !link) continue;
      const externalId = newsApiExternalId(link);
      if (seen.has(externalId)) continue;
      const description = (article.description || "").trim();
      const hay = `${title} ${description} ${article.content || ""}`;
      if (exclusions.some((ex) => hay.toLowerCase().includes(ex))) continue;
      if (!textContainsKeywordPhrase(hay, input.keywords)) continue;
      seen.add(externalId);
      out.push({
        title,
        url: link,
        outlet: article.source?.name?.trim() || "",
        published_at: article.publishedAt || null,
        snippet: description,
        language,
        external_id: externalId,
      });
    }

    if (articles.length < PAGE_SIZE) break;
  }

  return out;
}
