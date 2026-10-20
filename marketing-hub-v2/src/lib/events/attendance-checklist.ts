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
] as const;

export type AttendanceChecklistKey = (typeof ATTENDANCE_CHECKLIST_KEYS)[number];

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
  ...emptyHotelFields(),
});

export function readAttendanceOpsFields(
  raw: Partial<EventItem> | null | undefined
): EventAttendanceOpsFields {
  const r = raw ?? {};
  return {
    pm_attending: Boolean(r.pm_attending),
    accommodation_arranged: Boolean(r.accommodation_arranged),
    costs_collected: Boolean(r.costs_collected),
    stand_or_passes_booked: Boolean(r.stand_or_passes_booked),
    press_kit_ready: Boolean(r.press_kit_ready),
    social_media_post_completed: Boolean(r.social_media_post_completed),
    personal_social_media_graphics_completed: Boolean(
      r.personal_social_media_graphics_completed
    ),
    reached_out_for_pr_to_organisers: Boolean(r.reached_out_for_pr_to_organisers),
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

export function attendanceChecklistProgress(event: Partial<EventItem>): {
  done: number;
  total: number;
} {
  const done = ATTENDANCE_CHECKLIST_KEYS.filter((key) => Boolean(event[key]))
    .length;
  return { done, total: ATTENDANCE_CHECKLIST_KEYS.length };
}
