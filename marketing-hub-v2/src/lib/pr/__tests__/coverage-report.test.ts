import { describe, expect, it } from "vitest";
import { inferCoverageChannel } from "@/lib/pr/coverage-channel";
import {
  formatCoverageMetric,
  groupCoverageReportItemsByChannel,
  snapshotCoverageItem,
  summarizeCoverageReportItems,
} from "@/lib/pr/coverage-report";
import type { PrCoverage } from "@/lib/types";

const clip = {
  id: "cov_1",
  title: "Ship move",
  url: "https://www.linkedin.com/posts/example",
  outlet: "LinkedIn",
  published_at: "2026-10-01T00:00:00.000Z",
  sentiment: "positive",
  notes: "",
  channel: "",
  screenshot_url: "https://example.com/shot.jpg",
  audience: 1000,
  estimated_views: 250,
  domain_authority: 40,
  pitch_id: null,
  content_id: null,
  event_id: null,
  monitor_mention_id: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
} as PrCoverage;

describe("coverage report helpers", () => {
  it("infers LinkedIn channel from URL", () => {
    expect(inferCoverageChannel(clip.url)).toBe("linkedin");
  });

  it("snapshots coverage into report items", () => {
    const item = snapshotCoverageItem(clip, 0);
    expect(item.channel).toBe("linkedin");
    expect(item.screenshot_url).toBe(clip.screenshot_url);
    expect(item.audience).toBe(1000);
  });

  it("summarises and groups items", () => {
    const items = [
      snapshotCoverageItem(clip, 0),
      snapshotCoverageItem(
        {
          ...clip,
          id: "cov_2",
          url: "https://trade.example/article",
          channel: "online",
          audience: 500,
          estimated_views: null,
          domain_authority: 50,
        },
        1
      ),
    ];
    const summary = summarizeCoverageReportItems(items);
    expect(summary.pieces).toBe(2);
    expect(summary.audience).toBe(1500);
    expect(summary.estimatedViews).toBe(250);
    expect(summary.avgDomainAuthority).toBe(45);
    expect(formatCoverageMetric(11200)).toBe("11.2K");
    const groups = groupCoverageReportItemsByChannel(items);
    expect(groups.map((g) => g.channel)).toEqual(["online", "linkedin"]);
  });
});
