import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrCoverage,
  createPrMonitorQuery,
  deletePrMonitorQuery,
  listPrMonitorMentions,
  listPrMonitorQueries,
  updatePrMonitorMention,
  updatePrMonitorQuery,
  upsertPrMonitorMentions,
} from "@/lib/data/repos";
import { fetchMentionsForQuery } from "@/lib/pr/monitor-fetch";
import type { PrMonitorQuery } from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const [queries, mentions] = await Promise.all([
    listPrMonitorQueries(),
    listPrMonitorMentions(),
  ]);
  return jsonOk({
    queries,
    mentions,
    news_api_configured: Boolean(process.env.NEWS_API_KEY?.trim()),
  });
}

export async function POST(request: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const action = body.action as string | undefined;

  if (action === "delete_query") {
    await deletePrMonitorQuery(body.id);
    return jsonOk({ ok: true });
  }

  if (action === "update_query") {
    const updated = await updatePrMonitorQuery(
      body.id,
      (body.patch ?? {}) as Partial<PrMonitorQuery>
    );
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "create_query") {
    const item = await createPrMonitorQuery({
      name: String(body.name ?? "Untitled query").trim() || "Untitled query",
      keywords: String(body.keywords ?? ""),
      exclusions: String(body.exclusions ?? ""),
      active: body.active !== false,
      last_run_at: null,
      notes: String(body.notes ?? ""),
    });
    return jsonOk({ item }, { status: 201 });
  }

  if (action === "run_query") {
    const queries = await listPrMonitorQueries();
    const query = queries.find((q) => q.id === body.id);
    if (!query) return jsonError("Query not found", 404);
    try {
      const fetched = await fetchMentionsForQuery({
        keywords: query.keywords,
        exclusions: query.exclusions,
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
          external_id: m.external_id,
        }))
      );
      await updatePrMonitorQuery(query.id, {
        last_run_at: new Date().toISOString(),
      });
      return jsonOk({
        added: created.length,
        news_api_configured: Boolean(process.env.NEWS_API_KEY?.trim()),
      });
    } catch (e) {
      return jsonError(
        e instanceof Error ? e.message : "Monitoring fetch failed",
        502
      );
    }
  }

  if (action === "dismiss_mention") {
    const updated = await updatePrMonitorMention(body.id, {
      status: "dismissed",
    });
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "promote_mention") {
    const mentions = await listPrMonitorMentions();
    const mention = mentions.find((m) => m.id === body.id);
    if (!mention) return jsonError("Not found", 404);
    const coverage = await createPrCoverage({
      title: mention.title,
      url: mention.url,
      outlet: mention.outlet,
      published_at: mention.published_at,
      sentiment: "",
      notes: mention.snippet,
      pitch_id: null,
      content_id: null,
      event_id: null,
      monitor_mention_id: mention.id,
    });
    await updatePrMonitorMention(mention.id, { status: "promoted" });
    return jsonOk({ coverage });
  }

  return jsonError("Unknown action", 400);
}
