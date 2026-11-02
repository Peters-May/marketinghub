import { describe, expect, it } from "vitest";
import {
  computeEnquiryStatsFromFacts,
  enquiryToFact,
} from "@/lib/data/enquiry-facts";
import {
  computeEnquiryStats,
  computeEnquiryYearCompare,
} from "@/lib/data/web-enquiries-stats";
import { factsForYearCompare } from "@/lib/data/enquiry-facts";
import type { HubEnquiry } from "@/lib/types";

function enquiry(
  id: string,
  createdAt: string,
  overrides: Partial<HubEnquiry> = {}
): HubEnquiry {
  return {
    id,
    submission_id: id,
    channel: "web",
    created_at: createdAt,
    customer_name: "Alex",
    customer_email: "alex@example.com",
    customer_phone: "",
    customer_country: "GB",
    final_service_category: "Yacht transport",
    user_selected_service: "Yacht transport",
    collection_location: "Southampton",
    delivery_location: "Antibes",
    selected_office: "UK",
    office_email: "",
    needs_manual_review: false,
    marketing_emails_consent: false,
    routing_reason: "",
    is_test: false,
    status: "new",
    make_fields: {},
    raw_payload: {},
    received_at: createdAt,
    updated_at: createdAt,
    ...overrides,
  };
}

describe("enquiry facts", () => {
  const rows = [
    enquiry("jan", "2026-01-15T10:00:00.000Z"),
    enquiry("oct", "2026-10-20T10:00:00.000Z", {
      selected_office: "Spain",
      raw_payload: {
        tracking: {
          gclid: "click",
          utm_source: "google",
          utm_medium: "cpc",
          utm_campaign: "yacht-spring",
        },
      },
    }),
    enquiry("nov", "2026-11-02T10:00:00.000Z"),
  ];

  it("counts every enquiry, not just the first page", () => {
    const facts = rows.map(enquiryToFact);
    const now = new Date("2026-11-02T12:00:00.000Z");
    const full = computeEnquiryStatsFromFacts(facts, { includeTest: true, now });
    const page = computeEnquiryStats(rows.slice(0, 1), { includeTest: true });

    expect(full.total).toBe(3);
    expect(page.total).toBe(1);
    expect(full.byOffice.map((row) => row.label).sort()).toEqual([
      "Spain",
      "UK",
    ]);
    expect(full.googleAds).toBe(1);
  });

  it("keeps earlier months in the year history", () => {
    const compare = computeEnquiryYearCompare(factsForYearCompare(rows.map(enquiryToFact)), {
      includeTest: true,
      now: new Date("2026-11-02T12:00:00.000Z"),
    });
    const yearIndex = compare.years.indexOf(2026);
    expect(compare.months[0]?.[yearIndex]).toBe(1);
    expect(compare.months[9]?.[yearIndex]).toBe(1);
    expect(compare.months[10]?.[yearIndex]).toBe(1);
  });
});
