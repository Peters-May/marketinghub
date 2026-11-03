import { createHash } from "node:crypto";
import { normalizeSentiment } from "@/lib/pr/mention-normalize";
import type { PrCoverageSentiment } from "@/lib/types";

export type OwlyImportRow = {
  title: string;
  url: string;
  outlet: string;
  published_at: string | null;
  snippet: string;
  sentiment: PrCoverageSentiment;
  country: string;
  language: string;
  external_id: string;
};

function csvCellValue(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/** Minimal RFC4180-ish CSV parser (quoted fields, commas, newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(csvCellValue(cell));
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(csvCellValue(cell));
      cell = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(csvCellValue(cell));
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function headerKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const TITLE_KEYS = ["title", "headline", "mention_title", "article_title"];
const URL_KEYS = ["url", "link", "article_url", "mention_url"];
const OUTLET_KEYS = [
  "outlet",
  "source",
  "publication",
  "media_outlet",
  "domain",
];
const DATE_KEYS = [
  "published_at",
  "date",
  "date_published",
  "published",
  "publication_date",
];
const SNIPPET_KEYS = [
  "snippet",
  "summary",
  "description",
  "excerpt",
  "content",
  "text",
];
const SENTIMENT_KEYS = ["sentiment", "tone"];
const COUNTRY_KEYS = ["country", "nation"];
const LANGUAGE_KEYS = ["language", "lang"];

function pick(
  map: Record<string, string>,
  keys: string[]
): string {
  for (const key of keys) {
    if (map[key]) return map[key];
  }
  return "";
}

function parsePublishedAt(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  return value;
}

export function importExternalId(url: string): string {
  return `import:${createHash("sha256").update(url.trim()).digest("hex")}`;
}

/**
 * Parse an Owly / Prowly-style mentions export into Hub mention rows.
 * Requires at least a title column; URL is preferred for dedupe.
 */
export function parseOwlyMentionsCsv(csvText: string): OwlyImportRow[] {
  const table = parseCsv(csvText);
  if (table.length < 2) return [];
  const headers = table[0].map(headerKey);
  const out: OwlyImportRow[] = [];
  const seen = new Set<string>();

  for (const cells of table.slice(1)) {
    const map: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) map[h] = cells[i] ?? "";
    });
    const title = pick(map, TITLE_KEYS);
    const url = pick(map, URL_KEYS);
    if (!title.trim()) continue;
    const externalId = url.trim()
      ? importExternalId(url)
      : `import:title:${createHash("sha256")
          .update(title.toLowerCase())
          .digest("hex")}`;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    out.push({
      title: title.trim(),
      url: url.trim(),
      outlet: pick(map, OUTLET_KEYS).trim(),
      published_at: parsePublishedAt(pick(map, DATE_KEYS)),
      snippet: pick(map, SNIPPET_KEYS),
      sentiment: normalizeSentiment(pick(map, SENTIMENT_KEYS)),
      country: pick(map, COUNTRY_KEYS).trim(),
      language: pick(map, LANGUAGE_KEYS).trim(),
      external_id: externalId,
    });
  }
  return out;
}
