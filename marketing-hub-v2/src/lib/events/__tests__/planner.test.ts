import { describe, expect, it } from "vitest";
import {
  mapPlannerCategory,
  suggestPlannerSlug,
  toPublicPlannerEvent,
  type PlannerEventInput,
} from "../planner";

function event(partial: Partial<PlannerEventInput> = {}): PlannerEventInput {
  return {
    id: "evt_1",
    title: "Antigua Sailing Week",
    starts_at: "2027-04-24T00:00:00.000Z",
    ends_at: "2027-04-30T00:00:00.000Z",
    location: "Antigua",
    event_type: "Race",
    link_url: "https://example.com/asw",
    updated_at: "2027-01-01T00:00:00.000Z",
    transport_relevant: true,
    show_in_transport_planner: true,
    planner_category: "",
    recommended_arrival_start: "2027-04-10",
    recommended_arrival_end: "2027-04-15",
    transport_destination_region: "caribbean",
    transport_destination_port: "antigua",
    transport_origin_regions: ["mediterranean"],
    planner_priority: "featured",
    date_status: "confirmed",
    recurring_event: true,
    event_series_id: "antigua-sailing-week",
    planner_slug: "antigua-sailing-week-2027",
    pm_attendance: "Exhibiting",
    ...partial,
  };
}

describe("transport planner events", () => {
  it("hides an event unless both flags are true", () => {
    expect(toPublicPlannerEvent(event({ transport_relevant: false }))).toBeNull();
    expect(toPublicPlannerEvent(event({ show_in_transport_planner: false }))).toBeNull();
    expect(toPublicPlannerEvent(event())).not.toBeNull();
  });

  it("does not copy notes or attendance onto the public payload", () => {
    const pub = toPublicPlannerEvent(event());
    expect(pub).not.toHaveProperty("notes");
    expect(pub).not.toHaveProperty("pm_attendance");
    expect(JSON.stringify(pub)).not.toContain("Exhibiting");
  });

  it("maps the existing event type when no planner category is set", () => {
    expect(mapPlannerCategory("Race", "")).toBe("Yacht Racing");
    expect(mapPlannerCategory("Boat show", "")).toBe("Boat Show");
    expect(mapPlannerCategory("Trade show", "")).toBe("Industry Event");
    expect(mapPlannerCategory("Meeting", "")).toBe("Other");
    expect(mapPlannerCategory("Race", "Regatta")).toBe("Regatta");
  });

  it("uses the hub date on the public payload", () => {
    const pub = toPublicPlannerEvent(
      event({ starts_at: "2028-04-22T00:00:00.000Z" })
    );
    expect(pub?.starts_at).toBe("2028-04-22T00:00:00.000Z");
  });

  it("does not publish a date when the status is TBC", () => {
    const pub = toPublicPlannerEvent(
      event({ date_status: "tbc", starts_at: "2027-04-24T00:00:00.000Z" })
    );
    expect(pub?.starts_at).toBeNull();
    expect(pub?.date_status).toBe("tbc");
  });

  it("builds a stable slug from the title and year", () => {
    expect(suggestPlannerSlug("Antigua Sailing Week", "2027-04-24")).toBe(
      "antigua-sailing-week-2027"
    );
  });
});
