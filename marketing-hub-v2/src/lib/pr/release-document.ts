/** Single-line or multiline plain text for a press release field. */
export function plainReleaseField(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, max);
}

export function pressReleaseDate(value: unknown): string | null {
  const raw = String(value ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function pressReleaseSaveError(input: {
  title: string;
  status: unknown;
}): string | null {
  if (!input.title.trim()) return "Add a headline before saving.";
  if (input.status !== "draft" && input.status !== "published") {
    return "Save as a draft or publish to the newsroom.";
  }
  return null;
}

export function formatReleaseDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Traditional dateline, e.g. LONDON, 26 October 2026. */
export function pressReleaseDateline(
  location: string,
  iso: string | null | undefined
): string {
  const place = location.trim();
  const date = formatReleaseDate(iso);
  if (place && date) return `${place.toUpperCase()}, ${date}`;
  if (place) return place.toUpperCase();
  return date;
}
