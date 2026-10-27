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

export function calendarDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True when the publish date is today or earlier in the local calendar. */
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

function onNewsroom(item: ReleaseVisibility): boolean {
  return item.newsroom_name !== "";
}

function liveStatus(item: ReleaseVisibility, now: Date): boolean {
  if (item.status === "published") return true;
  return (
    item.status === "scheduled" &&
    onNewsroom(item) &&
    releaseDueOnOrBefore(item.due_date, now)
  );
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
 * Public story page. A published standalone release has a page and stays off
 * the index. A scheduled release is public once its date has arrived and it
 * is filed on a newsroom.
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
