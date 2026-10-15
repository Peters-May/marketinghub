/** Keep an on-screen list in step with one saved row. */

export function upsertById<T extends { id: string }>(rows: T[], item: T): T[] {
  const index = rows.findIndex((row) => row.id === item.id);
  if (index === -1) return [...rows, item];
  const next = rows.slice();
  next[index] = item;
  return next;
}

export function removeById<T extends { id: string }>(
  rows: T[],
  id: string
): T[] {
  if (!rows.some((row) => row.id === id)) return rows;
  return rows.filter((row) => row.id !== id);
}

export function rowFromResponse<T extends { id: string }>(
  data: unknown,
  key = "item"
): T | null {
  if (!data || typeof data !== "object") return null;
  const row = (data as Record<string, unknown>)[key];
  if (!row || typeof row !== "object") return null;
  if (typeof (row as { id?: unknown }).id !== "string") return null;
  return row as T;
}
