import { describe, expect, it } from "vitest";
import {
  importExternalId,
  parseCsv,
  parseOwlyMentionsCsv,
} from "@/lib/pr/owly-import";

describe("parseCsv", () => {
  it("handles quoted commas and newlines", () => {
    const rows = parseCsv('a,b\n"hello, world","line\ntwo"\n');
    expect(rows[0]).toEqual(["a", "b"]);
    expect(rows[1]).toEqual(["hello, world", "line\ntwo"]);
  });
});

describe("parseOwlyMentionsCsv", () => {
  it("maps Owly-style headers and dedupes by URL", () => {
    const csv = [
      "Title,Outlet,URL,Date published,Snippet,Sentiment,Country",
      "One,Sail World,https://example.com/a,2026-10-08,Boats at Eastleigh,Positive,New Zealand",
      "Dup,Other,https://example.com/a,2026-10-09,Again,Neutral,UK",
      "Two,Hellenic,,29 Sep 2026,Experience matters,negative,United States",
    ].join("\n");
    const rows = parseOwlyMentionsCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "One",
      outlet: "Sail World",
      url: "https://example.com/a",
      sentiment: "positive",
      country: "New Zealand",
      external_id: importExternalId("https://example.com/a"),
    });
    expect(rows[1].title).toBe("Two");
    expect(rows[1].sentiment).toBe("negative");
    expect(rows[1].external_id.startsWith("import:title:")).toBe(true);
  });

  it("returns empty for header-only CSV", () => {
    expect(parseOwlyMentionsCsv("title,url\n")).toEqual([]);
  });
});
