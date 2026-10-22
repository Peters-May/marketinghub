import { describe, expect, it } from "vitest";
import { planDailyWork } from "@/lib/automation/plan";
import { presentBooking } from "@/lib/events/bookings";
import { participationOf } from "@/lib/events/participation";
import { emptyAttendanceOpsFields } from "@/lib/events/attendance-checklist";
import { emptyPlannerFields } from "@/lib/events/planner";
import type { EventBooking, EventItem, HubTask } from "@/lib/types";

function event(partial: Partial<EventItem> & Pick<EventItem, "id" | "title">): EventItem {
  return {
    ...emptyPlannerFields(),
    ...emptyAttendanceOpsFields(),
    starts_at: "2026-11-01T00:00:00.000Z",
    ends_at: null,
    location: "",
    event_type: "Boat show",
    division: "",
    notes: "",
    link_url: "",
    created_by: null,
    created_at: "",
    updated_at: "",
    ...partial,
  };
}

describe("event participation", () => {
  it("uses company attendance and the RSVP mix", () => {
    const watching = event({ id: "e1", title: "Watch", pm_attending: false });
    expect(participationOf(watching, [])).toBe("watching");
    const going = event({ id: "e2", title: "Go", pm_attending: true });
    expect(
      participationOf(going, [
        {
          event_id: "e2",
          attendance_status: "attending",
        },
        {
          event_id: "e2",
          attendance_status: "not_attending",
        },
      ])
    ).toBe("mixed");
    expect(participationOf(going, [])).toBe("attending");
  });
});

describe("booking references", () => {
  const booking: EventBooking = {
    id: "b1",
    event_id: "e1",
    kind: "flight",
    attendee_user_id: "user-a",
    attendee_name: "Alex",
    label: "LHR to NCE",
    reference: "ABC123",
    starts_on: "",
    ends_on: "",
    cost_estimate: "",
    url: "",
    notes: "",
    created_at: "",
    updated_at: "",
  };

  it("hides the reference from someone else", () => {
    expect(presentBooking(booking, { id: "user-b", isAdmin: false }).reference).toBe("");
    expect(presentBooking(booking, { id: "user-a", isAdmin: false }).reference).toBe("ABC123");
    expect(presentBooking(booking, { id: "user-b", isAdmin: true }).reference).toBe("ABC123");
  });
});

describe("daily reminders", () => {
  it("does not plan a second preparation task for the same event", () => {
    const show = event({ id: "e1", title: "FLIBS", pm_attending: true });
    const existing: HubTask = {
      id: "t1",
      title: "Prepare for FLIBS",
      details: "",
      start_date: null,
      due_date: "2026-11-01",
      category: "",
      status: "todo",
      owner: "",
      related_type: "event",
      related_id: "e1",
      automation_key: "event-prep:e1",
      created_at: "",
      updated_at: "",
    };
    const first = planDailyWork({
      now: new Date("2026-10-22T09:00:00.000Z"),
      events: [show],
      attendance: [],
      tasks: [],
      rules: [],
    });
    expect(first.tasks.map((task) => task.automation_key)).toEqual(["event-prep:e1"]);
    const second = planDailyWork({
      now: new Date("2026-10-22T09:00:00.000Z"),
      events: [show],
      attendance: [],
      tasks: [existing],
      rules: [],
    });
    expect(second.tasks).toEqual([]);
  });
});
