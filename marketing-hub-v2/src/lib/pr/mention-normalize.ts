import type {
  PrCoverageSentiment,
  PrMonitorMention,
  PrMonitorMentionSource,
  PrMonitorMentionStatus,
} from "@/lib/types";

const SENTIMENTS = new Set<PrCoverageSentiment>([
  "positive",
  "neutral",
  "negative",
  "",
]);

const SOURCES = new Set<PrMonitorMentionSource>([
  "newsapi",
  "import",
  "manual",
]);

export function normalizeSentiment(value: unknown): PrCoverageSentiment {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (raw === "pos" || raw === "positive") return "positive";
  if (raw === "neg" || raw === "negative") return "negative";
  if (raw === "neu" || raw === "neutral") return "neutral";
  return SENTIMENTS.has(raw as PrCoverageSentiment)
    ? (raw as PrCoverageSentiment)
    : "";
}

export function normalizeMentionSource(value: unknown): PrMonitorMentionSource {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return SOURCES.has(raw as PrMonitorMentionSource)
    ? (raw as PrMonitorMentionSource)
    : "newsapi";
}

/** Fill defaults so older store rows remain usable after schema extension. */
export function normalizeMonitorMention(
  input: Partial<PrMonitorMention> &
    Pick<PrMonitorMention, "id" | "query_id" | "title" | "external_id">
): PrMonitorMention {
  const status = (input.status as PrMonitorMentionStatus) || "new";
  return {
    id: input.id,
    query_id: input.query_id,
    title: String(input.title ?? "").trim(),
    url: String(input.url ?? "").trim(),
    outlet: String(input.outlet ?? "").trim(),
    published_at: input.published_at ?? null,
    snippet: String(input.snippet ?? ""),
    status:
      status === "promoted" || status === "dismissed" || status === "new"
        ? status
        : "new",
    sentiment: normalizeSentiment(input.sentiment),
    language: String(input.language ?? "").trim(),
    country: String(input.country ?? "").trim(),
    favorite: Boolean(input.favorite),
    source: normalizeMentionSource(input.source),
    external_id: String(input.external_id ?? "").trim(),
    created_at: input.created_at || new Date().toISOString(),
    updated_at: input.updated_at || new Date().toISOString(),
  };
}
