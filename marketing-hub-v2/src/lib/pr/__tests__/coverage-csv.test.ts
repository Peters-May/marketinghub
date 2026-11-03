import { describe, expect, it } from "vitest";
import { coverageToCsv } from "@/lib/pr/coverage-csv";
import type { PrCoverage } from "@/lib/types";

const clip = {
  id: "c1",
  title: 'Clip, "quoted"',
  url: "https://example.com",
  outlet: "Trade",
  published_at: "2026-10-01T00:00:00.000Z",
  sentiment: "positive",
  notes: "Line\ntwo",
  channel: "online",
  screenshot_url: "",
  audience: 1000,
  estimated_views: 200,
  domain_authority: 40,
  pitch_id: null,
  content_id: null,
  event_id: null,
  monitor_mention_id: null,
  created_at: "2026-10-01T00:00:00.000Z",
  updated_at: "2026-10-01T00:00:00.000Z",
} as PrCoverage;

describe("coverageToCsv", () => {
  it("exports sentiment and escapes cells", () => {
    const csv = coverageToCsv([clip]);
    expect(csv.split("\r\n")[0]).toContain("sentiment");
    expect(csv).toContain('"Clip, ""quoted"""');
    expect(csv).toContain("positive");
  });
});
