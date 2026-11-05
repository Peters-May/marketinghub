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
/** Developer plans often reject page 2+; keep fetching until empty or plan limit. */
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

type NewsApiPageResult =
  | { ok: true; articles: NewsApiArticle[] }
  | { ok: false; softStop: boolean; message: string };

type NewsApiResponseBody = {
  status?: string;
  code?: string;
  message?: string;
  articles?: NewsApiArticle[];
};

/** Map NewsAPI error codes to short staff-facing messages. */
export function newsApiErrorMessage(
  status: number,
  body: { code?: string; message?: string } | null
): { softStop: boolean; message: string } {
  const code = String(body?.code ?? "").toLowerCase();
  if (
    code === "maximumresultsreached" ||
    code === "pagerequired" ||
    /maximum results|page.*not allowed|developer accounts/i.test(
      String(body?.message ?? "")
    )
  ) {
    return { softStop: true, message: "NewsAPI page limit reached" };
  }
  if (code === "ratelimited" || status === 429) {
    return {
      softStop: false,
      message: "NewsAPI rate limit hit — try again in a minute.",
    };
  }
  if (code === "apikeyinvalid" || code === "apikeymissing" || status === 401) {
    return {
      softStop: false,
      message: "NEWS_API_KEY is invalid — check the key on newsapi.org.",
    };
  }
  if (code === "apikeydisabled") {
    return {
      softStop: false,
      message: "NEWS_API_KEY is disabled on newsapi.org.",
    };
  }
  if (
    code === "apikeyexhausted" ||
    /upgrade|paid plans only|production/i.test(String(body?.message ?? ""))
  ) {
    return {
      softStop: false,
      message:
        "NewsAPI plan cannot run this request from the Hub server. A paid NewsAPI plan is required for production monitoring.",
    };
  }
  if (status === 426 || status === 403) {
    return {
      softStop: false,
      message:
        "NewsAPI blocked this request — developer keys cannot be used from production servers. Upgrade the NewsAPI plan or use a server-capable key.",
    };
  }
  return {
    softStop: false,
    message: "News monitoring is unavailable right now.",
  };
}

async function fetchNewsApiPage(input: {
  apiKey: string;
  q: string;
  language: string;
  from: string;
  page: number;
}): Promise<NewsApiPageResult> {
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

  const text = await res.text().catch(() => "");
  let parsed: NewsApiResponseBody | null = null;
  try {
    parsed = text ? (JSON.parse(text) as NewsApiResponseBody) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok || parsed?.status === "error") {
    console.error(
      "[pr/monitor] NewsAPI error",
      res.status,
      text.slice(0, 200)
    );
    const mapped = newsApiErrorMessage(res.status, parsed);
    if (mapped.softStop) {
      return { ok: false, softStop: true, message: mapped.message };
    }
    throw new Error(mapped.message);
  }

  return { ok: true, articles: parsed?.articles ?? [] };
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
    const pageResult = await fetchNewsApiPage({
      apiKey,
      q,
      language,
      from,
      page,
    });
    if (!pageResult.ok) {
      // Plan limit on later pages — keep whatever we already collected.
      if (pageResult.softStop) break;
      throw new Error(pageResult.message);
    }
    const articles = pageResult.articles;
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
