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
  external_id: string;
};

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

export async function fetchMentionsForQuery(input: {
  keywords: string;
  exclusions: string;
}): Promise<MonitorFetchResult[]> {
  const apiKey = process.env.NEWS_API_KEY?.trim();
  const keywords = splitTerms(input.keywords);
  if (!keywords.length) return [];

  const exclusions = splitTerms(input.exclusions).map((e) => e.toLowerCase());

  if (!apiKey) {
    return [];
  }

  const q = newsApiKeywordQuery(input.keywords);
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", q);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "25");

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey },
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

  const data = (await res.json()) as {
    articles?: {
      title?: string;
      url?: string;
      description?: string;
      content?: string;
      publishedAt?: string;
      source?: { name?: string };
    }[];
  };

  const out: MonitorFetchResult[] = [];
  for (const article of data.articles ?? []) {
    const title = (article.title || "").trim();
    const link = (article.url || "").trim();
    if (!title || !link) continue;
    const description = (article.description || "").trim();
    const hay = `${title} ${description} ${article.content || ""}`;
    if (exclusions.some((ex) => hay.toLowerCase().includes(ex))) continue;
    if (!textContainsKeywordPhrase(hay, input.keywords)) continue;
    out.push({
      title,
      url: link,
      outlet: article.source?.name?.trim() || "",
      published_at: article.publishedAt || null,
      snippet: description,
      external_id: newsApiExternalId(link),
    });
  }
  return out;
}
