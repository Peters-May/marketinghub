import { describe, expect, it } from "vitest";
import { mentionsToCsv } from "@/lib/pr/mentions-csv";
import type { PrMonitorMention, PrMonitorQuery } from "@/lib/types";

const query = {
  id: "q1",
  name: "Yacht transport",
} as PrMonitorQuery;

const mention = {
  id: "m1",
  query_id: "q1",
  title: 'Peters & May, "yacht" move',
  url: "https://example.com/a",
  outlet: "Trade press",
  published_at: "2026-10-01T12:00:00.000Z",
  snippet: "Line one\nLine two",
  status: "new",
  external_id: "ext",
  created_at: "2026-10-01T12:00:00.000Z",
  updated_at: "2026-10-01T12:00:00.000Z",
} as PrMonitorMention;

describe("mentionsToCsv", () => {
  it("quotes commas, quotes, and line breaks", () => {
    const csv = mentionsToCsv([mention], [query]);
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"Peters & May, ""yacht"" move"');
    expect(row).toContain('"Line one\nLine two"');
    expect(row).toContain("2026-10-01");
    expect(row?.endsWith(",Yacht transport")).toBe(true);
  });
});
