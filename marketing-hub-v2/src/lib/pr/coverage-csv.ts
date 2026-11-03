import type { PrCoverage } from "@/lib/types";

function csvCell(value: string) {
  const safe = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(safe) || safe !== value) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/** Spreadsheet export of logged coverage clips. */
export function coverageToCsv(rows: PrCoverage[]): string {
  const headers = [
    "title",
    "outlet",
    "url",
    "published_at",
    "sentiment",
    "channel",
    "audience",
    "estimated_views",
    "domain_authority",
    "screenshot_url",
    "notes",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((c) =>
      [
        c.title,
        c.outlet,
        c.url,
        c.published_at ? c.published_at.slice(0, 10) : "",
        c.sentiment || "",
        c.channel || "",
        c.audience == null ? "" : String(c.audience),
        c.estimated_views == null ? "" : String(c.estimated_views),
        c.domain_authority == null ? "" : String(c.domain_authority),
        c.screenshot_url || "",
        c.notes,
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  return lines.join("\r\n");
}
