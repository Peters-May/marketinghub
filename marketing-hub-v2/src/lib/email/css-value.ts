/**
 * Make a design value safe to place inside style="…". Keeps colours and
 * font stacks such as `'Source Sans 3', Arial, sans-serif`, but drops
 * anything that could close the attribute, start a tag, or add another
 * CSS declaration.
 */
export function cssValue(value: unknown, fallback = ""): string {
  const cleaned = String(value ?? "")
    .replace(/["<>;{}\\`]/g, "")
    .replace(/(url|expression|image-set|-webkit-image-set)\s*\(/gi, "")
    .replace(/[\r\n]/g, " ")
    .trim();
  return cleaned || fallback;
}

/** A finite number within bounds, for px and % values written into markup. */
export function cssNumber(value: unknown, fallback = 0, min = 0, max = 2000): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
