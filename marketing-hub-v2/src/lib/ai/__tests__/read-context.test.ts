import { describe, expect, it } from "vitest";
import { formatHubCatalogue } from "@/lib/ai/read-context";
import type { EventItem } from "@/lib/types";

function event(partial: Partial<EventItem> & Pick<EventItem, "id" | "title">): EventItem {
  return {
    starts_at: null,
    ends_at: null,
    location: "",
    event_type: "Event",
    division: "",
    notes: "",
    link_url: "",
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
    hotel_name: "",
    hotel_confirmation: "",
    hotel_check_in: "",
    hotel_check_out: "",
    hotel_guests: "",
    hotel_cost_estimate: "",
    hotel_booking_url: "",
    hotel_notes: "",
    created_by: null,
    created_at: "",
    updated_at: "",
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
    ...partial,
  };
}

describe("formatHubCatalogue", () => {
  it("lists every event, including shows with nobody attending", () => {
    const text = formatHubCatalogue(
      {
        events: [
          event({
            id: "a",
            title: "Miami Boat Show",
            starts_at: "2027-02-10",
            ends_at: "2027-02-14",
            location: "Miami",
            pm_attending: false,
          }),
          event({
            id: "b",
            title: "Quiet Show",
            starts_at: "2027-06-01",
            location: "Oslo",
          }),
        ],
        event_attendance: [
          {
            id: "att",
            event_id: "a",
            user_id: "u",
            user_name: "Simon Judson",
            attendance_status: "attending",
            created_at: "",
            updated_at: "",
          },
        ],
        tasks: [],
        content: [],
        contacts: [{}, {}, {}],
      },
      "2026-10-26"
    );

    expect(text).toContain("Events (2, complete)");
    expect(text).toContain("2027-02-10 to 2027-02-14 | Miami Boat Show");
    expect(text).toContain("Simon Judson (attending)");
    expect(text).toContain("We are attending not checked");
    expect(text).toContain("Quiet Show");
    expect(text).toContain("no named people");
    expect(text).toContain("Contacts are not listed (3 records)");
    expect(text).not.toContain("not the full calendar");
  });
});
