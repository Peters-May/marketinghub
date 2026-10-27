import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_CHECKLIST_KEYS,
  applyAttendanceOpsUpdate,
  attendanceChecklistProgress,
  emptyAttendanceOpsFields,
  formatAttendanceChecklistCount,
  patchAttendanceChecklist,
  readAttendanceOpsFields,
} from "@/lib/events/attendance-checklist";

describe("attendance checklist", () => {
  it("counts hotel booking and leaves N/A items out of the total", () => {
    const progress = attendanceChecklistProgress({
      accommodation_arranged: true,
      attendance_checklist_na: {
        hotel_booked: true,
        stand_or_passes_booked: true,
      },
    });
    expect(ATTENDANCE_CHECKLIST_KEYS).toHaveLength(8);
    expect(progress).toEqual({ done: 1, total: 6, na: 2 });
    expect(formatAttendanceChecklistCount(progress)).toBe("1/6");
  });

  it("hides hotel booking until accommodation is arranged", () => {
    const hidden = attendanceChecklistProgress({
      social_media_post_completed: true,
    });
    expect(hidden).toEqual({ done: 1, total: 7, na: 0 });

    const shown = attendanceChecklistProgress({
      accommodation_arranged: true,
      social_media_post_completed: true,
    });
    expect(shown).toEqual({ done: 2, total: 8, na: 0 });
  });

  it("treats a fully N/A checklist as complete", () => {
    const attendance_checklist_na = Object.fromEntries(
      ATTENDANCE_CHECKLIST_KEYS.map((key) => [key, true])
    );
    const progress = attendanceChecklistProgress({ attendance_checklist_na });
    expect(progress).toEqual({ done: 0, total: 0, na: 7 });
    expect(progress.done >= progress.total).toBe(true);
    expect(formatAttendanceChecklistCount(progress)).toBe("N/A");
  });

  it("clears done when an item is marked N/A, and the reverse", () => {
    const current = {
      ...emptyAttendanceOpsFields(),
      accommodation_arranged: true,
    };
    const na = patchAttendanceChecklist(current, "accommodation_arranged", "na");
    expect(na.accommodation_arranged).toBe(false);
    expect(na.attendance_checklist_na?.accommodation_arranged).toBe(true);

    const done = patchAttendanceChecklist(
      { ...current, ...na },
      "accommodation_arranged",
      "done"
    );
    expect(done.accommodation_arranged).toBe(true);
    expect(done.attendance_checklist_na?.accommodation_arranged).toBeUndefined();
  });

  it("keeps earlier ticks when several boxes change before a save", () => {
    const first = applyAttendanceOpsUpdate(
      emptyAttendanceOpsFields(),
      (current) =>
        patchAttendanceChecklist(current, "accommodation_arranged", "na")
    );
    const second = applyAttendanceOpsUpdate(
      first.fields,
      (current) => patchAttendanceChecklist(current, "costs_collected", "done"),
      first.patch
    );
    expect(second.fields.accommodation_arranged).toBe(false);
    expect(second.fields.costs_collected).toBe(true);
    expect(second.fields.attendance_checklist_na.accommodation_arranged).toBe(
      true
    );
    expect(second.patch.costs_collected).toBe(true);
    expect(second.patch.attendance_checklist_na?.accommodation_arranged).toBe(
      true
    );
  });

  it("drops a done flag when the same item is stored as N/A", () => {
    const fields = readAttendanceOpsFields({
      hotel_booked: true,
      attendance_checklist_na: { hotel_booked: true, unknown: true },
    });
    expect(fields.hotel_booked).toBe(false);
    expect(fields.attendance_checklist_na).toEqual({ hotel_booked: true });
  });
});
