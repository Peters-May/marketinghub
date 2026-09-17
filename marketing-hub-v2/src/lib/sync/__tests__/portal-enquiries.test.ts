import { describe, expect, it } from "vitest";
import {
  isPortalEnquirySyncConfigured,
  whatsAppEnquiryToPortalSyncBody,
} from "@/lib/sync/portal-enquiries";
import type { WhatsAppEnquiry } from "@/lib/types";

const sample: WhatsAppEnquiry = {
  id: "wa1",
  external_id: "WA-42",
  created_at: "2026-09-01T10:00:00.000Z",
  sent_to_office_at: "2026-09-01T10:00:00.000Z",
  follow_up_at: null,
  customer_name: "Ada",
  company: "PM",
  customer_email: "ada@example.com",
  customer_phone: "+440000",
  customer_country: "GB",
  category: "Yacht",
  service: "Yacht transport",
  vessel_cargo: "Motor yacht",
  collection_location: "Antibes",
  delivery_location: "Fort Lauderdale",
  dimensions: "30m",
  declared_value: "1m",
  preferred_timeframe: "Oct",
  selected_office: "Southampton",
  office_email: "sales@example.com",
  tracker_status: "Sent to office",
  email_subject: "WhatsApp Enquiry",
  source: "mcp",
  message: "Hello",
  notes: "Chase Friday",
  needs_manual_review: false,
  is_test: false,
  status: "in_progress",
  raw_payload: { source: "mcp" },
  received_at: "2026-09-01T10:00:00.000Z",
  updated_at: "2026-09-01T10:00:00.000Z",
};

describe("portal-enquiries sync helpers", () => {
  it("maps WhatsApp enquiry for hub-sync", () => {
    const body = whatsAppEnquiryToPortalSyncBody(sample);
    expect(body.channel).toBe("whatsapp");
    expect(body.external_id).toBe("WA-42");
    expect(body.customer_email).toBe("ada@example.com");
    expect(body.message).toBe("Hello");
    expect(body.tracker_status).toBe("Sent to office");
  });

  it("reports sync unconfigured without env", () => {
    expect(isPortalEnquirySyncConfigured()).toBe(false);
  });
});
