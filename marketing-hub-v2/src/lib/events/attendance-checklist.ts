import type { EventItem } from "@/lib/types";

/** Checklist items counted when `pm_attending` (excludes the gate itself). */
export const ATTENDANCE_CHECKLIST_KEYS = [
  "accommodation_arranged",
  "costs_collected",
  "stand_or_passes_booked",
  "reached_out_for_pr_to_organisers",
  "press_kit_ready",
  "social_media_post_completed",
  "personal_social_media_graphics_completed",
  "hotel_booked",
] as const;

export type AttendanceChecklistKey = (typeof ATTENDANCE_CHECKLIST_KEYS)[number];

/** Open, done, or not applicable. N/A items are left out of the count. */
export type AttendanceChecklistMark = "open" | "done" | "na";

export const ATTENDANCE_CHECKLIST_LABELS: Record<
  AttendanceChecklistKey,
  string
> = {
  accommodation_arranged: "Accommodation arranged",
  costs_collected: "Costs collected",
  stand_or_passes_booked: "Stand / passes booked",
  reached_out_for_pr_to_organisers: "PR outreach to organisers",
  press_kit_ready: "Press kit ready",
  social_media_post_completed: "Company social post done",
  personal_social_media_graphics_completed: "Staff social graphics done",
  hotel_booked: "Hotel booking",
};

export type EventHotelFields = Pick<
  EventItem,
  | "hotel_name"
  | "hotel_confirmation"
  | "hotel_check_in"
  | "hotel_check_out"
  | "hotel_guests"
  | "hotel_cost_estimate"
  | "hotel_booking_url"
  | "hotel_notes"
>;

export type EventAttendanceOpsFields = Pick<
  EventItem,
  | "pm_attending"
  | "attendance_checklist_na"
  | AttendanceChecklistKey
  | keyof EventHotelFields
>;

export const emptyHotelFields = (): EventHotelFields => ({
  hotel_name: "",
  hotel_confirmation: "",
  hotel_check_in: "",
  hotel_check_out: "",
  hotel_guests: "",
  hotel_cost_estimate: "",
  hotel_booking_url: "",
  hotel_notes: "",
});

export const emptyAttendanceOpsFields = (): EventAttendanceOpsFields => ({
  pm_attending: false,
  accommodation_arranged: false,
  costs_collected: false,
  stand_or_passes_booked: false,
  press_kit_ready: false,
  social_media_post_completed: false,
  personal_social_media_graphics_completed: false,
  reached_out_for_pr_to_organisers: false,
  hotel_booked: false,
  attendance_checklist_na: {},
  ...emptyHotelFields(),
});

export function readAttendanceChecklistNa(
  raw: unknown
): Partial<Record<AttendanceChecklistKey, boolean>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const source = raw as Record<string, unknown>;
  const out: Partial<Record<AttendanceChecklistKey, boolean>> = {};
  for (const key of ATTENDANCE_CHECKLIST_KEYS) {
    if (source[key] === true) out[key] = true;
  }
  return out;
}

export function readAttendanceOpsFields(
  raw: Partial<EventItem> | null | undefined
): EventAttendanceOpsFields {
  const r = raw ?? {};
  const attendance_checklist_na = readAttendanceChecklistNa(
    r.attendance_checklist_na
  );
  const done = (key: AttendanceChecklistKey) =>
    attendance_checklist_na[key] ? false : Boolean(r[key]);
  return {
    pm_attending: Boolean(r.pm_attending),
    accommodation_arranged: done("accommodation_arranged"),
    costs_collected: done("costs_collected"),
    stand_or_passes_booked: done("stand_or_passes_booked"),
    press_kit_ready: done("press_kit_ready"),
    social_media_post_completed: done("social_media_post_completed"),
    personal_social_media_graphics_completed: done(
      "personal_social_media_graphics_completed"
    ),
    reached_out_for_pr_to_organisers: done("reached_out_for_pr_to_organisers"),
    hotel_booked: done("hotel_booked"),
    attendance_checklist_na,
    hotel_name: String(r.hotel_name ?? ""),
    hotel_confirmation: String(r.hotel_confirmation ?? ""),
    hotel_check_in: String(r.hotel_check_in ?? ""),
    hotel_check_out: String(r.hotel_check_out ?? ""),
    hotel_guests: String(r.hotel_guests ?? ""),
    hotel_cost_estimate: String(r.hotel_cost_estimate ?? ""),
    hotel_booking_url: String(r.hotel_booking_url ?? ""),
    hotel_notes: String(r.hotel_notes ?? ""),
  };
}

export function attendanceChecklistMark(
  event: Partial<EventItem>,
  key: AttendanceChecklistKey
): AttendanceChecklistMark {
  if (event.attendance_checklist_na?.[key] === true) return "na";
  if (event[key] === true) return "done";
  return "open";
}

/** Toggle one checklist row. N/A clears the done flag; done clears N/A. */
export function patchAttendanceChecklist(
  current: Pick<
    EventAttendanceOpsFields,
    AttendanceChecklistKey | "attendance_checklist_na"
  >,
  key: AttendanceChecklistKey,
  mark: AttendanceChecklistMark
): Partial<EventAttendanceOpsFields> {
  const attendance_checklist_na = {
    ...(current.attendance_checklist_na ?? {}),
  };
  if (mark === "na") attendance_checklist_na[key] = true;
  else delete attendance_checklist_na[key];
  const patch: Partial<EventAttendanceOpsFields> = {
    attendance_checklist_na,
  };
  patch[key] = mark === "done";
  return patch;
}

export function attendanceChecklistProgress(event: Partial<EventItem>): {
  done: number;
  total: number;
  na: number;
} {
  let done = 0;
  let na = 0;
  for (const key of ATTENDANCE_CHECKLIST_KEYS) {
    const mark = attendanceChecklistMark(event, key);
    if (mark === "na") na += 1;
    else if (mark === "done") done += 1;
  }
  return { done, total: ATTENDANCE_CHECKLIST_KEYS.length - na, na };
}

/** `3/8`, or `N/A` when every item is marked not applicable. */
export function formatAttendanceChecklistCount(progress: {
  done: number;
  total: number;
}): string {
  if (progress.total === 0) return "N/A";
  return `${progress.done}/${progress.total}`;
}
