import type { ContentItem, ContentStatus } from "@/lib/types";
import { isPressRelease } from "@/lib/pr/pipeline";

/** Statuses the press release editor can save. Ready is stored as approved. */
export const RELEASE_EDITOR_STATUSES = [
  "draft",
  "approved",
  "scheduled",
  "published",
] as const;

export type ReleaseEditorStatus = (typeof RELEASE_EDITOR_STATUSES)[number];

export function isReleaseEditorStatus(
  value: unknown
): value is ReleaseEditorStatus {
  return RELEASE_EDITOR_STATUSES.includes(value as ReleaseEditorStatus);
}

export function releaseStatusLabel(status: string): string {
  if (status === "approved") return "Ready";
  if (status === "scheduled") return "Scheduled";
  if (status === "published") return "Published";
  if (status === "draft") return "Draft";
  return status;
}

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
  due_date?: string | null;
}): string | null {
  if (!input.title.trim()) return "Add a headline before saving.";
  if (!isReleaseEditorStatus(input.status)) {
    return "Choose draft, ready, scheduled, or published.";
  }
  if (input.status === "scheduled" && !input.due_date) {
    return "Add a date before scheduling the release.";
  }
  return null;
}

/** Calendar day in the UK, including British Summer Time. */
export function calendarDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True when the publish date is today or earlier in the UK. */
export function releaseDueOnOrBefore(
  due: string | null | undefined,
  now: Date
): boolean {
  const day = (due || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day <= calendarDay(now);
}

type ReleaseVisibility = Pick<
  ContentItem,
  "status" | "newsroom_name" | "due_date" | "content_type" | "category" | "channel"
>;

/** Filed only when a newsroom name is set. Missing and blank stay off the index. */
export function isFiledOnNewsroom(item: {
  newsroom_name?: string | null;
}): boolean {
  return (
    typeof item.newsroom_name === "string" && item.newsroom_name.trim() !== ""
  );
}

function onNewsroom(item: ReleaseVisibility): boolean {
  return isFiledOnNewsroom(item);
}

function liveStatus(item: ReleaseVisibility, now: Date): boolean {
  if (item.status === "published") return true;
  return item.status === "scheduled" && releaseDueOnOrBefore(item.due_date, now);
}

/** Public newsroom index: published or due scheduled stories filed on a newsroom. */
export function isNewsroomIndexRelease(
  item: ReleaseVisibility,
  now: Date = new Date()
): boolean {
  if (!isPressRelease(item)) return false;
  if (!onNewsroom(item)) return false;
  if (item.status === "published") return true;
  return item.status === "scheduled" && releaseDueOnOrBefore(item.due_date, now);
}

/**
 * Public story page. Published releases have a page. A scheduled release,
 * including one that is not filed on a newsroom, is public once its UK date
 * has arrived. Only filed releases appear on the newsroom index.
 */
export function isPublicReleasePage(
  item: ReleaseVisibility,
  now: Date = new Date()
): boolean {
  if (!isPressRelease(item)) return false;
  if (item.status === "published") return true;
  return liveStatus(item, now);
}

export function editorStatusFromContent(
  status: ContentStatus | string | undefined
): ReleaseEditorStatus {
  if (isReleaseEditorStatus(status)) return status;
  return "draft";
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
