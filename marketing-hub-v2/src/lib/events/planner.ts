/**
 * Yacht transport fields on Marketing Hub events.
 * Existing event types stay as they are. Planner category is a separate field.
 */

export const PLANNER_CATEGORIES = [
  "Yacht Racing",
  "Regatta",
  "Boat Show",
  "Superyacht Event",
  "Charter Show",
  "Rendezvous",
  "Cruising Event",
  "Industry Event",
  "Peters & May Event",
  "Other",
] as const;

export const PLANNER_DATE_STATUSES = [
  { value: "confirmed", label: "Confirmed" },
  { value: "provisional", label: "Provisional" },
  { value: "tbc", label: "Date TBC" },
] as const;

export const PLANNER_PRIORITIES = [
  { value: "featured", label: "Featured" },
  { value: "standard", label: "Standard" },
  { value: "supporting", label: "Supporting" },
] as const;

/** Region labels shared with the public planner. Stored as these slugs. */
export const PLANNER_REGIONS = [
  { value: "caribbean", label: "Caribbean" },
  { value: "mediterranean", label: "Mediterranean" },
  { value: "northern-europe", label: "Northern Europe" },
  { value: "uk", label: "UK" },
  { value: "north-america", label: "North America" },
  { value: "middle-east", label: "Middle East" },
  { value: "asia-pacific", label: "Asia Pacific" },
] as const;

export type PlannerFields = {
  transport_relevant: boolean;
  show_in_transport_planner: boolean;
  planner_category: string;
  recommended_arrival_start: string | null;
  recommended_arrival_end: string | null;
  transport_destination_region: string;
  transport_destination_port: string;
  transport_origin_regions: string[];
  planner_priority: string;
  date_status: string;
  recurring_event: boolean;
  event_series_id: string;
  planner_slug: string;
  /** Internal. Never included on the public feed. */
  pm_attendance: string;
};

export function emptyPlannerFields(): PlannerFields {
  return {
    transport_relevant: false,
    show_in_transport_planner: false,
    planner_category: "",
    recommended_arrival_start: null,
    recommended_arrival_end: null,
    transport_destination_region: "",
    transport_destination_port: "",
    transport_origin_regions: [],
    planner_priority: "standard",
    date_status: "confirmed",
    recurring_event: false,
    event_series_id: "",
    planner_slug: "",
    pm_attendance: "",
  };
}

const CATEGORY_MAP: Record<string, string> = {
  Race: "Yacht Racing",
  "Boat show": "Boat Show",
  "Trade show": "Industry Event",
  Conference: "Industry Event",
};

export function mapPlannerCategory(
  eventType: string,
  plannerCategory: string
): string {
  const chosen = (plannerCategory || "").trim();
  if (chosen && (PLANNER_CATEGORIES as readonly string[]).includes(chosen)) {
    return chosen;
  }
  return CATEGORY_MAP[eventType] || "Other";
}

export function slugifyPlanner(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function suggestPlannerSlug(title: string, startsAt: string | null): string {
  const year = startsAt ? new Date(startsAt).getUTCFullYear() : NaN;
  const base = slugifyPlanner(title || "event");
  if (!base) return Number.isFinite(year) ? `event-${year}` : "event";
  return Number.isFinite(year) ? `${base}-${year}` : base;
}

function asDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/** Fill planner fields on records saved before the fields existed. */
export function readPlannerFields(raw: Partial<PlannerFields> | null | undefined): PlannerFields {
  const base = emptyPlannerFields();
  if (!raw || typeof raw !== "object") return base;
  const dateStatus = String(raw.date_status || base.date_status);
  const priority = String(raw.planner_priority || base.planner_priority);
  return {
    transport_relevant: raw.transport_relevant === true,
    show_in_transport_planner: raw.show_in_transport_planner === true,
    planner_category: String(raw.planner_category || ""),
    recommended_arrival_start: asDate(raw.recommended_arrival_start),
    recommended_arrival_end: asDate(raw.recommended_arrival_end),
    transport_destination_region: String(raw.transport_destination_region || ""),
    transport_destination_port: String(raw.transport_destination_port || ""),
    transport_origin_regions: asStringArray(raw.transport_origin_regions),
    planner_priority: (PLANNER_PRIORITIES as readonly { value: string }[]).some(
      (p) => p.value === priority
    )
      ? priority
      : "standard",
    date_status: (PLANNER_DATE_STATUSES as readonly { value: string }[]).some(
      (s) => s.value === dateStatus
    )
      ? dateStatus
      : "confirmed",
    recurring_event: raw.recurring_event === true,
    event_series_id: String(raw.event_series_id || ""),
    planner_slug: slugifyPlanner(String(raw.planner_slug || "")),
    pm_attendance: String(raw.pm_attendance || ""),
  };
}

export type PlannerEventInput = PlannerFields & {
  id: string;
  title: string;
  starts_at: string | null;
  ends_at: string | null;
  location: string;
  event_type: string;
  link_url: string;
  updated_at: string;
};

export type PublicPlannerEvent = {
  id: string;
  slug: string;
  name: string;
  category: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  date_status: string;
  location: string;
  url: string;
  recommended_arrival_start: string | null;
  recommended_arrival_end: string | null;
  destination_region: string;
  destination_port: string;
  origin_regions: string[];
  priority: string;
  updated_at: string;
};

/**
 * Public payload. Returns null unless both visibility flags are true.
 * Notes, attendance and checklist flags are never included.
 */
export function toPublicPlannerEvent(
  event: PlannerEventInput
): PublicPlannerEvent | null {
  const planner = readPlannerFields(event);
  if (!planner.transport_relevant || !planner.show_in_transport_planner) {
    return null;
  }
  const starts = event.starts_at;
  const dateStatus = !starts ? "tbc" : planner.date_status || "confirmed";
  return {
    id: event.id,
    slug: planner.planner_slug || suggestPlannerSlug(event.title, starts),
    name: event.title,
    category: mapPlannerCategory(event.event_type, planner.planner_category),
    event_type: event.event_type,
    starts_at: dateStatus === "tbc" ? null : starts,
    ends_at: dateStatus === "tbc" ? null : event.ends_at,
    date_status: dateStatus,
    location: event.location || "",
    url: event.link_url || "",
    recommended_arrival_start: planner.recommended_arrival_start,
    recommended_arrival_end: planner.recommended_arrival_end,
    destination_region: planner.transport_destination_region,
    destination_port: planner.transport_destination_port,
    origin_regions: planner.transport_origin_regions,
    priority: planner.planner_priority || "standard",
    updated_at: event.updated_at,
  };
}

export function plannerFieldsFromBody(body: Record<string, unknown>): PlannerFields {
  const current = readPlannerFields(body as Partial<PlannerFields>);
  const starts = typeof body.starts_at === "string" ? body.starts_at : null;
  const title = typeof body.title === "string" ? body.title : "";
  if (!current.planner_slug) {
    current.planner_slug = suggestPlannerSlug(title, starts);
  }
  if (
    ("starts_at" in body && !body.starts_at) &&
    current.date_status === "confirmed"
  ) {
    current.date_status = "tbc";
  }
  return current;
}
