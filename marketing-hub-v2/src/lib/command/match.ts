export type TitleMatch<T> =
  | { kind: "one"; item: T }
  | { kind: "many"; items: T[] }
  | { kind: "none" };

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

/** Fold accents and case so Düsseldorf matches Dusseldorf. */
export function normalizeTitleText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantWords(value: string): string[] {
  return normalizeTitleText(value)
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

function uniqueByTitle<T extends { title: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeTitleText(item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function finish<T extends { title: string }>(hits: T[]): TitleMatch<T> {
  const unique = uniqueByTitle(hits);
  if (unique.length === 1) return { kind: "one", item: unique[0] };
  if (unique.length > 1) return { kind: "many", items: unique };
  return { kind: "none" };
}

/**
 * Match a typed name to one record.
 * Exact title wins, then every significant query word in the title,
 * then every significant title word in the query (extra context like a person name is OK),
 * then a single clear best overlap score.
 */
export function matchByTitle<T extends { title: string }>(
  items: T[],
  query: string
): TitleMatch<T> {
  const qNorm = normalizeTitleText(query);
  if (qNorm.length < 2) return { kind: "none" };

  const exact = items.filter(
    (item) => normalizeTitleText(item.title) === qNorm
  );
  if (exact.length === 1) return { kind: "one", item: exact[0] };
  if (exact.length > 1) return { kind: "many", items: uniqueByTitle(exact) };

  const queryWords = significantWords(query);
  if (queryWords.length === 0) return { kind: "none" };

  const containsAllQueryWords = items.filter((item) => {
    const title = normalizeTitleText(item.title);
    return queryWords.every((word) => title.includes(word));
  });
  const allQuery = finish(containsAllQueryWords);
  if (allQuery.kind !== "none") return allQuery;

  const titleContainedInQuery = items
    .map((item) => ({
      item,
      titleWords: significantWords(item.title),
    }))
    .filter(
      ({ titleWords }) =>
        titleWords.length > 0 &&
        titleWords.every((word) => qNorm.includes(word))
    );
  if (titleContainedInQuery.length === 1) {
    return { kind: "one", item: titleContainedInQuery[0].item };
  }
  if (titleContainedInQuery.length > 1) {
    // Prefer the most specific title (most shared words), e.g. "Boot Düsseldorf travel"
    // over "Boot Düsseldorf" when the query names the travel event.
    const maxWords = Math.max(
      ...titleContainedInQuery.map((row) => row.titleWords.length)
    );
    const mostSpecific = titleContainedInQuery.filter(
      (row) => row.titleWords.length === maxWords
    );
    const reverse = finish(mostSpecific.map((row) => row.item));
    if (reverse.kind !== "none") return reverse;
  }

  type Scored = { item: T; score: number; titleLen: number };
  const scored: Scored[] = [];
  for (const item of items) {
    const titleWords = significantWords(item.title);
    if (titleWords.length === 0) continue;
    const hitCount = titleWords.filter((word) =>
      queryWords.some((q) => q.includes(word) || word.includes(q))
    ).length;
    if (hitCount === 0) continue;
    const coverage = hitCount / titleWords.length;
    // Need most of the title covered, and at least two shared words for multi-word titles.
    if (coverage < 0.6) continue;
    if (titleWords.length >= 2 && hitCount < 2) continue;
    scored.push({
      item,
      score: coverage * 100 + hitCount,
      titleLen: titleWords.length,
    });
  }

  if (scored.length === 0) return { kind: "none" };
  scored.sort((a, b) => b.score - a.score || a.titleLen - b.titleLen);
  const best = scored[0];
  const tied = scored.filter((row) => Math.abs(row.score - best.score) < 0.01);
  return finish(tied.map((row) => row.item));
}

export function describeMatches(items: { title: string }[]): string {
  const names = items.slice(0, 5).map((item) => item.title);
  const extra =
    items.length > 5 ? `, and ${items.length - 5} more` : "";
  return `${names.join(", ")}${extra}`;
}
