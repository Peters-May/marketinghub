import { describe, expect, it } from "vitest";
import { summarizeMentions } from "@/lib/pr/monitor-summary";
import type { PrMonitorMention } from "@/lib/types";

function mention(
  patch: Partial<PrMonitorMention> & Pick<PrMonitorMention, "id" | "outlet">
): PrMonitorMention {
  return {
    query_id: "q1",
    title: "T",
    url: "",
    published_at: null,
    snippet: "",
    status: "new",
    sentiment: "",
    language: "",
    country: "",
    favorite: false,
    source: "newsapi",
    external_id: patch.id,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("summarizeMentions", () => {
  it("counts status, sentiment, and top outlets", () => {
    const summary = summarizeMentions([
      mention({ id: "1", outlet: "Sail World", sentiment: "positive" }),
      mention({
        id: "2",
        outlet: "Sail World",
        status: "promoted",
        sentiment: "positive",
      }),
      mention({
        id: "3",
        outlet: "Solo Vela",
        status: "dismissed",
        sentiment: "negative",
      }),
    ]);
    expect(summary.total).toBe(3);
    expect(summary.newCount).toBe(1);
    expect(summary.promotedCount).toBe(1);
    expect(summary.dismissedCount).toBe(1);
    expect(summary.bySentiment.positive).toBe(2);
    expect(summary.bySentiment.negative).toBe(1);
    expect(summary.topOutlets[0]).toEqual({
      outlet: "Sail World",
      count: 2,
    });
  });
});
