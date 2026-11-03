import {
  listPrMonitorQueries,
  updatePrMonitorQuery,
  upsertPrMonitorMentions,
} from "@/lib/data/repos";
import { fetchMentionsForQuery } from "@/lib/pr/monitor-fetch";
import type { PrMonitorMention, PrMonitorQuery } from "@/lib/types";

export type MonitorRunResult = {
  query_id: string;
  query_name: string;
  added: number;
  created: PrMonitorMention[];
  error?: string;
};

/** Run one monitoring query and upsert new mentions. */
export async function runMonitorQuery(
  query: PrMonitorQuery
): Promise<MonitorRunResult> {
  try {
    const fetched = await fetchMentionsForQuery({
      keywords: query.keywords,
      exclusions: query.exclusions,
      languages: query.languages,
      last_run_at: query.last_run_at,
    });
    const created = await upsertPrMonitorMentions(
      fetched.map((m) => ({
        query_id: query.id,
        title: m.title,
        url: m.url,
        outlet: m.outlet,
        published_at: m.published_at,
        snippet: m.snippet,
        status: "new" as const,
        sentiment: "" as const,
        language: m.language,
        country: "",
        favorite: false,
        source: "newsapi" as const,
        external_id: m.external_id,
      }))
    );
    await updatePrMonitorQuery(query.id, {
      last_run_at: new Date().toISOString(),
    });
    return {
      query_id: query.id,
      query_name: query.name,
      added: created.length,
      created,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Monitoring fetch failed";
    return {
      query_id: query.id,
      query_name: query.name,
      added: 0,
      created: [],
      error: message,
    };
  }
}

/** Run every active query (used by cron and optional bulk Run all). */
export async function runActiveMonitorQueries(): Promise<{
  results: MonitorRunResult[];
  added: number;
  created: PrMonitorMention[];
  news_api_configured: boolean;
}> {
  const queries = (await listPrMonitorQueries()).filter((q) => q.active);
  const results: MonitorRunResult[] = [];
  const created: PrMonitorMention[] = [];
  for (const query of queries) {
    const result = await runMonitorQuery(query);
    results.push(result);
    created.push(...result.created);
  }
  return {
    results,
    added: created.length,
    created,
    news_api_configured: Boolean(process.env.NEWS_API_KEY?.trim()),
  };
}
