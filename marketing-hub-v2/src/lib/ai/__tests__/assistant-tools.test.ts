import { beforeEach, describe, expect, it, vi } from "vitest";

const readStore = vi.fn();

vi.mock("@/lib/store/local", () => ({
  readStore: () => readStore(),
}));

vi.mock("@/lib/data/web-enquiries", () => ({
  listWebEnquiries: async () => [],
}));

vi.mock("@/lib/data/whatsapp-enquiries", () => ({
  listWhatsAppEnquiries: async () => [],
}));

vi.mock("@/lib/data/web-enquiries-stats", () => ({
  computeEnquiryStats: () => ({
    total: 0,
    thisWeek: 0,
    thisMonth: 0,
    needsReview: 0,
    googleAds: 0,
    topSources: [],
    byOffice: [],
    googleAdsByReferrer: [],
  }),
}));

import {
  toolEventOutstanding,
  toolHubHowTo,
  toolSearchTasks,
} from "@/lib/ai/assistant-tools";

describe("assistant read tools", () => {
  beforeEach(() => {
    readStore.mockReset();
    readStore.mockResolvedValue({
      events: [
        {
          id: "evt1",
          title: "Fort Lauderdale Boat Show",
          starts_at: "2026-10-28",
          ends_at: "2026-11-01",
          location: "Fort Lauderdale",
          event_type: "Show",
          pm_attending: true,
          hotel_booked: false,
          costs_collected: false,
          stand_or_passes_booked: false,
          press_kit_ready: false,
          social_media_post_completed: false,
        },
      ],
      event_attendance: [],
      event_cost_lines: [
        {
          id: "c1",
          event_id: "evt1",
          category: "travel",
          description: "Flights",
          amount: 500,
          currency: "GBP",
          staff_user_id: null,
          staff_name: "Sophie",
          notes: "",
          created_at: "",
          updated_at: "",
        },
      ],
      event_content: [],
      content: [],
      tasks: [
        {
          id: "t1",
          title: "Book hotel",
          details: "",
          start_date: null,
          due_date: "2020-01-01",
          category: "",
          status: "open",
          owner: "Sophie",
          owner_user_id: "u1",
          related_type: "event",
          related_id: "evt1",
          created_at: "",
          updated_at: "",
        },
      ],
      paid_campaigns: [],
      email_campaigns: [],
      contacts: [],
      budget_lines: [],
      budget_payments: [],
      awards: [],
    });
  });

  it("loads related outstanding work for an event", async () => {
    const result = await toolEventOutstanding({
      eventQuery: "Fort Lauderdale",
    });
    expect(result.found).toBe(true);
    if (!("found" in result) || !result.found) return;
    expect(result.costs?.totals_by_currency[0]).toEqual({
      currency: "GBP",
      total: 500,
    });
    expect(result.open_tasks?.[0]?.title).toBe("Book hotel");
  });

  it("finds overdue tasks", async () => {
    const result = await toolSearchTasks({ overdueOnly: true });
    expect(result.count).toBe(1);
    expect(result.items[0]?.title).toBe("Book hotel");
  });

  it("returns how-to topics", () => {
    const result = toolHubHowTo({
      query: "create a campaign",
      pathname: "/app",
    });
    expect(result.topics[0]?.href).toMatch(/\/app\//);
  });
});
