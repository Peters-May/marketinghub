import type { PrMonitorMention } from "@/lib/types";

export type MonitorSummary = {
  total: number;
  newCount: number;
  promotedCount: number;
  dismissedCount: number;
  bySentiment: {
    positive: number;
    neutral: number;
    negative: number;
    unset: number;
  };
  topOutlets: { outlet: string; count: number }[];
};

/** Counts for the Mention Browser summary strip. */
export function summarizeMentions(mentions: PrMonitorMention[]): MonitorSummary {
  const bySentiment = {
    positive: 0,
    neutral: 0,
    negative: 0,
    unset: 0,
  };
  let newCount = 0;
  let promotedCount = 0;
  let dismissedCount = 0;
  const outlets = new Map<string, number>();

  for (const m of mentions) {
    if (m.status === "new") newCount += 1;
    else if (m.status === "promoted") promotedCount += 1;
    else if (m.status === "dismissed") dismissedCount += 1;

    if (m.sentiment === "positive") bySentiment.positive += 1;
    else if (m.sentiment === "neutral") bySentiment.neutral += 1;
    else if (m.sentiment === "negative") bySentiment.negative += 1;
    else bySentiment.unset += 1;

    const outlet = m.outlet.trim() || "Unknown";
    outlets.set(outlet, (outlets.get(outlet) ?? 0) + 1);
  }

  const topOutlets = [...outlets.entries()]
    .map(([outlet, count]) => ({ outlet, count }))
    .sort((a, b) => b.count - a.count || a.outlet.localeCompare(b.outlet))
    .slice(0, 5);

  return {
    total: mentions.length,
    newCount,
    promotedCount,
    dismissedCount,
    bySentiment,
    topOutlets,
  };
}
