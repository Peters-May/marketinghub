export type TitleMatch<T> =
  | { kind: "one"; item: T }
  | { kind: "many"; items: T[] }
  | { kind: "none" };

/** Match a typed name to one record. Exact title wins, then every significant word. */
export function matchByTitle<T extends { title: string }>(
  items: T[],
  query: string
): TitleMatch<T> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return { kind: "none" };

  const exact = items.filter((item) => item.title.trim().toLowerCase() === q);
  if (exact.length === 1) return { kind: "one", item: exact[0] };
  if (exact.length > 1) return { kind: "many", items: exact };

  const words = q.split(/\s+/).filter((word) => word.length > 1);
  if (words.length === 0) return { kind: "none" };

  const hits = items.filter((item) => {
    const title = item.title.toLowerCase();
    return words.every((word) => title.includes(word));
  });
  if (hits.length === 1) return { kind: "one", item: hits[0] };
  if (hits.length > 1) return { kind: "many", items: hits };
  return { kind: "none" };
}

export function describeMatches(items: { title: string }[]): string {
  const names = items.slice(0, 5).map((item) => item.title);
  const extra =
    items.length > 5 ? `, and ${items.length - 5} more` : "";
  return `${names.join(", ")}${extra}`;
}
