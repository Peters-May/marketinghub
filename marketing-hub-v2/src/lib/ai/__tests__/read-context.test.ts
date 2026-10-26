import { describe, expect, it } from "vitest";
import { formatHubCatalogue, formatMemberCatalogue } from "@/lib/ai/read-context";
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
    expect(text).toContain("Content linked to events (0, complete)");
    expect(text).not.toContain("not the full calendar");
  });

  it("lists post captions and posts already linked to an event", () => {
    const text = formatHubCatalogue(
      {
        events: [
          event({
            id: "a",
            title: "Monaco Yacht Show",
            starts_at: "2026-09-23",
            location: "Monaco",
          }),
        ],
        content: [
          {
            id: "post-1",
            title: "Stand photo",
            channel: ["LinkedIn"],
            content_type: "Social",
            owner: "Sophie",
            due_date: "2026-09-20",
            deadline_date: null,
            status: "published",
            category: "",
            priority: "",
            website: "",
            caption: "On the stand at Monaco Yacht Show this week.",
            theme_id: null,
            planable_url: "",
            planable_post_id: "",
            planable_group_id: "",
            planable_page_ids: [],
            last_synced_at: null,
            sync_source: "",
            asset_url: "",
            notes: "",
            created_at: "",
            updated_at: "",
          },
        ],
        event_content: [
          {
            id: "link-1",
            event_id: "a",
            content_id: "post-1",
            created_at: "",
          },
        ],
      },
      "2026-10-26"
    );

    expect(text).toContain("On the stand at Monaco Yacht Show this week.");
    expect(text).toContain("Content linked to events (1, complete)");
    expect(text).toContain("Monaco Yacht Show | Stand photo");
  });

  it("keeps the member catalogue to titles and enquiry totals", () => {
    const text = formatMemberCatalogue({
      today: "2026-10-26",
      enquiryLines: ["Web enquiries: 12 total, 2 this week."],
      events: [
        event({
          id: "a",
          title: "Miami Boat Show",
          starts_at: "2027-02-10",
          location: "Miami",
        }),
      ],
      content: [
        {
          title: "Autumn yacht moves",
          status: "scheduled",
          due_date: "2026-11-01",
          channel: ["LinkedIn"],
        },
        {
          title: "Hidden draft",
          status: "draft",
          due_date: null,
          channel: ["LinkedIn"],
        },
      ],
      resources: [{ title: "Brand portal", category: "Links" }],
    });

    expect(text).toContain("Web enquiries: 12 total");
    expect(text).toContain("Miami Boat Show");
    expect(text).toContain("Autumn yacht moves");
    expect(text).toContain("Brand portal");
    expect(text).not.toContain("Hidden draft");
    expect(text).not.toContain("Budget");
    expect(text).toContain("Do not save records");
  });
});
