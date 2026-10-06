import type { PrMonitorMention, PrMonitorQuery } from "@/lib/types";

function csvCell(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Spreadsheet export of monitoring mentions, including the query name. */
export function mentionsToCsv(
  rows: PrMonitorMention[],
  queries: PrMonitorQuery[]
): string {
  const queryName = new Map(queries.map((q) => [q.id, q.name]));
  const headers = [
    "title",
    "outlet",
    "url",
    "published_at",
    "snippet",
    "status",
    "query",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((m) =>
      [
        m.title,
        m.outlet,
        m.url,
        m.published_at ? m.published_at.slice(0, 10) : "",
        m.snippet,
        m.status,
        queryName.get(m.query_id) ?? "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  return lines.join("\r\n");
}
