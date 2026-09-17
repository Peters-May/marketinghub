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
  return raw
    .split(/[,;\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
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

  const q = keywords.map((k) => `"${k.replace(/"/g, "")}"`).join(" OR ");
  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", q);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", "25");

  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": apiKey },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `NewsAPI error ${res.status}: ${text.slice(0, 200) || res.statusText}`
    );
  }

  const data = (await res.json()) as {
    articles?: {
      title?: string;
      url?: string;
      description?: string;
      publishedAt?: string;
      source?: { name?: string };
    }[];
  };

  const out: MonitorFetchResult[] = [];
  for (const article of data.articles ?? []) {
    const title = (article.title || "").trim();
    const link = (article.url || "").trim();
    if (!title || !link) continue;
    const hay = `${title} ${article.description || ""}`.toLowerCase();
    if (exclusions.some((ex) => hay.includes(ex))) continue;
    out.push({
      title,
      url: link,
      outlet: article.source?.name?.trim() || "",
      published_at: article.publishedAt || null,
      snippet: (article.description || "").trim(),
      external_id: `newsapi:${Buffer.from(link, "utf8")
        .toString("base64url")
        .slice(0, 48)}`,
    });
  }
  return out;
}
