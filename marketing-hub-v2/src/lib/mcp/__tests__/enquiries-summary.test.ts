import { describe, expect, it } from "vitest";
import { toEnquirySummary } from "@/lib/mcp/enquiries";
import type { HubEnquiry } from "@/lib/types";

function webEnquiry(overrides: Partial<HubEnquiry> = {}): HubEnquiry {
  return {
    id: "web1",
    submission_id: "sub-1",
    channel: "web",
    created_at: "2026-03-01T10:00:00.000Z",
    customer_name: "Alex",
    customer_email: "alex@example.com",
    customer_phone: "",
    customer_country: "GB",
    final_service_category: "Yacht transport",
    user_selected_service: "Yacht transport",
    collection_location: "Southampton",
    delivery_location: "Antibes",
    selected_office: "Southampton",
    office_email: "sales@example.com",
    needs_manual_review: false,
    marketing_emails_consent: false,
    routing_reason: "",
    is_test: false,
    status: "new",
    make_fields: {},
    raw_payload: {
      tracking: {
        gclid: "click-123",
        utm_source: "google",
        utm_medium: "cpc",
        utm_campaign: "yacht-spring",
        current_page_url:
          "https://www.petersandmay.com/quote?utm_campaign=yacht-spring&gclid=click-123",
      },
    },
    received_at: "2026-03-01T10:00:00.000Z",
    updated_at: "2026-03-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("toEnquirySummary attribution", () => {
  it("maps tracking payload onto Google Ads fields for web enquiries", () => {
    const summary = toEnquirySummary(webEnquiry());
    expect(summary.source).toBe("google_ads");
    expect(summary.marketing_source).toBe("Google Ads");
    expect(summary.is_google_ads).toBe(true);
    expect(summary.gclid).toBe("click-123");
    expect(summary.tracking.gclid).toBe("click-123");
    expect(summary.tracking.utm_campaign).toBe("yacht-spring");
    expect(summary.utm_source).toBe("google");
    expect(summary.utm_medium).toBe("cpc");
    expect(summary.utm_campaign).toBe("yacht-spring");
    expect(summary.campaign).toBe("yacht-spring");
    expect(summary).not.toHaveProperty("raw_payload");
  });

  it("keeps a WhatsApp tracker source when one is set", () => {
    const summary = toEnquirySummary(
      webEnquiry({
        channel: "whatsapp",
        tracker_source: "WhatsApp",
        raw_payload: { message: "Hello" },
      })
    );
    expect(summary.source).toBe("WhatsApp");
    expect(summary.marketing_source).toBe("WhatsApp");
    expect(summary.is_google_ads).toBe(false);
    expect(summary.gclid).toBe("");
  });
});
