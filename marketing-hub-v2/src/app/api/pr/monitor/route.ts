import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, requireAdmin } from "@/lib/api";
import {
  createPrCoverage,
  createPrMonitorQuery,
  deletePrMonitorQuery,
  getPrMonitorSettings,
  listPrMonitorMentions,
  listPrMonitorQueries,
  updatePrMonitorMention,
  updatePrMonitorQuery,
  updatePrMonitorSettings,
  upsertPrMonitorMentions,
} from "@/lib/data/repos";
import { normalizeSentiment } from "@/lib/pr/mention-normalize";
import { runMonitorQuery } from "@/lib/pr/monitor-run";
import type {
  PrCoverageSentiment,
  PrMonitorQuery,
  PrMonitorSettings,
} from "@/lib/types";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const [queries, mentions, settings] = await Promise.all([
    listPrMonitorQueries(),
    listPrMonitorMentions(),
    getPrMonitorSettings(),
  ]);
  return jsonOk({
    queries,
    mentions,
    settings,
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
      languages: String(body.languages ?? ""),
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
    const result = await runMonitorQuery(query);
    if (result.error) {
      const safe =
        result.error &&
        !/pgrst|jwt|violates|duplicate key|relation |schema |supabase|password/i.test(
          result.error
        )
          ? result.error
          : "Monitoring fetch failed";
      return jsonError(safe, 502);
    }
    return jsonOk({
      added: result.added,
      news_api_configured: Boolean(process.env.NEWS_API_KEY?.trim()),
    });
  }

  if (action === "dismiss_mention") {
    const updated = await updatePrMonitorMention(body.id, {
      status: "dismissed",
    });
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "update_mention") {
    const patch = (body.patch ?? {}) as Partial<{
      sentiment: PrCoverageSentiment;
      favorite: boolean;
      status: string;
      language: string;
      country: string;
      notes_snippet: string;
    }>;
    const updated = await updatePrMonitorMention(body.id, {
      ...(patch.sentiment !== undefined
        ? { sentiment: normalizeSentiment(patch.sentiment) }
        : {}),
      ...(patch.favorite !== undefined
        ? { favorite: Boolean(patch.favorite) }
        : {}),
      ...(patch.language !== undefined
        ? { language: String(patch.language) }
        : {}),
      ...(patch.country !== undefined ? { country: String(patch.country) } : {}),
    });
    if (!updated) return jsonError("Not found", 404);
    return jsonOk({ item: updated });
  }

  if (action === "promote_mention") {
    const mentions = await listPrMonitorMentions();
    const mention = mentions.find((m) => m.id === body.id);
    if (!mention) return jsonError("Not found", 404);
    const sentiment = normalizeSentiment(
      body.sentiment !== undefined ? body.sentiment : mention.sentiment
    );
    if (sentiment && sentiment !== mention.sentiment) {
      await updatePrMonitorMention(mention.id, { sentiment });
    }
    const coverage = await createPrCoverage({
      title: mention.title,
      url: mention.url,
      outlet: mention.outlet,
      published_at: mention.published_at,
      sentiment,
      notes: mention.snippet,
      channel: "",
      screenshot_url: "",
      audience: null,
      estimated_views: null,
      domain_authority: null,
      pitch_id: null,
      content_id: null,
      event_id: null,
      monitor_mention_id: mention.id,
    });
    await updatePrMonitorMention(mention.id, {
      status: "promoted",
      sentiment,
    });
    return jsonOk({ coverage });
  }

  if (action === "add_mention") {
    const queries = await listPrMonitorQueries();
    const queryId =
      String(body.query_id ?? "").trim() || queries[0]?.id || "";
    if (!queryId) {
      return jsonError("Create a monitoring query before adding mentions", 400);
    }
    const title = String(body.title ?? "").trim();
    if (!title) return jsonError("Title is required", 400);
    const url = String(body.url ?? "").trim();
    const externalId = url
      ? `manual:${createHash("sha256").update(url).digest("hex")}`
      : `manual:${createHash("sha256")
          .update(`${title}|${Date.now()}`)
          .digest("hex")}`;
    const created = await upsertPrMonitorMentions([
      {
        query_id: queryId,
        title,
        url,
        outlet: String(body.outlet ?? "").trim(),
        published_at: body.published_at || null,
        snippet: String(body.snippet ?? ""),
        status: "new",
        sentiment: normalizeSentiment(body.sentiment),
        language: String(body.language ?? "").trim(),
        country: String(body.country ?? "").trim(),
        favorite: Boolean(body.favorite),
        source: "manual",
        external_id: externalId,
      },
    ]);
    if (!created.length) {
      return jsonError("That mention is already in the inbox", 409);
    }
    return jsonOk({ item: created[0] }, { status: 201 });
  }

  if (action === "update_settings") {
    const settings = await updatePrMonitorSettings(
      (body.patch ?? {}) as Partial<PrMonitorSettings>
    );
    return jsonOk({ settings });
  }

  return jsonError("Unknown action", 400);
}
